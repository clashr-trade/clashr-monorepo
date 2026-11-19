'use client';

import {useEffect,useState} from 'react';
import {useLandingLanguage} from './language-provider';
import {Check,Copy} from '@phosphor-icons/react';

export function ClashrContract({address}:{address:string|null}) {
 const {t}=useLandingLanguage();
  const [status,setStatus]=useState<'idle'|'copied'|'failed'>('idle');
  useEffect(()=>{if(status!=='copied')return;const timer=setTimeout(()=>setStatus('idle'),2500);return()=>clearTimeout(timer);},[status]);
  async function copy(){
    if(!address)return;
    try{await navigator.clipboard.writeText(address);setStatus('copied');}
    catch{setStatus('failed');}
  }
  return <div className="clashr-ca">
    <div className="clashr-ca-label"><span>{t("CA / BNB SMART CHAIN")}</span><span>{address?t("CONTRACT ADDRESS"):t("COMING SOON")}</span></div>
    <div className="clashr-ca-field"><span className="clashr-ca-value" aria-label={t("CLASHR contract address")}>{address||t("CA coming soon")}</span><button type="button" disabled={!address} onClick={copy} aria-label={address?t("Copy CLASHR contract address"):t("Contract address coming soon")}>{status==='copied'?<Check size={16}/>:<Copy size={16}/>}<span>{status==='copied'?t("Copied!"):t("Copy CA")}</span></button></div>
    <p className="clashr-ca-help" role="status">{status==='failed'?t("Copy unavailable. Select the address above to copy it manually."):address?t("Confirm the network and contract before trading."):t("The official address will appear here after token launch.")}</p>
  </div>;
}
