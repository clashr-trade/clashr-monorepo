import { createPublicClient, erc20Abi, http } from 'viem';
import { bsc } from 'viem/chains';
import { BSC_PUBLIC_RPC } from '@rushr/core/chain/bsc-rpc';
import type { Candle } from './api';
import { type HolderInfo, type Tx } from './trades';
import { getPublicBscToken, getPublicBscCandles, type PublicBscDetail } from './bsc-public-market';
import { getBnbProductToken } from './fourmeme-market';
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
  for (const t of [...trades].sort((a, b) => a.time - b.time)) {
    if (t.priceUsd == null || t.priceUsd <= 0) continue;
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
      cache.set(key, { until: Date.now() + 15_000, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
async function load(address: string): Promise<BscTokenWorkspace | null> {
  const detail = await (BNB_PRODUCT ? getBnbProductToken(address) : getPublicBscToken(address));
  if (!detail) return null;
  const infoPromise = BNB_PRODUCT
    ? fetch(`https://four.meme/meme-api/v1/private/token/get/v2?address=${address}`, {
        signal: AbortSignal.timeout(6000),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const b = (await r.json()) as { code: number; data: Record<string, unknown> };
          return b.code === 0 &&
            b.data?.networkCode === 'BSC' &&
            String(b.data.address).toLowerCase() === address
            ? b.data
            : null;
        })
        .catch(() => null)
    : Promise.resolve(null);
  const metadata = async () => {
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
    if (!pools.length) {
      const info = await infoPromise,
        id = Number(info?.id);
      if (!info || !Number.isSafeInteger(id) || id <= 0)
        return { trades: [] as Tx[], activity: 'curve-unindexed' as const };
      const r = await fetch(
        `https://four.meme/meme-api/v1/public/fill?tokenId=${id}&pageIndex=1&pageSize=100`,
        { signal: AbortSignal.timeout(8000) },
      ).catch(() => null);
      if (!r?.ok) return { trades: [] as Tx[], activity: 'unavailable' as const };
      const body = (await r.json()) as { code: number; data: unknown };
      const rate =
        info.symbol === 'USDT'
          ? 1
          : detail.token.price_native && detail.token.price_usd
            ? detail.token.price_usd / detail.token.price_native
            : null;
      return {
        trades: body.code === 0 ? normalizeFourMemeActivity(body.data, id, rate) : [],
        activity: body.code === 0 ? ('available' as const) : ('unavailable' as const),
      };
    }
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
  const holders = async () => {
    const info = await infoPromise,
      id = Number(info?.id);
    if (!info || !Number.isSafeInteger(id) || id <= 0) return null;
    const r = await fetch(`https://four.meme/meme-api/v1/private/token/holder?tokenId=${id}`, {
      signal: AbortSignal.timeout(8000),
    });
    const b = (await r.json()) as {
      code: number;
      data?: { tokenHolders?: { address: string; amount: string }[] };
    };
    return r.ok && b.code === 0 && Array.isArray(b.data?.tokenHolders) ? b.data.tokenHolders : null;
  };
  const [meta, candles, rows, holderRows, info] = await Promise.all([
    metadata().catch(() => ({ decimals: detail.token.decimals, totalSupply: null })),
    getPublicBscCandles(address, '1m').catch(() => []),
    activity().catch(()=>({trades:[] as Tx[],activity:'unavailable' as const})),
    holders().catch(() => null),
    infoPromise,
  ]);
  let normalizedHolders: HolderInfo[] | null = null;
  if (holderRows && meta.decimals !== null && meta.totalSupply && BigInt(meta.totalSupply) > 0n) {
    normalizedHolders = holderRows
      .slice(0, 200)
      .flatMap((h) => {
        if (!/^0x[0-9a-f]{40}$/i.test(h.address) || !/^\d+(?:\.\d+)?$/.test(h.amount)) return [];
        const [whole, fraction = ''] = h.amount.split('.');
        const raw =
          BigInt(whole!) * 10n ** BigInt(meta.decimals!) +
          BigInt(fraction.slice(0, meta.decimals!).padEnd(meta.decimals!, '0') || '0');
        return [
          {
            wallet: h.address.toLowerCase(),
            amount: raw.toString(),
            pct: (Number(raw) * 100) / Number(meta.totalSupply),
            tags: [],
            funder: null,
          },
        ];
      })
      .sort((a, b) => b.pct - a.pct);
  }
  return {
    chainId: 56,
    detail,
    candles: candles.length ? candles : candlesFromBscTrades(rows.trades, 60),
    ...meta,
    ...rows,
    description: typeof info?.descr === 'string' ? info.descr.slice(0, 2000) : null,
    creator:
      typeof info?.userAddress === 'string' && /^0x[0-9a-f]{40}$/i.test(info.userAddress)
        ? info.userAddress.toLowerCase()
        : null,
    holders: normalizedHolders,
  };
}
