'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useTokenSearch } from '@/lib/search';
import { useBscTokenSearch } from '@/lib/bsc-search';
import {bscSigningEnabled} from '@/lib/bsc-flags';
import { isBscPath, terminalNavigation, terminalNetworkDestination } from '@/lib/terminal-navigation';
import { BNB_PRODUCT } from '@/lib/product';
import { usd } from '@/lib/format';
import { TokenAvatar, RiskDot } from './bits';
import { AccountMenu } from './auth/account-menu';
import { FeedbackButton } from './feedback';

export function TopBar() {
  const path = usePathname();
  const bsc = BNB_PRODUCT || isBscPath(path);
  const navigation = terminalNavigation(path);
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-bg/90 px-3 backdrop-blur-md sm:gap-4 sm:px-4">
      <Link href="/" aria-label="Rushr home" className="flex items-center gap-2">
        <Image src="/logo-mark.png" alt="" width={22} height={22} priority />
        <span className="text-lg font-semibold tracking-[-0.04em]">rushr</span>
        {/* Same dashed chip as the landing's, in the dark theme. */}
        <span className="rounded-full border border-dashed border-white/20 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-muted">Beta</span>
      </Link>
      <label className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs md:ml-0">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${bsc ? 'bg-amber-300' : 'bg-brand'}`} />
        {BNB_PRODUCT?<span aria-label="BNB Smart Chain"><span className="sm:hidden">BNB</span><span className="hidden sm:inline">BNB Smart Chain</span></span>:<select aria-label="Network" value={bsc ? '56' : '4663'} onChange={(e) => router.push(terminalNetworkDestination(path, e.target.value === '56' ? 56 : 4663))} className="max-w-36 cursor-pointer bg-surface text-ink outline-none">
          <option value="56">BNB Smart Chain</option>
          {!BNB_PRODUCT && <option value="4663">Robinhood Chain</option>}
        </select>}
      </label>
      <nav aria-label="Primary navigation" className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-sm lg:flex">
        {navigation.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            aria-current={n.active ? 'page' : undefined}
            className={`rounded-lg px-2 py-1.5 transition xl:px-3 ${n.active ? 'bg-white/[0.07] text-ink' : 'text-muted hover:text-ink'}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <Search chainId={bsc?56:4663}/>
      <div className="ml-auto flex items-center gap-2">
        {BNB_PRODUCT ? <><FeedbackButton/><AccountMenu /></> : bsc ? <span className="whitespace-nowrap rounded-full border border-amber-300/20 px-2 py-1 font-mono text-[10px] text-amber-200">{bscSigningEnabled()?'Wallet confirmed':'Signing off'}</span> : <><FeedbackButton /><AccountMenu /></>}
      </div>
    </header>
  );
}

/**
 * The same five sections as a tab row under the top bar on phones, where the bar has no room for them. A row
 * rather than a bottom tab bar: the token page already pins its trade bar to the bottom of the screen.
 */
export function MobileNav() {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="grid shrink-0 grid-cols-5 border-b border-white/[0.06] bg-bg/90 text-[12px] backdrop-blur-md lg:hidden">
      {terminalNavigation(path).map((n) => {
        const on = n.active;
        return (
          <Link
            key={n.label}
            href={n.href}
            aria-current={on ? 'page' : undefined}
            className={`relative py-2.5 text-center transition ${on ? 'font-medium text-ink' : 'text-muted active:text-ink'}`}
          >
            {n.label}
            {on && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}

function Search({chainId=4663}:{chainId?:56|4663}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const legacyResults = useTokenSearch(chainId===4663?q:'');
  const bscResults=useBscTokenSearch(chainId===56?q:'');
  const results=chainId===56?bscResults:legacyResults;
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses search, like most terminals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (address: string) => {
    setOpen(false);
    setQ('');
    router.push(`${chainId===56&&!BNB_PRODUCT?'/bsc':''}/token/${address}`);
  };

  return (
    <div className="relative hidden min-w-0 w-full max-w-md xl:block">
      <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = q.trim();
            if (/^0x[0-9a-fA-F]{40}$/.test(v)) go(v.toLowerCase());
            else if (results[0]) go(results[0].address);
          }
        }}
        placeholder={chainId===56?'Search BNB view or paste a contract':'Search token, contract or ticker'}
        className="w-full rounded-xl border border-white/[0.06] bg-surface py-2 pl-9 pr-10 text-sm outline-none placeholder:text-muted focus:border-white/15"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 font-mono text-[10px] text-muted">/</kbd>
      {open && q.trim().length >= 2 && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full mt-2 max-h-96 overflow-auto rounded-xl border border-white/10 bg-surface-2 p-1 shadow-2xl">
          {results.map((t) => (
            <li key={t.address}>
              <button
                type="button"
                onMouseDown={() => go(t.address)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.05]"
              >
                <TokenAvatar t={t} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {t.symbol} <RiskDot risk={t.risk} />
                  </span>
                  <span className="block truncate text-xs text-muted">{t.name}</span>
                </span>
                <span className="font-mono text-xs">{usd(t.market_cap_usd)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
