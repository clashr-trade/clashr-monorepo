'use client';

import {usePlatformLanguage} from '@/components/landing/language-provider';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowSquareOut, ArrowsClockwise, CheckCircle, CircleNotch, Copy, Database, LockKey, MagnifyingGlass, ShieldCheck } from '@phosphor-icons/react';
import { formatUnits } from 'viem';
import { getNetwork } from '@clashr/core/chain/networks';
import type { BscCoverage, BscPool, BscSwap, BscToken } from '@/lib/bsc-preview';
import { GeneratedAvatar } from './avatar';

type Phase = 'loading' | 'ready' | 'offline' | 'syncing' | 'error' | 'not-found';
type Snapshot = { phase: Phase; tokens: BscToken[]; pools: BscPool[]; swaps: BscSwap[]; coverage?: BscCoverage };
type ReadBody = { error?: string; tokens?: BscToken[]; token?: BscToken; pools?: BscPool[]; swaps?: BscSwap[]; coverage?: BscCoverage };
const blank: Snapshot = { phase:'loading',tokens:[],pools:[],swaps:[] };
const explorer = getNetwork(56).explorer;
const short = (v: string) => `${v.slice(0,6)}…${v.slice(-4)}`;
const displayAmount = (raw: string, decimals: number) => {
  try {
    const exact = formatUnits(BigInt(raw),decimals);
    const [whole, fraction = ''] = exact.split('.');
    if (whole === '0' && fraction.length > 8 && /^0{8}/.test(fraction)) return '<0.00000001';
    return `${whole}${fraction ? `.${fraction.slice(0,8).replace(/0+$/,'')}`.replace(/\.$/,'') : ''}`;
  } catch { return 'Unavailable'; }
};

function BnbMark({ large = false }: { large?: boolean }) {
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] ${large ? 'size-16' : 'size-11'}`}>
    <span className={`rotate-45 border-[3px] border-amber-300 ${large ? 'size-6' : 'size-4'}`}><span className="m-[3px] block size-1.5 bg-amber-300" /></span>
  </span>;
}

export function BscMarkets({ address }: { address?: string }) {
  const {t:translateUI}=usePlatformLanguage();
  const [snapshot,setSnapshot] = useState<Snapshot>(blank);
  const [refreshing,setRefreshing] = useState(false);
  const [search,setSearch] = useState('');
  const [copied,setCopied] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setRefreshing(true);
    try {
      const root = `/api/bsc/tokens${address ? `/${address}` : ''}`;
      const responses = await Promise.all((address ? [root,`${root}/pools`,`${root}/swaps`] : [root]).map((url) => fetch(url,{cache:'no-store',signal:controller.signal})));
      const bodies = await Promise.all(responses.map((r) => r.json() as Promise<ReadBody>));
      if (controller.signal.aborted) return;
      const failure = responses.findIndex((r) => !r.ok);
      if (failure !== -1) {
        const code = bodies[failure]?.error;
        const phase = code === 'bsc_not_configured' ? 'offline' : code === 'chain_data_not_ready' ? 'syncing' : code === 'token_not_found' ? 'not-found' : 'error';
        setSnapshot({...blank,phase});
      } else {
        const first = bodies[0];
        if (!first?.coverage || (address ? !first.token : !Array.isArray(first.tokens))) throw new Error('Invalid market response');
        setSnapshot({phase:'ready',tokens:address ? [first.token!] : first.tokens!,
          pools:bodies[1]?.pools ?? [],swaps:bodies[2]?.swaps ?? [],coverage:first.coverage});
      }
    } catch {
      if (!controller.signal.aborted) setSnapshot({...blank,phase:'error'});
    } finally { if (!controller.signal.aborted) setRefreshing(false); }
  },[address]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(),30_000);
    return () => { window.clearInterval(timer); pending.current?.abort(); };
  },[load]);

  const {phase,coverage,pools,swaps} = snapshot;
  const ready = phase === 'ready';
  const token = address ? snapshot.tokens[0] : undefined;
  const filtered = snapshot.tokens.filter((t) => `${t.name} ${t.symbol} ${t.address}`.toLowerCase().includes(search.toLowerCase()));
  const status = ready ? 'Finalized data connected' : phase === 'loading' ? 'Checking connection' : phase === 'syncing' ? 'Waiting for verified data' : phase === 'offline' ? 'Data source not connected' : phase === 'not-found' ? 'Token outside indexed coverage' : 'Data temporarily unavailable';

  return <main className="h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,rgba(245,197,66,0.035),transparent_55%)]">
    <div className="mx-auto max-w-[1560px] space-y-6 px-4 py-6 sm:px-7 lg:py-8">
      {address && <Link href="/bsc/indexed" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink"><ArrowLeft />{translateUI("Back to BNB markets")}</Link>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {token ? <GeneratedAvatar address={token.address} symbol={token.symbol} size={44} /> : <BnbMark />}
          <div><div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-200"><span>{translateUI("BNB Smart Chain")}</span><span className="rounded border border-amber-300/20 px-1.5 py-0.5 text-[9px]">{translateUI("Preview")}</span></div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{token ? token.symbol || 'Unnamed token' : address ? translateUI("Pool activity") : translateUI("BNB Markets")}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className={`flex items-center gap-2 text-xs ${ready ? 'text-emerald-300' : 'text-muted'}`}><span className={`size-1.5 rounded-full ${ready ? 'bg-emerald-300' : 'bg-amber-300'}`} />{status}</span>
          <button onClick={() => void load()} disabled={refreshing} aria-label={translateUI("Refresh BNB markets")} className="rounded-lg border border-white/10 bg-surface p-2.5 text-muted transition hover:text-ink disabled:opacity-50"><ArrowsClockwise size={16} className={refreshing ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 [&>section:first-child]:col-span-2 sm:grid-cols-3 sm:[&>section:first-child]:col-span-1">
        <Metric label={address ? 'Token' : 'Market scope'} value={token ? token.name || short(token.address) : address ? short(address) : 'PancakeSwap v2 + v3'} detail={address ? 'BNB Smart Chain · Chain 56' : 'WBNB pairs in the indexed window'} />
        <Metric label={translateUI("Settlement")} value="Finalized blocks only" detail={coverage ? `Blocks ${coverage.fromBlock} – ${coverage.throughBlock}` : 'Coverage appears after the indexer is ready'} />
        <Metric label={address ? 'Verified pools' : 'Tokens in this view'} value={ready ? String(address ? pools.length : snapshot.tokens.length) : '—'} detail={address ? 'Factory membership verified on-chain' : 'Up to 50 most recently observed tokens'} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-surface/75">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2.5"><span className="size-1.5 rounded-full bg-amber-300" /><h2 className="text-sm font-medium">{address ? translateUI("Finalized pool executions") : translateUI("Spot markets")}</h2><span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-muted">{address ? translateUI("Latest 100") : translateUI("WBNB")}</span></div>
            {!address && <label className="relative"><MagnifyingGlass className="absolute left-2.5 top-2.5 text-muted" size={14} /><input aria-label={translateUI("Filter BNB tokens")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={translateUI("Filter name or address")} className="w-52 rounded-lg border border-white/[0.07] bg-bg/40 py-2 pl-8 pr-3 text-xs outline-none focus:border-amber-300/30" /></label>}
            {address && <a className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-amber-200" href={`${explorer}/token/${address}`} target="_blank" rel="noopener noreferrer">{translateUI("View on BscScan")}<ArrowSquareOut size={13} /></a>}
          </div>

          {!ready ? <EmptyState phase={phase} detail={!!address} /> : address ? (
            swaps.length ? <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead className="border-b border-white/[0.05] font-mono text-[10px] uppercase tracking-wide text-muted"><tr>{['Side','Token amount','WBNB amount','BNB / token','Block / transaction'].map((label) => <th key={label} className="px-5 py-3 font-normal">{translateUI(label)}</th>)}</tr></thead><tbody>
              {swaps.map((swap) => <tr key={`${swap.tx}:${swap.log_index}`} className="border-b border-white/[0.04] last:border-0"><td className={`px-5 py-4 ${swap.side === 'buy' ? 'text-emerald-300' : 'text-rose-300'}`}>{swap.side === 'buy' ? translateUI("Buy") : translateUI("Sell")}</td><td className="px-5 py-4 font-mono" title={swap.token_amount}>{token ? displayAmount(swap.token_amount,token.decimals) : translateUI("Unavailable")}</td><td className="px-5 py-4 font-mono" title={swap.quote_amount}>{displayAmount(swap.quote_amount,18)}</td><td className="px-5 py-4 font-mono" title={swap.native_execution_price ?? ''}>{swap.native_execution_price ?? '—'}</td><td className="px-5 py-4"><a href={`${explorer}/tx/${encodeURIComponent(swap.tx)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-muted hover:text-amber-200">{swap.block}<ArrowSquareOut size={12} /></a></td></tr>)}
            </tbody></table></div> : <EmptyState phase="ready" detail />
          ) : filtered.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-white/[0.05] font-mono text-[10px] uppercase tracking-wide text-muted"><tr>{['Token','Quote','Current price','Source',''].map((label) => <th key={label || 'action'} className="whitespace-nowrap px-5 py-3 font-normal">{translateUI(label)}</th>)}</tr></thead><tbody>
            {filtered.map((t) => <tr key={`56:${t.address}`} className="border-b border-white/[0.04] transition last:border-0 hover:bg-white/[0.025]"><td className="px-5 py-4"><Link href={`/bsc/indexed/token/${t.address}`} className="flex items-center gap-3"><GeneratedAvatar address={t.address} symbol={t.symbol} size={34} /><div><div className="font-semibold">{t.symbol || short(t.address)}</div><div className="mt-1 max-w-40 truncate text-[11px] text-muted">{t.name || short(t.address)}</div></div></Link></td><td className="px-5 py-4 text-amber-200">{translateUI("WBNB")}</td><td className="px-5 py-4 text-muted" title={translateUI("Liquidity-validated spot pricing is not available yet")}>{translateUI("Not available")}</td><td className="whitespace-nowrap px-5 py-4 text-muted">{translateUI("PancakeSwap")}</td><td className="whitespace-nowrap px-5 py-4 text-right"><Link href={`/bsc/indexed/token/${t.address}`} className="text-amber-200 hover:underline">{translateUI("View pools →")}</Link></td></tr>)}
          </tbody></table></div> : <EmptyState phase="ready" filtered={!!search} />}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3 font-mono text-[10px] text-muted"><span>{translateUI("CHAIN 56 · BNB / WBNB")}</span><span>{ready ? translateUI("Refreshes every 30 seconds") : translateUI("Waiting for a verified source")}</span></div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.025] p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-medium">{translateUI("Trading")}</h2><LockKey className="text-amber-200" size={17} /></div>
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-bg/50 p-1"><span className="rounded-md bg-white/[0.05] py-2 text-center text-xs text-muted">{translateUI("Buy")}</span><span className="py-2 text-center text-xs text-muted">{translateUI("Sell")}</span></div>
            <h3 className="text-sm font-medium">{translateUI("Market preview comes first.")}</h3><p className="mt-2 text-xs leading-relaxed text-muted">{translateUI("Browse verified pool activity while quoting, simulation and wallet support are being prepared.")}</p>
            <button disabled className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-xs font-medium text-muted"><LockKey size={14} />{translateUI("Trading not enabled")}</button>
            <p className="mt-3 text-center text-[10px] text-muted">{translateUI("No wallet connection or approval required.")}</p>
          </section>
          <section className="rounded-2xl border border-white/[0.07] bg-surface/75 p-5"><h2 className="mb-4 text-sm font-medium">{translateUI("What you’re viewing")}</h2>
            <Policy title={translateUI("Finalized pool activity")} detail="Block hashes checked before data is shown." />
            <Policy title={translateUI("Verified PancakeSwap pools")} detail="WBNB pairs from the selected coverage window." />
            <Policy title={translateUI("Execution ratios in BNB")} detail="Per-swap ratios, not a current-price oracle." />
            <div className="mt-4 border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-muted">{translateUI("USD values, wallet PnL, risk ratings and launchpad curves are not available in this preview.")}</div>
          </section>
          {token && <section className="rounded-2xl border border-white/[0.07] bg-surface/75 p-5"><h2 className="mb-3 text-sm font-medium">{translateUI("Token contract")}</h2><div className="flex items-center justify-between font-mono text-xs text-muted"><span>{short(token.address)}</span><button aria-label={translateUI("Copy BNB token contract")} onClick={async () => { try { await navigator.clipboard.writeText(token.address); setCopied(true); } catch { setCopied(false); } }} className="p-1 hover:text-ink">{copied ? <CheckCircle className="text-emerald-300" /> : <Copy />}</button></div><div className="mt-3 text-[11px] text-muted">{token.decimals}  {translateUI("decimals · Supply snapshot at block")} {token.supply_block ?? 'unknown'}</div></section>}
          {!!pools.length && <section className="rounded-2xl border border-white/[0.07] bg-surface/75 p-5"><h2 className="mb-3 text-sm font-medium">{translateUI("Verified pools")}</h2>{pools.map((pool) => <a key={`${pool.dex}:${pool.id}`} href={`${explorer}/address/${pool.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between border-t border-white/[0.05] py-3 text-xs first:border-0"><span className="text-muted">{translateUI("PancakeSwap")} {pool.dex}</span><span className="flex items-center gap-2 font-mono text-amber-200">{short(pool.id)}<ArrowSquareOut size={12} /></span></a>)}</section>}
        </aside>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-4 text-[11px] text-muted"><span>{translateUI("BNB Smart Chain · PancakeSwap spot preview")}</span><Link href="/trenches" className="hover:text-ink">{translateUI("Return to Robinhood markets →")}</Link></div>
    </div>
  </main>;
}

function Metric({label,value,detail}: {label:string;value:string;detail:string}) {
  const {t:translateUI}=usePlatformLanguage();
  return <section className="rounded-xl border border-white/[0.07] bg-surface/60 px-5 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{translateUI(label)}</p><p className="mt-2 truncate text-base font-medium tracking-tight">{value}</p><p className="mt-1.5 text-[11px] text-muted">{translateUI(detail)}</p></section>;
}
function Policy({title,detail}: {title:string;detail:string}) {
  const {t:translateUI}=usePlatformLanguage();
  return <div className="mb-3 flex gap-2.5 last:mb-0"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-amber-200/70" /><div><p className="text-xs">{translateUI(title)}</p><p className="mt-1 text-[11px] leading-relaxed text-muted">{translateUI(detail)}</p></div></div>;
}
function EmptyState({phase,detail,filtered}: {phase:Phase;detail?:boolean;filtered?:boolean}) {
  const {t:translateUI}=usePlatformLanguage();
  const title = phase === 'loading' ? 'Checking BNB market data' : phase === 'offline' ? 'Connect a BNB market data source' : phase === 'syncing' ? 'Waiting for finalized coverage' : phase === 'not-found' ? 'This token is outside indexed coverage' : phase === 'error' ? 'BNB market data is unavailable' : filtered ? 'No matching tokens in this view' : detail ? 'No finalized executions in this window' : 'No WBNB pairs in this window yet';
  const description = phase === 'offline' ? 'The BNB preview is ready. Its independent market feed has not been connected to this app yet.' : phase === 'syncing' ? 'The source is not ready to serve a fresh, fully verified window. Data will appear after its checks pass.' : phase === 'error' ? 'The verified source could not be reached. Refresh to try again.' : phase === 'not-found' ? 'Only tokens discovered in the indexed window are available here. Open a token from the BNB market list.' : phase === 'loading' ? 'Verifying the independent data source and indexed block range.' : filtered ? 'Try a different name, ticker or contract address.' : 'This view only includes independently indexed PancakeSwap WBNB pools. Robinhood market data is never used here.';
  return <div aria-live="polite" className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center sm:min-h-[340px]">
    {phase === 'loading' ? <CircleNotch className="animate-spin text-amber-200" size={32} /> : <div className="mb-1 grid size-16 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.02]"><Database size={27} weight="light" className="text-amber-200/70" /></div>}
    <h3 className="mt-5 text-base font-medium tracking-tight">{translateUI(title)}</h3><p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">{translateUI(description)}</p>
    {phase !== 'ready' && phase !== 'loading' && <div className="mt-6 flex flex-wrap justify-center gap-2 text-[10px] text-muted"><span className="rounded-full border border-white/10 px-3 py-1">{translateUI("Chain 56")}</span><span className="rounded-full border border-white/10 px-3 py-1">{translateUI("PancakeSwap v2 / v3")}</span><span className="rounded-full border border-white/10 px-3 py-1">{translateUI("Finalized only")}</span></div>}
  </div>;
}
