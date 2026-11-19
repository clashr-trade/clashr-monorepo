'use client';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import type { Address } from 'viem';
import type { Candle } from '@/lib/api';
import type { PublicBscDetail } from '@/lib/bsc-public-market';
import type { BscTokenWorkspace } from '@/lib/bsc-token-workspace';
import { BNB_PRODUCT } from '@/lib/product';
import { useAuth } from '@/lib/auth';
import { useTokenCallouts } from '@/lib/callouts';
import { useEthUsd } from '@/lib/profile';
import { usePosition } from '@/lib/position';
import { useNow } from '@/lib/now';
import { holderContext, toWhole, windowStats, WINDOWS } from '@/lib/trades';
import { pctSigned, short, usd } from '@/lib/format';
import { PriceChart } from './chart';
import {
  CallsPanel,
  TokenHeader,
  TokenTabs,
  useMediaQuery,
  useStoredFlag,
  type Tab,
} from './token-layout';
import { TradesTable } from './trades-table';
import { Empty, EarlyBuyersTab, HoldersTab, TopTradersTab } from './token-tabs';
import { BubbleMap } from './bubblemap';
import { PositionCard, ThesisBox } from './simple-rail';
import { SafetyGrid } from './safety-grid';
const BscSpotPanel = dynamic(() => import('../trade/bsc-spot-panel').then((m) => m.BscSpotPanel), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-surface" />,
});

/** The original workspace controls, using exclusively BNB data and execution. */
export function BscTokenView({
  detail,
  candles,
  initial,
  serverNow = 0,
}: {
  detail: PublicBscDetail;
  candles: Candle[];
  initial?: BscTokenWorkspace;
  serverNow?: number;
}) {
  const {t:translateUI}=usePlatformLanguage();
  const [data, setData] = useState<BscTokenWorkspace>(
    initial ?? {
      chainId: 56,
      detail,
      candles,
      trades: [],
      decimals: detail.token.decimals,
      totalSupply: null,
      description: null,
      creator: null,
      holders: null,
      activity: 'unavailable',
    },
  );
  const [failed, setFailed] = useState(false),
    [tab, setTab] = useState<Tab>('trades'),
    [maker, setMaker] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<string | null>(null),
    [callsOpen, setCallsOpen] = useStoredFlag('rushr.calls.56.open', true);
  const [sheet, setSheet] = useState<'buy' | 'sell' | null>(null);
  const wide = useMediaQuery('(min-width:1280px)'),
    desktop = useMediaQuery('(min-width:1024px)');
  const now = useNow(serverNow),
    session = useAuth(),
    bnbUsd = useEthUsd(BNB_PRODUCT);
  const token = data.detail.token,
    calls = useTokenCallouts(token.address, 50, BNB_PRODUCT);
  const supply = data.decimals !== null ? (toWhole(data.totalSupply, data.decimals) ?? 0) : 0;
  const t = {
    ...token,
    decimals: data.decimals ?? undefined,
    total_supply: data.totalSupply ?? undefined,
    description: data.description,
  };
  const ctx = useMemo(
    () => holderContext(data.creator ?? '', data.holders),
    [data.creator, data.holders],
  );
  const position = usePosition({
    wallet:
      BNB_PRODUCT && data.decimals !== null && session.authenticated
        ? (session.user?.wallet ?? null)
        : null,
    token: token.address,
    decimals: data.decimals ?? 18,
    priceUsd: token.price_usd ?? null,
    ethUsd: bnbUsd,
    feed: data.trades,
  });
  const stats = useMemo(
    () => windowStats(data.trades, data.candles, Math.floor(now / 1000), token.price_usd ?? null),
    [data.trades, data.candles, now, token.price_usd],
  );
  useEffect(() => {
    const ctl = new AbortController();
    let busy = false;
    const run = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const r = await fetch(`/api/bsc/public-token/${detail.token.address}/snapshot`, {
          signal: ctl.signal,
          cache: 'no-store',
        });
        if (!r.ok) throw new Error();
        const next = (await r.json()) as BscTokenWorkspace;
        if (next.chainId !== 56 || next.detail.token.address !== detail.token.address)
          throw new Error();
        if (!ctl.signal.aborted) {
          setData(next);
          setFailed(false);
        }
      } catch {
        if (!ctl.signal.aborted) setFailed(true);
      } finally {
        busy = false;
      }
    };
    if (!initial) void run();
    const timer = setInterval(run, 3_000);
    window.addEventListener('rushr:trade', run);
    return () => {
      ctl.abort();
      clearInterval(timer);
      window.removeEventListener('rushr:trade', run);
    };
  }, [detail.token.address, initial]);
  useEffect(() => {
    if (!sheet) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sheet]);
  const showMaker = (wallet: string | null) => {
    setMaker(wallet);
    if (wallet) setTab('trades');
  };
  const callsPanel = (
    <CallsPanel
      symbol={token.symbol}
      items={calls.items}
      selected={selectedCall}
      onSelect={setSelectedCall}
      serverNow={serverNow}
    />
  );
  const spotAvailable = data.detail.pools.some(p => p.dex === 'v2' || p.dex === 'v3');
  const flapCurve = data.detail.source === 'flap' && token.status !== 'migrated';
  const tradePanel = (side: 'buy' | 'sell' = 'buy') => (
    <BscSpotPanel
      token={token.address as Address}
      symbol={token.symbol}
      presentation="terminal"
      bnbUsd={bnbUsd}
      quoteUsd={token.quote_usd}
      initialSide={side}
      venueAvailable={spotAvailable||flapCurve}
      venue={flapCurve?'flap':'pancake'}
    />
  );
  const source = data.detail.source === 'flap' ? 'Flap' : 'GeckoTerminal';
  return (
    <div className="h-full overflow-y-auto pb-20 lg:overflow-hidden lg:pb-0">
      <div
        className={`grid gap-2 p-2 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] ${callsOpen ? 'xl:grid-cols-[300px_minmax(0,1fr)_340px]' : 'xl:grid-cols-[40px_minmax(0,1fr)_340px]'}`}
      >
        {wide && (
          <section
            aria-label={`Calls on ${token.symbol}`}
            className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface"
          >
            {callsOpen ? (
              <>
                <header className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
                  <h2 className="text-sm font-semibold">{translateUI("Calls on $")}{token.symbol}</h2>
                  <span className="font-mono text-xs text-muted">{calls.items?.length ?? '—'}</span>
                  <button
                    aria-label={translateUI("Hide calls")}
                    onClick={() => setCallsOpen(false)}
                    className="ml-auto p-1 text-muted"
                  >
                    <CaretLeft size={14} />
                  </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                  {callsPanel}
                </div>
              </>
            ) : (
              <button
                aria-label={translateUI("Show calls")}
                onClick={() => setCallsOpen(true)}
                className="flex flex-col items-center gap-2 py-3 text-xs text-muted"
              >
                <CaretRight size={14} />
                <span className="[writing-mode:vertical-rl]">{translateUI("Calls")}</span>
              </button>
            )}
          </section>
        )}
        <div className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:overflow-hidden">
          <TokenHeader
            t={t}
            pools={{ rows: data.detail.pools, liquidityUsd: token.liquidity_usd ?? null }}
            priceNow={token.price_usd ?? null}
            serverNow={serverNow}
          />
          {failed && (
            <p role="status" className="px-2 text-xs text-risk-medium">
              {translateUI("Market refresh delayed. Showing the last available snapshot.")}</p>
          )}
          <div className="h-[360px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-surface lg:h-auto lg:min-h-[280px] lg:flex-[1.15]">
            <PriceChart
              address={token.address}
              initial={data.candles}
              supply={supply}
              trades={data.trades}
              priceUsd={token.price_usd ?? null}
              candlesUrl={`/api/bsc/public-token/${token.address}/candles`}
              calls={calls.items}
              marks={position.trades}
              selectedCall={selectedCall}
              onSelectCall={(id) => {
                setSelectedCall(id);
                if (id) {
                  setCallsOpen(true);
                  if (!wide) setTab('calls');
                }
              }}
              avgBuy={
                position.loaded && position.holding && position.boughtTokens > 0
                  ? position.boughtUsd / position.boughtTokens
                  : null
              }
            />
          </div>
          <TokenTabs
            tab={tab}
            setTab={setTab}
            holdersCount={token.holders_known ? token.holders : null}
            callsCount={calls.items?.length ?? null}
            body={
              <>
                <p className="border-b border-white/5 px-3 py-1.5 text-[10px] text-muted">
                  {source}  {translateUI("public data · Recent")} {data.trades.length} {translateUI("trades · 3s updates. Derived trader results cover this sample only.")}{data.detail.source==='flap'&&translateUI(' USD chart values use the current indicative quote-asset/USD conversion.')}</p>
                {tab === 'calls' && callsPanel}
                {tab === 'trades' &&
                  (data.activity === 'unavailable' ? (
                    <Empty text={translateUI("Trade history is temporarily unavailable.")} />
                  ) : data.activity === 'curve-unindexed' ? (
                    <Empty text={translateUI("Trade history is unavailable for this curve.")} />
                  ) : (
                    <TradesTable
                      trades={data.trades}
                      ctx={ctx}
                      supply={supply}
                      serverNow={serverNow}
                      maker={maker}
                      onMaker={showMaker}
                      updateMode="poll"
                    />
                  ))}
                {tab === 'holders' &&
                  (data.holders ? (
                    <HoldersTab
                      holders={data.holders}
                      total={token.holders}
                      error={false}
                      ctx={ctx}
                      priceUsd={token.price_usd ?? null}
                      decimals={data.decimals ?? 18}
                      onMaker={showMaker}
                    />
                  ) : (
                    <Empty text={translateUI("Holder distribution is unavailable for this BNB token.")} />
                  ))}
                {tab === 'traders' && (
                  <TopTradersTab
                    trades={data.trades}
                    ctx={ctx}
                    priceUsd={token.price_usd ?? null}
                    decimals={data.decimals ?? 18}
                    serverNow={serverNow}
                    onMaker={showMaker}
                  />
                )}
                {tab === 'early' && (
                  <EarlyBuyersTab
                    trades={data.trades}
                    fetched={data.trades.length}
                    limit={200}
                    createdAtMs={Date.parse(token.created_at)}
                    launchIndexed={false}
                    ctx={ctx}
                    priceUsd={token.price_usd ?? null}
                    decimals={data.decimals ?? 18}
                    onMaker={showMaker}
                  />
                )}
                {tab === 'bubbles' &&
                  (data.holders?.length ? (
                    <>
                      <p className="px-4 py-3 text-xs text-muted">
                        {translateUI("Reported holder distribution. Funding relationships have not been indexed.")}</p>
                      <BubbleMap data={{ nodes: data.holders, edges: [], clusters: [] }} />
                    </>
                  ) : (
                    <Empty text={translateUI("Holder distribution is needed to draw the bubble map.")} />
                  ))}
                {tab === 'dev' && (
                  <div className="p-5 text-sm text-muted">
                    {data.creator ? (
                      <>
                        <a
                          className="text-ink underline"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://bscscan.com/address/${data.creator}`}
                        >
                          {translateUI("Creator")}{short(data.creator)}
                        </a>
                        <p className="mt-3">
                          {translateUI("This creator's other launches have not been indexed here yet.")}</p>
                      </>
                    ) : (
                      <p>{translateUI("Creator information is unavailable for this token.")}</p>
                    )}
                  </div>
                )}
              </>
            }
          />
        </div>
        <aside className="flex min-h-0 flex-col gap-2 lg:overflow-y-auto lg:[scrollbar-width:thin]">
          {desktop && tradePanel()}
          {BNB_PRODUCT && (
            <>
              <PositionCard t={token} position={position} supply={supply} />
              <ThesisBox t={token} position={position} />
            </>
          )}
          <section
            className="shrink-0 rounded-2xl border border-white/[0.06] bg-surface p-3"
            aria-label={`About ${token.symbol}`}
          >
            <h2 className="text-sm font-semibold">{translateUI("About")} {token.symbol}</h2>
            <p className="mt-2 break-words text-xs leading-relaxed text-ink/80">
              {data.description ?? token.name}
            </p>
            <p className="mt-3 text-[10px] text-muted">{translateUI('Safety uses finalized indexed data. Concentration excludes protocol pools, burns and contracts. Missing history or funding data stays unknown; the Flap label is not a safety verdict.')}</p>
            <SafetyGrid t={token} className="mt-3" />
            {!token.safety_at&&<p role="status" className="mt-2 text-[10px] text-risk-medium">{translateUI(token.safety_status==='history-unavailable'?'Launch history is unavailable; safety metrics remain unknown.':'Indexing holder history and safety data. Values appear automatically when coverage is complete.')}</p>}
            {token.safety_at&&<p className="mt-2 text-[10px] text-muted" title={token.safety_at}>{translateUI('Safety snapshot')} · {translateUI('Block')} {token.safety_block} · UTC {new Date(token.safety_at).toISOString().slice(11,19)}</p>}
            <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-white/[0.03] p-2">
              {WINDOWS.map((w) => (
                <div key={w.id} className="text-center text-[10px] text-muted">
                  {translateUI(w.label)}
                  <p
                    className={`mt-1 font-mono text-xs ${stats[w.id].change == null ? 'text-muted' : stats[w.id].change! >= 0 ? 'text-brand' : 'text-risk-high'}`}
                  >
                    {stats[w.id].change == null ? '—' : pctSigned(stats[w.id].change!, 1)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted">
              {translateUI("Price changes use available history. Unreported safety values remain unknown.")}</p>
            <details className="mt-4 border-t border-white/5 pt-3 text-xs">
              <summary className="cursor-pointer font-semibold">{translateUI("Pools & token details")}</summary>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted">{translateUI("Network")}</dt>
                  <dd>{translateUI("BNB Smart Chain")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{translateUI("Decimals")}</dt>
                  <dd>{data.decimals ?? 'Unknown'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{translateUI("Supply")}</dt>
                  <dd>{supply ? supply.toLocaleString('en-US') : translateUI("Unknown")}</dd>
                </div>
              </dl>
              {data.detail.pools.map((p) => (
                <a
                  key={p.pool_address}
                  href={`https://bscscan.com/address/${p.pool_address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex justify-between gap-2 underline"
                >
                  <span>{translateUI("PancakeSwap")} {p.dex}</span>
                  <span>{usd(p.liquidity_usd)}</span>
                </a>
              ))}
              {!data.detail.pools.length && (
                <p className="mt-3 text-muted">
                  {translateUI("Flap bonding curve. No verified PancakeSwap pool is available yet.")}</p>
              )}
            </details>
          </section>
        </aside>
      </div>
      {!desktop && (
        <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-white/10 bg-bg/95 p-3 backdrop-blur-sm [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setSheet('buy')}
            className="rounded-xl bg-go py-3 font-semibold text-bg"
          >
            {translateUI("Buy")}{token.symbol}
          </button>
          <button
            onClick={() => setSheet('sell')}
            className="rounded-xl bg-risk-high py-3 font-semibold text-bg"
          >
            {translateUI("Sell")}{token.symbol}
          </button>
        </div>
      )}
      {sheet &&
        !desktop &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Trade ${token.symbol}`}
            className="fixed inset-0 z-[90] flex items-end bg-black/60"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSheet(null);
            }}
          >
            <section className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-bg p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                aria-label={translateUI("Close trade")}
                onClick={() => setSheet(null)}
                className="mb-2 ml-auto flex p-1"
              >
                <X size={20} />
              </button>
              {tradePanel(sheet)}
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
