import { createPublicClient, erc20Abi, http } from 'viem';
import { bsc } from 'viem/chains';
import { BSC_PUBLIC_RPC } from '@rushr/core/chain/bsc-rpc';
import type { Candle } from './api';
import { type HolderInfo, type Tx } from './trades';
import { getPublicBscToken, getPublicBscCandles, type PublicBscDetail } from './bsc-public-market';
import { getBnbProductToken, getFlapTokenInfo, getFlapCandles, getFlapTrades, getFlapHolders } from './flap-market';
import { BNB_PRODUCT } from './product';
import { verifyRpcChain } from './rpc-upstream';

export interface BscTokenWorkspace {
  chainId: 56;
  detail: PublicBscDetail;
  candles: Candle[];
  trades: Tx[];
  decimals: number | null;
  totalSupply: string | null;
  description: string | null;
  holders: HolderInfo[] | null;
  creator: string | null;
  activity: 'available' | 'unavailable' | 'curve-unindexed';
}

export function normalizeFourMemeActivity(
  rows: unknown,
  id: number,
  usdPerQuote: number | null,
): Tx[] {
  if (!Array.isArray(rows)) return [];
  const trades = new Map<string, Tx>();
  for (const row of rows.slice(0, 300)) {
    if(!row||typeof row!=='object')continue;
    const r = row as Record<string, unknown>,
      hash = String(r.txHash ?? '');
    if (
      Number(r.tokenId) !== id ||
      !/^0x[0-9a-f]{64}(?:-(?:BID|ASK)-\d+)?$/i.test(hash) ||
      !/^0x[0-9a-f]{40}$/i.test(String(r.userAddress)) ||
      !['BID', 'ASK'].includes(String(r.side))
    )
      continue;
    const time = Number(r.createDate),
      amount = Number(r.amount),
      price = Number(r.price),
      volume = Number(r.volume);
    if (
      ![time, amount, price, volume].every(Number.isFinite) ||
      time < 1e12 ||
      amount <= 0 ||
      price < 0 ||
      volume < 0
    )
      continue;
    trades.set(hash, {
      id: `fourmeme:${hash}`,
      tx: hash.slice(0, 66).toLowerCase(),
      time: Math.floor(time / 1000),
      trader: String(r.userAddress).toLowerCase(),
      side: r.side === 'BID' ? 'buy' : 'sell',
      tokens: amount,
      priceUsd: usdPerQuote === null ? null : price * usdPerQuote,
      usd: usdPerQuote === null ? null : volume * usdPerQuote,
    });
  }
  return [...trades.values()].sort((a, b) => b.time - a.time);
}

export function candlesFromBscTrades(trades: Tx[], seconds: number): Candle[] {
  const bars = new Map<number, Candle>();
  for (const t of [...trades].sort((a, b) => {
    if(a.block&&b.block&&/^\d+$/.test(a.block)&&/^\d+$/.test(b.block)){
      const x=BigInt(a.block),y=BigInt(b.block);return x===y?(a.logIndex??0)-(b.logIndex??0):x<y?-1:1;
    }
    return a.time-b.time;
  })) {
    if (t.priceUsd == null || !Number.isFinite(t.priceUsd) || t.priceUsd <= 0) continue;
    const time = Math.floor(t.time / seconds) * seconds,
      bar = bars.get(time);
    if (bar) {
      bar.high = Math.max(bar.high, t.priceUsd);
      bar.low = Math.min(bar.low, t.priceUsd);
      bar.close = t.priceUsd;
      bar.volume += t.usd ?? 0;
    } else
      bars.set(time, {
        time,
        open: t.priceUsd,
        high: t.priceUsd,
        low: t.priceUsd,
        close: t.priceUsd,
        volume: t.usd ?? 0,
      });
  }
  return [...bars.values()];
}

/** Provider trade amounts are whole units. Direction is relative to the requested token, not pool base. */
export function normalizeBscActivity(body: unknown, token: string): Tx[] {
  const rows = (body as { data?: unknown[] })?.data;
  if (!Array.isArray(rows)) return [];
  const result = new Map<string, Tx>();
  const numeric = (v: unknown) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  for (const raw of rows.slice(0, 300)) {
    const row = raw as { id?: string; attributes?: Record<string, unknown> },
      a = row?.attributes;
    if (
      !a ||
      a.is_anomalous === true ||
      typeof row.id !== 'string' ||
      !row.id.startsWith('bsc_') ||
      typeof a.tx_hash !== 'string' ||
      !/^0x[0-9a-f]{64}$/i.test(a.tx_hash) ||
      typeof a.tx_from_address !== 'string' ||
      !/^0x[0-9a-f]{40}$/i.test(a.tx_from_address)
    )
      continue;
    const from = String(a.from_token_address).toLowerCase() === token.toLowerCase(),
      to = String(a.to_token_address).toLowerCase() === token.toLowerCase();
    if (from === to) continue;
    const time = Math.floor(Date.parse(String(a.block_timestamp)) / 1000);
    if (!Number.isFinite(time) || time <= 0) continue;
    const amount = numeric(from ? a.from_token_amount : a.to_token_amount);
    if (amount === null || amount <= 0) continue;
    result.set(row.id, {
      id: row.id,
      tx: a.tx_hash.toLowerCase(),
      time,
      trader: a.tx_from_address.toLowerCase(),
      side: from ? 'sell' : 'buy',
      priceUsd: numeric(from ? a.price_from_in_usd : a.price_to_in_usd),
      usd: numeric(a.volume_in_usd),
      tokens: amount,
    });
  }
  return [...result.values()].sort((a, b) => b.time - a.time);
}

const cache = new Map<string, { until: number; value: BscTokenWorkspace | null }>();
const pending = new Map<string, Promise<BscTokenWorkspace | null>>();
export function getBscTokenWorkspace(address: string): Promise<BscTokenWorkspace | null> {
  const key = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(key)) return Promise.resolve(null);
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return Promise.resolve(saved.value);
  const existing = pending.get(key);
  if (existing) return existing;
  const task = load(key)
    .then((value) => {
      if (cache.size >= 150) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + 3_000, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
async function load(address: string): Promise<BscTokenWorkspace | null> {
  const detail = await (BNB_PRODUCT ? getBnbProductToken(address) : getPublicBscToken(address));
  if (!detail) return null;
  const infoPromise = BNB_PRODUCT ? getFlapTokenInfo(address).catch(() => null) : Promise.resolve(null);
  const metadata = async () => {
    const info=await infoPromise;
    if(detail.source==='flap'&&Number.isInteger(info?.decimals)&&Number(info?.decimals)>=0&&Number(info?.decimals)<=36&&/^\d+$/.test(String(info?.totalSupply??'')))return {decimals:Number(info!.decimals),totalSupply:String(info!.totalSupply)};
    const url = process.env.BSC_RPC_URL || BSC_PUBLIC_RPC;
    await verifyRpcChain(url, 56);
    const client = createPublicClient({
      chain: bsc,
      transport: http(url, { timeout: 8000, retryCount: 0 }),
    });
    const values = await client.multicall({
      contracts: [
        { address: address as `0x${string}`, abi: erc20Abi, functionName: 'decimals' },
        { address: address as `0x${string}`, abi: erc20Abi, functionName: 'totalSupply' },
      ],
      allowFailure: true,
    });
    return {
      decimals: values[0].status === 'success' && values[0].result <= 36 ? values[0].result : null,
      totalSupply: values[1].status === 'success' ? values[1].result.toString() : null,
    };
  };
  const activity = async () => {
    const pools = detail.pools.filter((p) => p.dex === 'v2' || p.dex === 'v3').slice(0, 2);
    if (!pools.length) return detail.source==='flap'?{trades:await getFlapTrades(address),activity:'available' as const}:{trades:[] as Tx[],activity:'curve-unindexed' as const};
    const results = await Promise.allSettled(
      pools.map(async (pool) => {
        const response = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool.pool_address}/trades`,
          { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } },
        );
        if (!response.ok) throw new Error('Public activity unavailable');
        return normalizeBscActivity(await response.json(), address);
      }),
    );
    const unique = new Map<string, Tx>();
    for (const result of results)
      if (result.status === 'fulfilled')
        for (const trade of result.value) unique.set(trade.id, trade);
    return {
      trades: [...unique.values()].sort((a, b) => b.time - a.time).slice(0, 500),
      activity: results.some((r) => r.status === 'fulfilled')
        ? ('available' as const)
        : ('unavailable' as const),
    };
  };
  // Flap holder/trade units are not inferred from Four.meme's unrelated API schema.
  const holders = async ():Promise<HolderInfo[]|null> => detail.source==='flap'?getFlapHolders(address):null;
  const [meta, candles, rows, holderRows, info] = await Promise.all([
    metadata().catch(() => ({ decimals: detail.token.decimals, totalSupply: null })),
    (detail.source === 'flap' && !detail.pools.length ? getFlapCandles(address, '1m') : getPublicBscCandles(address, '1m')).catch(() => []),
    activity().catch(()=>({trades:[] as Tx[],activity:'unavailable' as const})),
    holders().catch(() => null),
    infoPromise,
  ]);
  const normalizedHolders=holderRows;
  return {
    chainId: 56,
    detail,
    candles: candles.length ? candles : candlesFromBscTrades(rows.trades, 60),
    ...meta,
    ...rows,
    description: info?.metadata && typeof info.metadata === 'object' && typeof (info.metadata as Record<string, unknown>).description === 'string' ? String((info.metadata as Record<string, unknown>).description).trim().slice(0, 2000)||null : null,
    creator:
      typeof info?.creator === 'string' && /^0x[0-9a-f]{40}$/i.test(info.creator)
        ? info.creator.toLowerCase()
        : null,
    holders: normalizedHolders,
  };
}
