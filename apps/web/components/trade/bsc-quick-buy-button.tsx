'use client';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import dynamic from 'next/dynamic';
import {formatUnits,parseUnits,type Address} from 'viem';
import {Lightning,X} from '@phosphor-icons/react';
import {useEthQuote} from '@/lib/profile';
const Panel=dynamic(()=>import('./bsc-spot-panel').then(module=>module.BscSpotPanel),{ssr:false});
export function BscQuickBuyButton({token,symbol,amountUsd,venue='pancake'}:{token:Address;symbol:string;amountUsd:number;venue?:'flap'|'pancake'}){
  const {t:translateUI}=usePlatformLanguage();
  const [open,setOpen]=useState(false),[amount,setAmount]=useState<string|null>(null);
  const native=useEthQuote(open);
  useEffect(()=>{
    if(!open)return;
    if(!amount&&native?.usd&&Number.isFinite(native.usd)&&native.usd>0){
      const raw=parseUnits(amountUsd.toFixed(2),2)*10n**24n/parseUnits(native.usd.toFixed(8),8);
      if(raw>0n)setAmount(formatUnits(raw,18));
    }
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);setAmount(null);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[open,amount,native?.usd,amountUsd]);
  const close=()=>{setOpen(false);setAmount(null);};
  return <><button type="button" title={`Review a $${amountUsd} BNB buy of ${symbol}`} onClick={()=>setOpen(true)} className="flex items-center gap-0.5 rounded-lg bg-brand/15 px-2 py-1 font-mono text-[11px] font-semibold text-brand hover:bg-brand/25"><Lightning size={10} weight="fill"/>${amountUsd}</button>
    {open&&createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
      <section role="dialog" aria-modal="true" aria-label={`Buy ${symbol}`} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-bg p-3 shadow-2xl">
        <header className="mb-3 flex items-center justify-between px-2"><h2 className="text-sm font-semibold">{translateUI("Buy")} {symbol}</h2><button aria-label={translateUI("Close buy review")} onClick={close}><X size={18}/></button></header>
        <p className="mb-3 px-2 text-[11px] text-muted">${amountUsd} · {translateUI('Indicative USD budget. Review the payment asset, exact input and minimum output before confirming.')}</p>
        {amount?<Panel venue={venue} token={token} symbol={symbol} initialAmount={amount} initialUsd={amountUsd} bnbUsd={native?.usd}/>:<p role="status" className="p-6 text-xs text-muted">{translateUI("Loading BNB/USD conversion. No transaction requested.")}</p>}
      </section>
    </div>,document.body)}
  </>;
}
