import {FLAP_PORTAL,FLAP_TOPICS,projectFlap} from './flap';
import type { Sql } from 'postgres';
import { decodeFunctionResult, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { BSC_PANCAKE, PANCAKE_TOPICS, PANCAKE_V2, PANCAKE_V3 } from '@clashr/core/chain/pancake';
import type { BscConfig } from './config';
import { parseBscJob, type BscJob } from './jobs';
import { decodePool, decodeSwap, nativePrice, tradedToken, type Pool } from './decode';
import type { Header, MarketLog, MarketRpc } from './rpc';

const ERC20 = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)',
  'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)']);
const batches = async <T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> => {
  const result: R[] = [];
  // Four RPC requests plus one DB connection stay below Workers' six-connection limit.
  for (let i = 0; i < items.length; i += 4) result.push(...await Promise.all(items.slice(i, i + 4).map(fn)));
  return result;
};
const time = (header: Header) => new Date(header.timestamp * 1000);

async function metadata(rpc: MarketRpc, token: Hex, block: bigint) {
  const read = async (fn: 'name' | 'symbol' | 'decimals' | 'totalSupply') => {
    const raw = await rpc.call(token, encodeFunctionData({ abi: ERC20, functionName: fn }), block);
    return decodeFunctionResult({ abi: ERC20, functionName: fn, data: raw });
  };
  // Optional labels may fail; decimals and supply must be real on-chain values.
  const results = await Promise.allSettled([read('name'), read('symbol'), read('decimals'), read('totalSupply')]);
  const value = (index: number) => results[index]?.status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<unknown>).value : undefined;
  const name = value(0), symbol = value(1), decimals = value(2), supply = value(3);
  if (typeof decimals !== 'number' || decimals > 36 || typeof supply !== 'bigint') throw new Error('Unsupported token metadata');
  return { name: typeof name === 'string' ? name.slice(0, 256) : '', symbol: typeof symbol === 'string' ? symbol.slice(0, 64) : '', decimals, supply };
}

/** One finalized, atomic batch. No HTTP, SQL, job or data identity defaults to another chain. */
export async function ingestBscBatch(sql: Sql, rpc: MarketRpc, config: BscConfig, input: BscJob) {
  const job = parseBscJob(input);
  if (job.configHash !== config.hash) return { phase: 'stale-job' as const };
  return sql.begin(async (tx) => {
    const cursorTable=tx(config.live?'chain_v2.flap_live_cursors':'chain_v2.market_cursors');
    const [lock] = await tx`select pg_try_advisory_xact_lock(56,${config.live?130014:130013}) as acquired`;
    if (!lock?.acquired) return { phase: 'busy' as const };
    await tx`insert into ${cursorTable}(chain_id,config_hash,start_block) values(56,${config.hash},${config.startBlock.toString()}) on conflict do nothing`;
    const [cursor] = await tx<{ config_hash: string; block: string | null; block_hash: Hex | null; halt_reason: string | null }[]>`
      select * from ${cursorTable} where chain_id=56 for update`;
    if (cursor!.config_hash !== config.hash) throw new Error('BSC configuration changed; reviewed reset/replay required');
    if (cursor!.halt_reason) return { phase: 'halted' as const, reason: cursor!.halt_reason };
    const jobId = job.executionId ?? `${job.minute}:${job.step}`;
    const [completed] = await tx`select continue_indexing from chain_v2.market_jobs where chain_id=56 and config_hash=${config.hash} and job_id=${jobId}`;
    if (completed) return { phase: 'duplicate' as const, continueIndexing: completed.continue_indexing === true };
    if (await rpc.chainId() !== 56) throw new Error('BSC provider chain mismatch');
    const finalized = await rpc.header('finalized');
    if (Date.now() / 1000 - finalized.timestamp > 120 || finalized.timestamp > Date.now() / 1000 + 30) throw new Error('BSC finalized head is stale or future dated');
    const previous = cursor!.block == null ? config.startBlock - 1n : BigInt(cursor!.block);
    if (finalized.number < previous) throw new Error('BSC provider behind stored finalized cursor');
    const anchor = await rpc.header(previous);
    if (cursor!.block_hash && anchor.hash !== cursor!.block_hash) {
      const reason = 'Stored finalized block hash changed; operator reconciliation required';
      await tx`update ${cursorTable} set halt_reason=${reason},checked_at=now() where chain_id=56`;
      return { phase: 'halted' as const, reason };
    }
    const end = previous + BigInt(config.batchBlocks) < finalized.number ? previous + BigInt(config.batchBlocks) : finalized.number;
    const heights: bigint[] = [];
    for (let n = previous + 1n; n <= end; n++) heights.push(n);
    const headers = await batches(heights, (n) => rpc.header(n));
    let parent = anchor;
    for (const header of headers) {
      if (header.number !== parent.number + 1n || header.parentHash !== parent.hash || header.timestamp < parent.timestamp) throw new Error('Noncontiguous BSC finalized headers');
      parent = header;
    }
    const byHeight = new Map(headers.map((h) => [h.number.toString(), h]));
    const checkLogs = (logs: MarketLog[]) => {
      const unique = new Map<string, MarketLog>();
      for (const log of logs) {
        const header = byHeight.get(BigInt(log.blockNumber).toString());
        if (!header || header.hash !== log.blockHash || log.removed) throw new Error('BSC log not in verified finalized ancestry');
        const key = `${log.transactionHash}:${BigInt(log.logIndex)}`;
        const prior = unique.get(key);
        if (prior && JSON.stringify(prior) !== JSON.stringify(log)) throw new Error('Conflicting BSC duplicate log');
        unique.set(key, log);
      }
      return [...unique.values()].sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
    };
    if(config.source==='flap'){
      const logs=heights.length?checkLogs(await rpc.logs(previous+1n,end,[FLAP_PORTAL],FLAP_TOPICS)):[];
      const result=await projectFlap(tx as unknown as import('postgres').TransactionSql,rpc,logs,byHeight,end);
      const endAgain=await rpc.header(end), anchorAgain=await rpc.header(previous);
      if(endAgain.hash!==parent.hash || anchorAgain.hash!==anchor.hash || (end===finalized.number && endAgain.hash!==finalized.hash))throw new Error('Flap ancestry changed during fetch');
      await tx`update ${cursorTable} set block=${heights.length?end.toString():cursor!.block},block_hash=${heights.length?parent.hash:cursor!.block_hash},observed_finalized=${finalized.number.toString()},checked_at=now() where chain_id=56`;
      const continueIndexing=end<finalized.number;
      await tx`insert into chain_v2.market_jobs(chain_id,version,config_hash,job_id,continue_indexing) values(56,2,${config.hash},${jobId},${continueIndexing})`;
      return {phase:'indexed' as const,through:end.toString(),finalized:finalized.number.toString(),blocks:headers.length,...result,continueIndexing};
    }
    const known = await tx<{ address: Hex; token0: Hex; token1: Hex; dex: 'v2' | 'v3'; factory: Hex; fee: number | null; tick_spacing: number | null; created_block: string }[]>`
      select * from chain_v2.pancake_pools where chain_id=56 order by address limit 501`;
    if (known.length > 500) throw new Error('BSC pool budget exceeded; shard before expanding scope');
    const pools = new Map<string, Pool>(known.map((p) => [p.address, { ...p, tickSpacing: p.tick_spacing, createdBlock: BigInt(p.created_block) }]));
    const factoryLogs = heights.length ? checkLogs(await rpc.logs(previous + 1n, end, [BSC_PANCAKE.v2Factory, BSC_PANCAKE.v3Factory], [PANCAKE_TOPICS.pair, PANCAKE_TOPICS.pool])) : [];
    const discovered = factoryLogs.map(decodePool).filter((p): p is Pool => p !== null);
    if (discovered.length > 20 || pools.size + discovered.filter((p) => !pools.has(p.address)).length > 500) throw new Error('BSC discovery budget exceeded; reduce block batch or shard');
    for (const pool of discovered) {
      const data = pool.dex === 'v2'
        ? encodeFunctionData({ abi: PANCAKE_V2, functionName: 'getPair', args: [pool.token0, pool.token1] })
        : encodeFunctionData({ abi: PANCAKE_V3, functionName: 'getPool', args: [pool.token0, pool.token1, pool.fee!] });
      const raw = await rpc.call(pool.factory, data, end);
      const actual = pool.dex === 'v2'
        ? decodeFunctionResult({ abi: PANCAKE_V2, functionName: 'getPair', data: raw })
        : decodeFunctionResult({ abi: PANCAKE_V3, functionName: 'getPool', data: raw });
      if (actual.toLowerCase() !== pool.address) throw new Error('Pancake factory membership mismatch');
      const prior = pools.get(pool.address);
      if (prior && (prior.token0 !== pool.token0 || prior.token1 !== pool.token1 || prior.dex !== pool.dex || prior.createdBlock !== pool.createdBlock)) throw new Error('Conflicting pool identity');
      pools.set(pool.address, pool);
    }
    const addresses = [...pools.keys()];
    let swapLogs: MarketLog[] = [];
    if (heights.length) for (let i = 0; i < addresses.length; i += 100) {
      swapLogs.push(...await rpc.logs(previous + 1n, end, addresses.slice(i, i + 100), [PANCAKE_TOPICS.v2Swap, PANCAKE_TOPICS.v3Swap]));
      if (swapLogs.length > 10_000) throw new Error('BSC swaps exceed batch budget');
    }
    swapLogs = checkLogs(swapLogs);
    const decoded = swapLogs.map((log) => {
      const pool = pools.get(log.address);
      if (!pool || BigInt(log.blockNumber) < pool.createdBlock) throw new Error('Swap outside verified pool lifetime');
      return { log, swap: decodeSwap(log, pool) };
    });
    const tokens = [...new Set([...discovered.map(tradedToken), ...decoded.flatMap((d) => d.swap ? [d.swap.token] : [])])];
    const existing = tokens.length ? await tx<{ address: Hex; decimals: number }[]>`select address,decimals from chain_v2.tokens where chain_id=56 and address in ${tx(tokens)}` : [];
    const decimals = new Map(existing.map((t) => [t.address, t.decimals]));
    const missing = tokens.filter((token) => !decimals.has(token));
    if (missing.length > 20) throw new Error('BSC metadata budget exceeded; reduce batch');
    const metadataRows = [];
    for (const token of missing) {
      // Unknown token metadata stays unavailable, never guessed as 18 decimals.
      try {
        const meta = await metadata(rpc, token, end);
        metadataRows.push({ token, ...meta }); decimals.set(token, meta.decimals);
      } catch { /* Raw verified events remain available; retry metadata on later activity. */ }
    }
    // Recheck both boundaries after RPC work, before any market projection is written.
    const endHeader = await rpc.header(end);
    const anchorAgain = await rpc.header(previous);
    if (endHeader.hash !== parent.hash || anchorAgain.hash !== anchor.hash || (end === finalized.number && endHeader.hash !== finalized.hash)) throw new Error('BSC ancestry changed during fetch');
    const blockRows = headers.map((h) => ({ chain_id:56,number:h.number.toString(),hash:h.hash,parent_hash:h.parentHash,time:time(h).toISOString(),finality:'finalized' }));
    if (blockRows.length) await tx`insert into chain_v2.market_blocks
      select * from jsonb_populate_recordset(null::chain_v2.market_blocks,${JSON.stringify(blockRows)}::text::jsonb)`;
    const logRows = checkLogs([...factoryLogs, ...swapLogs]).map((l) => ({ chain_id:56,tx:l.transactionHash,log_index:Number(l.logIndex),
      block:BigInt(l.blockNumber).toString(),block_hash:l.blockHash,address:l.address,topics:l.topics,data:l.data }));
    if (logRows.length) await tx`insert into chain_v2.market_logs
      select * from jsonb_populate_recordset(null::chain_v2.market_logs,${JSON.stringify(logRows)}::text::jsonb)`;
    for (const pool of discovered) {
      await tx`insert into chain_v2.pancake_pools(chain_id,address,token0,token1,dex,factory,fee,tick_spacing,created_block)
        values(56,${pool.address},${pool.token0},${pool.token1},${pool.dex},${pool.factory},${pool.fee},${pool.tickSpacing},${pool.createdBlock.toString()}) on conflict do nothing`;
      await tx`insert into chain_v2.pools(chain_id,id,token,quote,token_is_currency0,dex,venue,fee,tick_spacing,created_block,created_at)
        values(56,${pool.address},${tradedToken(pool)},${BSC_PANCAKE.wrappedNative},${tradedToken(pool) === pool.token0},${pool.dex},'pancakeswap',${pool.fee},${pool.tickSpacing},${pool.createdBlock.toString()},${time(byHeight.get(pool.createdBlock.toString())!)})`;
    }
    for (const row of metadataRows) {
      const pool = [...pools.values()].filter((p) => tradedToken(p) === row.token).sort((a, b) => a.createdBlock < b.createdBlock ? -1 : a.createdBlock > b.createdBlock ? 1 : a.address.localeCompare(b.address))[0]!;
      const [created] = await tx<{ time: Date }[]>`select time from chain_v2.market_blocks where chain_id=56 and number=${pool.createdBlock.toString()}`;
      await tx`insert into chain_v2.tokens(chain_id,address,name,symbol,decimals,total_supply,supply_block,deployer,created_block,created_at,status,quote,main_pool,launch_indexed)
        values(56,${row.token},${row.name},${row.symbol},${row.decimals},${row.supply.toString()},${end.toString()},NULL,${pool.createdBlock.toString()},${created!.time},'spot',${BSC_PANCAKE.wrappedNative},NULL,false)`;
    }
    const swapRows = decoded.flatMap(({ log, swap }) => swap ? [{ chain_id:56,tx:log.transactionHash,log_index:Number(log.logIndex),pool:log.address,
      token:swap.token,quote:BSC_PANCAKE.wrappedNative,side:swap.side,token_amount:swap.tokenAmount.toString(),quote_amount:swap.quoteAmount.toString(),
      sender:swap.sender,recipient:swap.recipient,trader:null,
      native_execution_price:decimals.has(swap.token) ? nativePrice(swap.tokenAmount,swap.quoteAmount,decimals.get(swap.token)!) : null }] : []);
    if (swapRows.length) await tx`insert into chain_v2.market_swaps
      select * from jsonb_populate_recordset(null::chain_v2.market_swaps,${JSON.stringify(swapRows)}::text::jsonb)`;
    await tx`update ${cursorTable} set block=${heights.length ? end.toString() : cursor!.block},block_hash=${heights.length ? parent.hash : cursor!.block_hash},observed_finalized=${finalized.number.toString()},checked_at=now() where chain_id=56`;
    const continueIndexing = end < finalized.number;
    await tx`insert into chain_v2.market_jobs(chain_id,version,config_hash,job_id,continue_indexing) values(56,2,${config.hash},${jobId},${continueIndexing})`;
    return { phase: 'indexed' as const, through: end.toString(), finalized: finalized.number.toString(), blocks: headers.length,
      pools: discovered.length, swaps: decoded.filter((d) => d.swap).length, metadataUnavailable: missing.length - metadataRows.length, continueIndexing };
  });
}
