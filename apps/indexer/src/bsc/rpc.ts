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

/** Strict, bounded, read-only RPC. No public or legacy provider fallback. */
export class BscRpc implements MarketRpc {
  private id = 0;
  private readonly deadline = Date.now() + 45_000;
  constructor(private readonly url: string, private readonly fetcher: typeof fetch = fetch) {}
  private async request<T>(method: string, params: unknown[]): Promise<T> {
    const id = ++this.id;
    const remaining = this.deadline - Date.now();
    if (id > 200 || remaining <= 0) throw new Error('BSC RPC batch budget exhausted');
    const response = await this.fetcher(this.url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(Math.min(10_000, remaining)) });
    if (!response.ok) throw new Error(`BSC RPC HTTP ${response.status}`);
    const body = await response.json() as { id?: number; error?: unknown; result?: T };
    if (body.id !== id || body.error || body.result == null) throw new Error(`BSC RPC invalid ${method} response`);
    return body.result;
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
