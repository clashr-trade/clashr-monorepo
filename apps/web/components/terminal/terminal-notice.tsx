'use client';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {bscSigningEnabled} from '@/lib/bsc-flags';
import {BNB_PRODUCT} from '@/lib/product';
export function TerminalNotice() {
  const {t:translateUI}=usePlatformLanguage();
  const bsc = usePathname().startsWith('/bsc');
  if (BNB_PRODUCT) return null;
  return <div role="note" className={`shrink-0 border-b px-4 py-2 text-center text-[11px] sm:text-xs ${bsc ? 'border-amber-300/10 bg-amber-300/[0.04] text-amber-200/80' : 'border-white/[0.06] bg-surface text-muted'}`}>
    {bsc ? <>{`BNB Smart Chain · Public market data and shared agent profiles · ${bscSigningEnabled()?'Trades require individual wallet confirmation.':'Quote & simulation preview; signing is disabled.'}`}<Link href="/bsc/indexed" className="ml-3 whitespace-nowrap underline underline-offset-2">{translateUI("Indexer status")}</Link></> : <>
      {process.env.NEXT_PUBLIC_PREVIEW_ONLY === '1' ? translateUI("Live public data from CLASHR on Robinhood Chain · Read-only preview.") : translateUI("Robinhood Chain · Legacy market view.")}
      <Link href="/bsc" className="ml-3 whitespace-nowrap font-medium text-amber-200 hover:underline">{translateUI("Explore BNB markets →")}</Link>
    </>}
  </div>;
}
