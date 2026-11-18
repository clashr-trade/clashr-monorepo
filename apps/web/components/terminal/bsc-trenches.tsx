'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import type { PublicBscMarket } from '@/lib/bsc-public-market';
import { Trenches } from './trenches';
import { BNB_PRODUCT } from '@/lib/product';

export function BscTrenches({initial,serverNow}:{initial:PublicBscMarket|null;serverNow:number}) {
  const [market,setMarket]=useState(initial);
  const [failed,setFailed]=useState(!initial);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const load=async()=>{try{
      const response=await fetch('/api/bsc/market',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error();
      const next=await response.json() as PublicBscMarket;
      if(next.chainId!==56||!['geckoterminal','fourmeme'].includes(next.source)||!Array.isArray(next.tokens)||next.tokens.some(t=>t.chain_id!==56))throw new Error();
      if(active){setMarket(next);setFailed(false);}
    }catch{if(active)setFailed(true);}};
    if(!initial)void load();
    const timer=window.setInterval(()=>void load(),BNB_PRODUCT?15_000:30_000);
    return()=>{active=false;controller.abort();window.clearInterval(timer);};
  },[initial]);
  return <div className="flex h-full min-h-0 flex-col overflow-hidden">
    {(!BNB_PRODUCT || failed) && <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] px-4 py-2 text-[11px] text-muted">
      <span className={failed||market?.partial?'text-risk-medium':''}>{failed ? market?'Public market refresh unavailable · showing last fetched data':'Public market source unavailable · retrying every 30s' : market?.partial?'GeckoTerminal · Partial BSC feed · 30s refresh':'GeckoTerminal · Public BSC quotes · 30s refresh'}</span>
      <span>Indicative data, not finalized execution inputs.</span>
      <Link href="/bsc/indexed" className="ml-auto hover:text-ink">Finalized indexer view →</Link>
    </div>}
    <div className="min-h-0 flex-1"><Trenches key="56" initial={market?.tokens??[]} serverNow={serverNow} chainId={56}/></div>
  </div>;
}
