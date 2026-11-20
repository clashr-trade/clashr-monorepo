import { decodeEventLog, type Hex } from 'viem';
import { BSC_PANCAKE, PANCAKE_V2, PANCAKE_V3, PANCAKE_TOPICS } from '@clashr/core/chain/pancake';
import type { MarketLog } from './rpc';

export interface Pool { address: Hex; token0: Hex; token1: Hex; dex: 'v2' | 'v3'; factory: Hex; fee: number | null; tickSpacing: number | null; createdBlock: bigint }
export const tradedToken = (pool: Pool) => pool.token0 === BSC_PANCAKE.wrappedNative ? pool.token1 : pool.token0;
export function decodePool(log: MarketLog): Pool | null {
  const v2 = log.address === BSC_PANCAKE.v2Factory && log.topics[0] === PANCAKE_TOPICS.pair;
  const v3 = log.address === BSC_PANCAKE.v3Factory && log.topics[0] === PANCAKE_TOPICS.pool;
  if (!v2 && !v3) throw new Error('Untrusted factory event');
  const event = v2
    ? decodeEventLog({ abi: PANCAKE_V2, eventName: 'PairCreated', data: log.data, topics: log.topics as never, strict: true }).args
    : decodeEventLog({ abi: PANCAKE_V3, eventName: 'PoolCreated', data: log.data, topics: log.topics as never, strict: true }).args;
  const token0 = event.token0.toLowerCase() as Hex;
  const token1 = event.token1.toLowerCase() as Hex;
  if (token0 >= token1 || BigInt(token0) === 0n) throw new Error('Invalid factory token ordering');
  if (token0 !== BSC_PANCAKE.wrappedNative && token1 !== BSC_PANCAKE.wrappedNative) return null;
  const pool = ('pair' in event ? event.pair : event.pool).toLowerCase() as Hex;
  if (BigInt(pool) === 0n) throw new Error('Invalid pool address');
  return { address: pool, token0, token1, dex: v2 ? 'v2' : 'v3', factory: log.address,
    fee: 'fee' in event ? event.fee : null, tickSpacing: 'tickSpacing' in event ? event.tickSpacing : null, createdBlock: BigInt(log.blockNumber) };
}

/** Pool-level execution facts. Sender/recipient are routers or pools, not proven wallet traders. */
export function decodeSwap(log: MarketLog, pool: Pool) {
  if (log.address !== pool.address) throw new Error('Pool emitter mismatch');
  let amount0: bigint, amount1: bigint;
  let sender: string, recipient: string;
  if (pool.dex === 'v2') {
    const { args } = decodeEventLog({ abi: PANCAKE_V2, eventName: 'Swap', data: log.data, topics: log.topics as never, strict: true });
    amount0 = args.amount0In - args.amount0Out;
    amount1 = args.amount1In - args.amount1Out;
    sender = args.sender; recipient = args.to;
    // Flash/mixed-flow v2 events must not be priced as simple swaps.
    if ((args.amount0In > 0n && args.amount0Out > 0n) || (args.amount1In > 0n && args.amount1Out > 0n)) return null;
  } else {
    const { args } = decodeEventLog({ abi: PANCAKE_V3, eventName: 'Swap', data: log.data, topics: log.topics as never, strict: true });
    amount0 = args.amount0; amount1 = args.amount1;
    sender = args.sender; recipient = args.recipient;
  }
  if (!((amount0 > 0n && amount1 < 0n) || (amount0 < 0n && amount1 > 0n))) return null;
  const tokenDelta = pool.token0 === BSC_PANCAKE.wrappedNative ? amount1 : amount0;
  const quoteDelta = pool.token0 === BSC_PANCAKE.wrappedNative ? amount0 : amount1;
  const abs = (v: bigint) => v < 0n ? -v : v;
  return { token: tradedToken(pool), side: tokenDelta < 0n ? 'buy' as const : 'sell' as const,
    tokenAmount: abs(tokenDelta), quoteAmount: abs(quoteDelta), sender: sender.toLowerCase(), recipient: recipient.toLowerCase() };
}

/** Exact decimal execution ratio (36 fractional digits); never uses ETH/USD or float amounts. */
export function nativePrice(tokenRaw: bigint, quoteRaw: bigint, decimals: number): string | null {
  if (tokenRaw <= 0n || quoteRaw <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const units = quoteRaw * 10n ** BigInt(decimals + 18) / tokenRaw;
  if (units === 0n) return null;
  const padded = units.toString().padStart(37, '0');
  return `${padded.slice(0, -36)}.${padded.slice(-36)}`.replace(/0+$/, '').replace(/\.$/, '');
}
