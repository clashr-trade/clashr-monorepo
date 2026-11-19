import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult, type Hex } from 'viem';
import { BSC_PANCAKE, PANCAKE_V2, PANCAKE_V3 } from '@rushr/core/chain/pancake';
import { freshDb, pgAvailable } from '../../../packages/agents/test/pg';
import { ingestBscBatch } from '../src/bsc/ingest';
import { bscConfig, type BscConfig } from '../src/bsc/config';
import { parseBscJob, isLegacyJob, type BscJob } from '../src/bsc/jobs';
import { BscRpc, type Header, type MarketLog, type MarketRpc } from '../src/bsc/rpc';
import { decodePool, decodeSwap, nativePrice } from '../src/bsc/decode';
import worker, { enqueueBscTick } from '../src/bsc-worker';
import { createChainApi } from '../src/chain-api';
import type { Env } from '../src/env';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

const TOKEN = '0x1111111111111111111111111111111111111111';
const V2 = '0x2222222222222222222222222222222222222222';
const V3 = '0x3333333333333333333333333333333333333333';
const WALLET = '0x4444444444444444444444444444444444444444';
const h = (n: number | bigint) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const q = (n: number) => `0x${n.toString(16)}` as Hex;
const config: BscConfig = { startBlock:10n,batchBlocks:2,hash:'a'.repeat(64) };
const job = (minute = 1, step = 0): BscJob => ({ version:2,chainId:56,kind:'market-index',configHash:config.hash,minute,step });
function creation(v3: boolean): MarketLog {
  return { address:v3 ? BSC_PANCAKE.v3Factory : BSC_PANCAKE.v2Factory,blockNumber:q(10),blockHash:h(10),transactionHash:h(100),logIndex:q(v3 ? 1 : 0),
    topics: (v3 ? encodeEventTopics({abi:PANCAKE_V3,eventName:'PoolCreated',args:{token0:TOKEN,token1:BSC_PANCAKE.wrappedNative,fee:2500}})
      : encodeEventTopics({abi:PANCAKE_V2,eventName:'PairCreated',args:{token0:TOKEN,token1:BSC_PANCAKE.wrappedNative}})) as Hex[],
    data:v3 ? encodeAbiParameters([{type:'int24'},{type:'address'}],[50,V3]) : encodeAbiParameters([{type:'address'},{type:'uint256'}],[V2,1n]) };
}
function swap(v3: boolean, block = 11): MarketLog {
  return { address:v3 ? V3 : V2,blockNumber:q(block),blockHash:h(block),transactionHash:h(100+block),logIndex:q(v3 ? 3 : 2),
    topics:(v3 ? encodeEventTopics({abi:PANCAKE_V3,eventName:'Swap',args:{sender:WALLET,recipient:WALLET}})
      : encodeEventTopics({abi:PANCAKE_V2,eventName:'Swap',args:{sender:WALLET,to:WALLET}})) as Hex[],
    // 2 tokens (6 decimals) bought for 1 BNB => 0.5 BNB/token.
    data:v3 ? encodeAbiParameters([{type:'int256'},{type:'int256'},{type:'uint160'},{type:'uint128'},{type:'int24'},{type:'uint128'},{type:'uint128'}],[-2_000_000n,10n**18n,2n**96n,1000n,0,0n,0n])
      : encodeAbiParameters([{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[0n,10n**18n,2_000_000n,0n]) };
}

class FixtureRpc implements MarketRpc {
  head = 11n;
  calls = 0;
  wrongChain = false;
  wrongMembership = false;
  missingMetadata = false;
  changed = new Set<bigint>();
  logsFixture = [creation(false),creation(true),swap(false),swap(true)];
  async chainId() { this.calls++; return this.wrongChain ? 4663 : 56; }
  async header(tag: bigint | 'finalized'): Promise<Header> {
    this.calls++;
    const n = tag === 'finalized' ? this.head : tag;
    return { number:n,hash:this.changed.has(n) ? h(n+1000n) : h(n),parentHash:h(n-1n),timestamp:Math.floor(Date.now()/1000)-Number(20n-n) };
  }
  async logs(from: bigint, to: bigint, addresses: string[]) {
    this.calls++;
    return this.logsFixture.filter((l) => addresses.includes(l.address) && BigInt(l.blockNumber)>=from && BigInt(l.blockNumber)<=to);
  }
  async call(to: string, data: Hex, block: bigint): Promise<Hex> {
    this.calls++;
    expect(block <= this.head).toBe(true);
    if (to === BSC_PANCAKE.v2Factory) return encodeFunctionResult({abi:PANCAKE_V2,functionName:'getPair',result:this.wrongMembership ? WALLET : V2});
    if (to === BSC_PANCAKE.v3Factory) return encodeFunctionResult({abi:PANCAKE_V3,functionName:'getPool',result:V3});
    if (this.missingMetadata) throw new Error('Metadata unavailable');
    if (data === '0x313ce567') return encodeAbiParameters([{type:'uint8'}],[6]);
    if (data === '0x18160ddd') return encodeAbiParameters([{type:'uint256'}],[1_000_000_000n]);
    return encodeAbiParameters([{type:'string'}],[data === '0x06fdde03' ? 'Fixture' : 'FIX']);
  }
}

describe('BSC job/config boundaries', () => {
  it('rejects cross-chain/version/step identities and protects legacy consumers', () => {
    expect(parseBscJob(job())).toEqual(job());
    for (const change of [{chainId:4663},{version:1},{step:20},{minute:NaN},{configHash:'bad'}]) expect(() => parseBscJob({...job(),...change})).toThrow();
    expect(isLegacyJob({kind:'token-metadata',token:TOKEN})).toBe(true);
    expect(isLegacyJob({kind:'token-metadata',chainId:4663})).toBe(true);
    expect(isLegacyJob({...job(),kind:'token-metadata'})).toBe(false);
    expect(isLegacyJob({kind:'token-metadata',chain_id:56})).toBe(false);
  });
  it('requires explicit resources/start/epoch; fingerprint survives operational batch/provider rotation', async () => {
    const env = {BSC_INDEX_ENABLED:'1',BSC_RPC_URL:'https://rpc.invalid',DATABASE_URL:'postgres://invalid',BSC_START_BLOCK:'10',BSC_INDEX_EPOCH:'test'};
    await expect(bscConfig({})).rejects.toThrow('disabled');
    await expect(bscConfig({...env,BSC_START_BLOCK:undefined})).rejects.toThrow('start');
    const a = await bscConfig(env);
    expect((await bscConfig({...env,BSC_BATCH_BLOCKS:'50',BSC_RPC_URL:'https://rotated.invalid'})).hash).toBe(a.hash);
    expect((await bscConfig({...env,BSC_INDEX_EPOCH:'new'})).hash).not.toBe(a.hash);
  });
  it('performs no work while disabled; scheduled/manual producers emit the same scoped identity', async () => {
    const send = vi.fn();
    await enqueueBscTick({},60000);
    const env = {BSC_INDEX_ENABLED:'1',BSC_RPC_URL:'https://rpc.invalid',DATABASE_URL:'postgres://invalid',BSC_START_BLOCK:'10',BSC_INDEX_EPOCH:'test',BSC_INDEX_QUEUE:{send} as unknown as Queue};
    await enqueueBscTick(env,60000); await enqueueBscTick(env,60001);
    expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0]);
    expect(send.mock.calls[0]![0]).toMatchObject({chainId:56,version:2,minute:1,step:0});
    const ack = vi.fn();
    await worker.queue({ messages:[{body:{...job(),chainId:4663},ack,id:'bad'}] } as unknown as MessageBatch<unknown>,{});
    expect(ack).toHaveBeenCalledOnce();
    const legacy = await import('../src/index');
    const legacyAck = vi.fn();
    // Missing DB/RPC config proves the actual old consumer exits before accessing either.
    await legacy.default.queue({messages:[{body:{...job(),kind:'token-metadata',token:TOKEN},ack:legacyAck,id:'cross-chain'}]} as unknown as MessageBatch<never>,{} as Env);
    expect(legacyAck).toHaveBeenCalledOnce();
  });
  it('calculates exact native ratios and rejects dust rounded to zero', () => {
    expect(nativePrice(2_000_000n,10n**18n,6)).toBe('0.5');
    expect(nativePrice(3n*10n**18n,10n**18n,18)).toBe('0.333333333333333333333333333333333333');
    expect(nativePrice(10n**77n,1n,0)).toBeNull();
    expect(nativePrice(0n,1n,18)).toBeNull();
  });
  it('requires economic finality support with no latest/depth fallback', async () => {
    const requests: unknown[] = [];
    const rpc = new BscRpc('http://rpc.invalid', (async (_url, init) => {
      const body = JSON.parse(String(init?.body)); requests.push(body.params);
      return Response.json({id:body.id,error:{code:-32602,message:'unsupported tag'}});
    }) as typeof fetch);
    await expect(rpc.header('finalized')).rejects.toThrow();
    expect(requests).toEqual([['finalized',false]]);
  });
  it('rejects spoofed factories and the shorter Uniswap-v3 swap layout', () => {
    expect(() => decodePool({...creation(false),address:WALLET})).toThrow('Untrusted');
    const pool = decodePool(creation(true))!;
    const event = swap(true);
    expect(() => decodeSwap({...event,data:event.data.slice(0,-128) as Hex},pool)).toThrow();
  });
  it('retains v2 mixed-flow flash facts without pretending they are simple priced trades', () => {
    const event = swap(false);
    event.data = encodeAbiParameters([{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[3_000_000n,10n**18n,1_000_000n,0n]);
    expect(decodeSwap(event,decodePool(creation(false))!)).toBeNull();
  });
  it('checks RPC response identity and refuses unrequested or removed logs', async () => {
    const rpc = new BscRpc('http://rpc.invalid',(async (_url,init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({id:body.id,result:[{...swap(false),removed:true}]});
    }) as typeof fetch);
    await expect(rpc.logs(10n,11n,[V2],[swap(false).topics[0]!])).rejects.toThrow('Invalid BSC log');
    const badId = new BscRpc('http://rpc.invalid',(async () => Response.json({id:999,result:'0x38'})) as typeof fetch);
    await expect(badId.chainId()).rejects.toThrow('invalid eth_chainId');
  });
});

const pg = await pgAvailable();
describe.skipIf(!pg)('BSC finalized ingestion (real PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof freshDb>>;
  let rpc: FixtureRpc;
  beforeAll(async () => { db = await freshDb('bsc_ingest'); });
  beforeEach(async () => {
    await db.sql`truncate chain_v2.market_blocks cascade`;
    await db.sql`truncate chain_v2.market_jobs,chain_v2.market_cursors`;
    await db.sql`delete from chain_v2.tokens where chain_id=56`;
    await db.sql`delete from chain_v2.pools where chain_id=56`;
    rpc = new FixtureRpc();
  });
  afterAll(async () => { await db?.drop(); });

  it('keeps live Flap and historical checkpoints independent', async () => {
    rpc.logsFixture=[];
    const historical={...config,source:'flap' as const};
    const live={...historical,live:true,startBlock:11n,hash:'b'.repeat(64)};
    await ingestBscBatch(db.sql,rpc,live,{...job(),configHash:live.hash});
    expect(await db.sql`select 1 from chain_v2.market_cursors`).toHaveLength(0);
    expect((await db.sql`select block::text from chain_v2.flap_live_cursors`)[0]?.block).toBe('11');
    await ingestBscBatch(db.sql,rpc,historical,job());
    expect((await db.sql`select start_block::text from chain_v2.market_cursors`)[0]?.start_block).toBe('10');
    expect((await db.sql`select start_block::text from chain_v2.flap_live_cursors`)[0]?.start_block).toBe('11');
  });

  it('allows live progress while the backfill advisory lock is held', async () => {
    rpc.logsFixture=[];
    await db.sql`truncate chain_v2.flap_live_cursors`;
    const live={...config,source:'flap' as const,live:true,hash:'c'.repeat(64)};
    await db.sql.begin(async tx=>{
      await tx`select pg_advisory_xact_lock(56,130013)`;
      const result=await ingestBscBatch(db.sql,rpc,live,{...job(),configHash:live.hash});
      expect(result.phase).toBe('indexed');
    });
  });

  it('processes successive local runs within the same scheduled minute', async () => {
    rpc.logsFixture=[];
    const cfg={...config,source:'flap' as const};
    await ingestBscBatch(db.sql,rpc,cfg,{...job(),executionId:'local-'+crypto.randomUUID()});
    rpc.head=12n;
    const result=await ingestBscBatch(db.sql,rpc,cfg,{...job(),executionId:'local-'+crypto.randomUUID()});
    expect(result).toMatchObject({phase:'indexed',through:'12'});
  });

  it('atomically discovers both protocols, stores canonical raw facts and exact BNB execution ratios', async () => {
    const result = await ingestBscBatch(db.sql,rpc,config,job());
    expect(result).toMatchObject({phase:'indexed',blocks:2,pools:2,swaps:2,continueIndexing:false});
    expect(await db.sql`select 1 from public.tokens`).toHaveLength(0);
    const swaps = await db.sql`select trader,native_execution_price::text from chain_v2.market_swaps`;
    expect(swaps).toHaveLength(2);
    expect(swaps.every((s) => s.trader === null && s.native_execution_price === '0.5')).toBe(true);
    expect(await db.sql`select 1 from chain_v2.swaps where chain_id=56`).toHaveLength(0);
    expect((await db.sql`select deployer,launch_indexed,decimals,price_usd,price_native from chain_v2.tokens where chain_id=56`)[0]).toMatchObject({deployer:null,launch_indexed:false,decimals:6,price_usd:null,price_native:null});
    const calls = rpc.calls;
    expect((await ingestBscBatch(db.sql,rpc,config,job())).phase).toBe('duplicate');
    expect(rpc.calls).toBe(calls);
    expect(await db.sql`select 1 from chain_v2.market_logs`).toHaveLength(4);
  });
  it('persists continuation intent across retries and advances only once per child job', async () => {
    rpc.head = 12n;
    rpc.logsFixture.push(swap(false,12));
    expect(await ingestBscBatch(db.sql,rpc,config,job())).toMatchObject({continueIndexing:true,through:'11'});
    expect(await ingestBscBatch(db.sql,rpc,config,job())).toMatchObject({phase:'duplicate',continueIndexing:true});
    expect(await ingestBscBatch(db.sql,rpc,config,job(1,1))).toMatchObject({continueIndexing:false,through:'12'});
    expect((await db.sql`select block::text from chain_v2.market_cursors`)[0]?.block).toBe('12');
    expect(await db.sql`select 1 from chain_v2.market_swaps`).toHaveLength(3);
  });
  it('recovers a committed batch whose continuation queue send failed, without calling RPC twice', async () => {
    rpc.head = 12n;
    const env = {BSC_INDEX_ENABLED:'1',BSC_RPC_URL:'https://bsc.invalid',DATABASE_URL:db.url,BSC_START_BLOCK:'10',BSC_INDEX_EPOCH:'fixture',BSC_BATCH_BLOCKS:'2'};
    const cfg = await bscConfig(env);
    const send = vi.fn().mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValue(undefined);
    const fetcher = vi.fn(async (_url: unknown,init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      let result: unknown;
      if (request.method === 'eth_chainId') result = '0x38';
      else if (request.method === 'eth_getBlockByNumber') {
        const block = await rpc.header(request.params[0] === 'finalized' ? 'finalized' : BigInt(request.params[0]));
        result = {number:`0x${block.number.toString(16)}`,hash:block.hash,parentHash:block.parentHash,timestamp:q(block.timestamp)};
      } else if (request.method === 'eth_getLogs') {
        const query = request.params[0];
        result = await rpc.logs(BigInt(query.fromBlock),BigInt(query.toBlock),query.address);
      } else if (request.method === 'eth_call') result = await rpc.call(request.params[0].to,request.params[0].data,BigInt(request.params[1]));
      else throw new Error('Unexpected RPC method');
      return Response.json({jsonrpc:'2.0',id:request.id,result});
    });
    const ack = vi.fn(), retry = vi.fn();
    const input = {...job(),configHash:cfg.hash};
    const batch = {messages:[{id:'commit-send-failure',body:input,ack,retry}]} as unknown as MessageBatch<unknown>;
    const binding = {send} as unknown as Queue;
    vi.stubGlobal('fetch',fetcher);
    try {
      await worker.queue(batch,{...env,BSC_INDEX_QUEUE:binding});
      expect(retry).toHaveBeenCalledOnce(); expect(ack).not.toHaveBeenCalled();
      const calls = fetcher.mock.calls.length;
      await worker.queue(batch,{...env,BSC_INDEX_QUEUE:binding});
      expect(ack).toHaveBeenCalledOnce(); expect(fetcher.mock.calls.length).toBe(calls);
      expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0]);
      expect(send.mock.calls[1]![0]).toMatchObject({version:2,chainId:56,step:1});
      expect(await db.sql`select 1 from chain_v2.market_jobs`).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects stale jobs before storage/RPC and refuses silent configuration resets', async () => {
    expect((await ingestBscBatch(db.sql,rpc,config,{...job(),configHash:'b'.repeat(64)})).phase).toBe('stale-job');
    expect(rpc.calls).toBe(0);
    expect(await db.sql`select 1 from chain_v2.market_cursors`).toHaveLength(0);
    await ingestBscBatch(db.sql,rpc,config,job());
    await expect(ingestBscBatch(db.sql,rpc,{...config,hash:'b'.repeat(64)},{...job(2),configHash:'b'.repeat(64)})).rejects.toThrow('reset/replay');
  });
  it('rolls back wrong providers, fake membership, removed logs and wrong block hashes', async () => {
    for (const failure of ['chain','membership','removed','hash'] as const) {
      rpc = new FixtureRpc();
      if (failure === 'chain') rpc.wrongChain = true;
      if (failure === 'membership') rpc.wrongMembership = true;
      if (failure === 'removed') rpc.logsFixture[2]!.removed = true;
      if (failure === 'hash') rpc.logsFixture[2]!.blockHash = h(999);
      await expect(ingestBscBatch(db.sql,rpc,config,job())).rejects.toThrow();
      expect(await db.sql`select 1 from chain_v2.market_cursors`).toHaveLength(0);
      expect(await db.sql`select 1 from chain_v2.market_blocks`).toHaveLength(0);
      expect(await db.sql`select 1 from chain_v2.market_jobs`).toHaveLength(0);
    }
  });
  it('rolls back all projections if the final derived-swap write fails', async () => {
    await db.sql`alter table chain_v2.market_swaps add constraint test_reject_swaps check(false) not valid`;
    try {
      await expect(ingestBscBatch(db.sql,rpc,config,job())).rejects.toThrow();
      for (const table of ['market_blocks','market_logs','market_swaps','market_cursors','market_jobs','tokens','pancake_pools']) {
        expect(await db.sql.unsafe(`select 1 from chain_v2.${table} where chain_id=56`)).toHaveLength(0);
      }
    } finally { await db.sql`alter table chain_v2.market_swaps drop constraint test_reject_swaps`; }
  });
  it('admits only one writer per chain while provider work is in flight', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = rpc.chainId.bind(rpc);
    rpc.chainId = async () => { entered(); await gate; return original(); };
    const running = ingestBscBatch(db.sql,rpc,config,job());
    try {
      await started;
      expect((await ingestBscBatch(db.sql,new FixtureRpc(),config,job(2))).phase).toBe('busy');
    } finally { release(); }
    await running;
    expect(await db.sql`select 1 from chain_v2.market_jobs`).toHaveLength(1);
  });
  it('keeps missing metadata unpriced rather than guessing decimals or token provenance', async () => {
    rpc.missingMetadata = true;
    expect(await ingestBscBatch(db.sql,rpc,config,job())).toMatchObject({metadataUnavailable:1,swaps:2});
    expect(await db.sql`select 1 from chain_v2.tokens where chain_id=56`).toHaveLength(0);
    expect((await db.sql`select native_execution_price from chain_v2.market_swaps`).every((s) => s.native_execution_price === null)).toBe(true);
    rpc.missingMetadata = false; rpc.head = 12n; rpc.logsFixture.push(swap(false,12));
    await ingestBscBatch(db.sql,rpc,config,job(2));
    expect(await db.sql`select 1 from chain_v2.tokens where chain_id=56`).toHaveLength(1);
  });
  it('halts durably on a stored finalized hash change and stops before further provider work', async () => {
    await ingestBscBatch(db.sql,rpc,config,job());
    rpc.changed.add(11n);
    expect((await ingestBscBatch(db.sql,rpc,config,job(2))).phase).toBe('halted');
    const calls = rpc.calls;
    expect((await ingestBscBatch(db.sql,rpc,config,job(3))).phase).toBe('halted');
    expect(rpc.calls).toBe(calls);
    expect(await db.sql`select 1 from chain_v2.market_blocks`).toHaveLength(2);
    const api = createChainApi(() => postgres(db.url,{max:1,prepare:false,fetch_types:false}));
    expect((await api.request('/chains/56/tokens',{}, {CHAIN_V2_READS:'1'} as Env)).status).toBe(503);
  });
  it('fails closed on an inconsistent new ancestry without acknowledging the job', async () => {
    rpc.changed.add(10n);
    await expect(ingestBscBatch(db.sql,rpc,config,job())).rejects.toThrow('Noncontiguous');
    expect(await db.sql`select 1 from chain_v2.market_jobs`).toHaveLength(0);
  });
  it('requires fresh caught-up canonical state for BSC reads and exposes event provenance', async () => {
    const api = createChainApi(() => postgres(db.url,{max:1,prepare:false,fetch_types:false}));
    const env = {CHAIN_V2_READS:'1'} as Env;
    expect((await api.request('/chains/56/tokens',{},env)).status).toBe(503);
    await ingestBscBatch(db.sql,rpc,config,job());
    const response = await api.request(`/chains/56/tokens/${TOKEN}/swaps`,{},env);
    expect(response.status).toBe(200);
    const body = await response.json() as {swaps:Record<string,unknown>[]};
    expect(body).toMatchObject({coverage:{fromBlock:'10',throughBlock:'11',finality:'finalized'}});
    expect(body.swaps[0]).toMatchObject({chain_id:56,finality:'finalized',block_hash:h(11),trader:null});
    await db.sql`update chain_v2.market_cursors set checked_at=now()-interval '3 minutes'`;
    expect((await api.request('/chains/56/tokens',{},env)).status).toBe(503);
    await db.sql`update chain_v2.market_cursors set checked_at=now(),observed_finalized=block+1`;
    expect((await api.request('/chains/56/tokens',{},env)).status).toBe(503);
  });
});
