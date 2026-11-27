import type { Hex } from 'viem';

export interface Header { number: bigint; hash: Hex; parentHash: Hex; timestamp: number }
export interface MarketLog { address: Hex; blockNumber: Hex; blockHash: Hex; transactionHash: Hex; logIndex: Hex; topics: Hex[]; data: Hex; removed?: boolean }
export interface MarketRpc {
  chainId(): Promise<number>;
  header(tag: bigint | 'finalized'): Promise<Header>;
  logs(from: bigint, to: bigint, addresses: string[], topics: Hex[]): Promise<MarketLog[]>;
  call(to: string, data: Hex, block: bigint): Promise<Hex>;
}
const quantity = (v: unknown): v is Hex => typeof v === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v);
export const hash = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-f]{64}$/.test(v);
export const address = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-f]{40}$/.test(v);
const hexData = (v: unknown): v is Hex => typeof v === 'string' && /^0x(?:[0-9a-f]{2})*$/.test(v);

export class BscRpcRequestError extends Error {
  readonly reason: string;
  readonly rpcCode: number | undefined;
  readonly retryAfterMs: number;
  constructor(readonly method: string, readonly status: number, providerError?: unknown) {
    const error = providerError && typeof providerError === 'object' ? providerError as Record<string,unknown> : {};
    const message = typeof providerError === 'string' ? providerError : typeof error.message === 'string' ? error.message : '';
    const reason = /per second|throughput|rate limit/i.test(message) ? 'provider rate limit exceeded'
      : /monthly|daily|quota|credits|capacity|compute unit/i.test(message) ? 'provider capacity/quota exceeded'
      : /allowlist|whitelist|origin|referer|ip address/i.test(message) ? 'provider allowlist rejected this request'
      : /api.?key|unauthorized|authentication/i.test(message) ? 'provider credentials rejected'
      : /not supported|not available|disabled|not allowed|method not found/i.test(message) ? 'provider method unavailable or restricted'
      : /historical|archive|missing trie/i.test(message) ? 'provider historical data unavailable'
      : status === 429 ? 'provider rate limit exceeded'
      : status === 401 || status === 403 ? 'provider access denied; check quota, key and allowlists'
      : 'provider request failed';
    const code = typeof error.code === 'number' && Number.isFinite(error.code) ? error.code : undefined;
    // Never include the raw provider body or URL: either can contain an API key.
    super(`BSC RPC ${method} HTTP ${status}${code === undefined ? '' : ` code ${code}`}: ${reason}`);
    this.name = 'BscRpcRequestError';
    this.reason = reason;
    this.rpcCode = code;
    this.retryAfterMs = status === 401 || status === 403 || /capacity|quota/.test(reason) ? 60_000 : /rate limit/.test(reason) ? 1000 : status === 429 ? 30_000 : 0;
  }
}

/** Strict, bounded, read-only RPC. No public or legacy provider fallback. */
export class BscRpc implements MarketRpc {
  private id = 0;
  private readonly deadline = Date.now() + 45_000;
  constructor(private readonly url: string, private readonly fetcher: typeof fetch = fetch) {}
  private async request<T>(method: string, params: unknown[]): Promise<T> {
    const id = ++this.id;
    const remaining = this.deadline - Date.now();
    if (id > 200 || remaining <= 0) throw new Error('BSC RPC batch budget exhausted');
    for(let attempt=0;;attempt++){
    const available=this.deadline-Date.now();if(available<=0)throw new Error('BSC RPC batch budget exhausted');
    const response = await this.fetcher(this.url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(Math.min(10_000, available)) });
    const body = await response.json().catch(()=>null) as {id?:number;error?:unknown;result?:T}|null;
    if(!response.ok||body?.error){
      const error=new BscRpcRequestError(method,response.status,body?.error);
      const delay=1000*2**attempt;
      // Retry transient throughput limits inside this atomic batch, rather than
      // discard every already-verified header and repeat all its RPC requests.
      if(error.reason==='provider rate limit exceeded'&&attempt<3&&Date.now()+delay+1000<this.deadline){await new Promise(resolve=>setTimeout(resolve,delay));continue;}
      throw error;
    }
    if (!body || body.id !== id || body.result == null) throw new Error(`BSC RPC invalid ${method} response`);
    return body.result;
    }
  }
  async chainId() {
    const value = await this.request<unknown>('eth_chainId', []);
    if (!quantity(value) || BigInt(value) !== 56n) throw new Error('BSC RPC chain mismatch');
    return 56;
  }
  async header(tag: bigint | 'finalized'): Promise<Header> {
    const h = await this.request<Record<string, unknown>>('eth_getBlockByNumber', [typeof tag === 'bigint' ? `0x${tag.toString(16)}` : tag, false]);
    if (!quantity(h.number) || !hash(h.hash) || !hash(h.parentHash) || !quantity(h.timestamp)
      || BigInt(h.timestamp) > BigInt(Number.MAX_SAFE_INTEGER) || (typeof tag === 'bigint' && BigInt(h.number) !== tag)) throw new Error('Invalid BSC header');
    return { number: BigInt(h.number), hash: h.hash, parentHash: h.parentHash, timestamp: Number(h.timestamp) };
  }
  async logs(from: bigint, to: bigint, addresses: string[], topics: Hex[]): Promise<MarketLog[]> {
    if (!addresses.length) return [];
    // Alchemy free-tier BSC logs permit at most ten blocks per request.
    if(to-from>=10n){
      const result:MarketLog[]=[];
      for(let start=from;start<=to;start+=10n)result.push(...await this.logs(start,start+9n<to?start+9n:to,addresses,topics));
      if(result.length>10000)throw new Error('BSC log batch exceeds budget');
      return result;
    }
    const logs = await this.request<MarketLog[]>('eth_getLogs', [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: addresses, topics: [topics] }]);
    if (!Array.isArray(logs) || logs.length > 10_000) throw new Error('BSC log batch exceeds budget');
    for (const log of logs) {
      if (!address(log.address) || !hash(log.blockHash) || !hash(log.transactionHash) || !quantity(log.blockNumber)
        || !quantity(log.logIndex) || BigInt(log.logIndex) > 2147483647n || !hexData(log.data)
        || !Array.isArray(log.topics) || !log.topics.every(hash) || log.removed === true
        || !addresses.includes(log.address) || !topics.includes(log.topics[0]!)
        || BigInt(log.blockNumber) < from || BigInt(log.blockNumber) > to) throw new Error('Invalid BSC log response');
    }
    return logs;
  }
  call(to: string, data: Hex, block: bigint) {
    return this.request<Hex>('eth_call', [{ to, data }, `0x${block.toString(16)}`]);
  }
}
