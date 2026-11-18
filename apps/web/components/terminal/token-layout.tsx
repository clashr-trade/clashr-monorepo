'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import type { TokenCard, TokenDetail } from '@/lib/api';
import type { Callout } from '@/lib/callouts';
import {
  ageLong,
  dateTimeUtc,
  dexscreenerUrl,
  EXPLORER,
  LAUNCHPAD_LABEL,
  nf,
  pct,
  price,
  short,
  usd,
} from '@/lib/format';
import { useNow } from '@/lib/now';
import { toWhole } from '@/lib/trades';
import { RingedAvatar, RiskTag, ringOf, SocialLinks } from './bits';
import { CallsFeed } from './calls-feed';
type TokenHeaderData = TokenCard &
  Partial<Pick<TokenDetail, 'total_supply' | 'decimals' | 'description'>>;
type Pools = { liquidityUsd: number | null; rows: unknown[] };
const known = (iso: string | null | undefined) =>
  !!iso && Number.isFinite(Date.parse(iso)) && Date.parse(iso) > 0;
function Stat({ k, v, big, title }: { k: string; v: string; big?: boolean; title?: string }) {
  return (
    <div title={title}>
      <div className="text-[11px] text-muted">{k}</div>
      <div className={`font-mono ${big ? 'text-lg font-semibold' : 'text-sm'}`}>{v}</div>
    </div>
  );
}
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function TokenHeader({
  t,
  pools,
  priceNow,
  serverNow,
}: {
  t: TokenHeaderData;
  pools: Pools;
  priceNow: number | null;
  serverNow: number;
}) {
  const [copied, setCopied] = useState(false);
  const now = useNow(serverNow);
  const copy = () => {
    void navigator.clipboard?.writeText(t.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  const created = new Date(t.created_at).getTime();
  // Per-pool merge first; the card's own sum (measured pools only) until pools arrive.
  const liquidity = pools.liquidityUsd ?? t.liquidity_usd ?? null;
  const supply = toWhole(t.total_supply, t.decimals ?? 18) ?? 0;
  const mcap = priceNow && supply ? priceNow * supply : t.market_cap_usd;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-white/[0.06] bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <RingedAvatar t={t} size={52} ring={ringOf(t)} badge />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">{t.symbol}</h1>
            <span className="max-w-[16ch] truncate text-sm text-muted">{t.name}</span>
            <RiskTag risk={t.risk} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 font-mono hover:text-ink"
              title="Copy contract address"
            >
              {short(t.address)}{' '}
              {copied ? <Check size={12} className="text-brand" /> : <Copy size={12} />}
            </button>
            <span>·</span>
            <span>{LAUNCHPAD_LABEL[t.launchpad ?? ''] ?? t.launchpad}</span>
            <span>·</span>
            <span
              title={known(t.created_at) ? dateTimeUtc(t.created_at) : undefined}
              className="font-mono"
            >
              {known(t.created_at) ? ageLong(created, now) : 'age —'}
            </span>
            <span>·</span>
            <a
              href={`${EXPLORER}/token/${t.address}`}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-white/[0.05] px-1.5 py-px hover:text-ink"
            >
              Explorer
            </a>
            <a
              href={dexscreenerUrl(t.address)}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-white/[0.05] px-1.5 py-px hover:text-ink"
            >
              DexScreener
            </a>
            <SocialLinks t={t} size={14} />
          </div>
          {t.description && (
            <p className="mt-1 max-w-[60ch] truncate text-xs text-ink/70" title={t.description}>
              {t.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Stat k="Market cap" v={usd(mcap)} big />
        <Stat k="Price" v={price(priceNow)} />
        <Stat
          k="Liquidity"
          v={liquidity == null ? '—' : usd(liquidity)}
          title={
            pools.rows.length
              ? `Across ${pools.rows.length} pools`
              : 'Not reported for this token yet'
          }
        />
        <Stat k="Holders" v={t.holders_known === false ? '?' : nf.format(t.holders)} />
        <Stat k="ATH mcap" v={usd(t.ath_market_cap_usd)} />
        {t.status !== 'migrated' && t.bonding_progress != null && (
          <Stat k="Bonding" v={pct(t.bonding_progress * 100, 0)} />
        )}
      </div>
    </div>
  );
}

export type Tab = 'trades' | 'calls' | 'holders' | 'traders' | 'early' | 'bubbles' | 'dev';

/** The calls feed with its own clock (time-ago labels), so the page doesn't re-render every second. */
export function CallsPanel(props: {
  symbol: string;
  items: Callout[] | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  serverNow: number;
}) {
  const nowMs = useNow(props.serverNow);
  return (
    <CallsFeed
      symbol={props.symbol}
      items={props.items}
      selected={props.selected}
      onSelect={props.onSelect}
      nowMs={nowMs}
    />
  );
}

/** A boolean remembered in this browser (e.g. whether the calls column is open). */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === '0' || raw === '1') setV(raw === '1');
    } catch {
      // storage unavailable
    }
  }, [key]);
  const set = useCallback(
    (next: boolean) => {
      setV(next);
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // storage unavailable
      }
    },
    [key],
  );
  return [v, set];
}

export function TokenTabs({
  tab,
  setTab,
  holdersCount,
  callsCount,
  body,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  holdersCount: number | null;
  callsCount: number | null;
  body: React.ReactNode;
}) {
  const tabs: [Tab, string][] = [
    ['trades', 'Trades'],
    ['calls', callsCount ? `Calls ${callsCount}` : 'Calls'],
    ['holders', holdersCount == null ? 'Holders' : `Holders ${nf.format(holdersCount)}`],
    ['traders', 'Top traders'],
    ['early', 'Early buyers'],
    ['bubbles', 'Bubble map'],
    ['dev', "Dev's tokens"],
  ];
  return (
    <div className="flex h-[560px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
      <div className="flex gap-1 overflow-x-auto border-b border-white/[0.05] px-2 py-2 [scrollbar-width:none]">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${tab === id ? 'bg-white/[0.08] text-ink' : 'text-muted hover:text-ink'} ${id === 'calls' ? 'xl:hidden' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">{body}</div>
    </div>
  );
}
