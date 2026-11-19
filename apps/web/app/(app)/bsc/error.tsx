'use client';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import Link from 'next/link';
export default function BscError({reset}:{reset:()=>void}) {
  const {t:translateUI}=usePlatformLanguage();
  return <div role="alert" className="grid h-full place-items-center px-6 text-center"><div><h1 className="text-lg font-semibold">{translateUI("BNB market data could not be loaded")}</h1><p className="mt-2 text-sm text-muted">{translateUI("The public data provider may be temporarily unavailable.")}</p><button onClick={reset} className="mt-5 rounded-xl border border-white/10 px-4 py-2 text-sm">{translateUI("Try again")}</button><Link href="/bsc" className="ml-4 text-sm text-muted">{translateUI("Return to Trenches")}</Link></div></div>;
}
