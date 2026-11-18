'use client';
import {useEffect,useState} from 'react';
import type {TokenCard} from './api';
export function useBscTokenSearch(query:string) {
  const [result,setResult]=useState<{query:string;tokens:TokenCard[]}>({query:'',tokens:[]});
  useEffect(()=>{
    if(query.trim().length<2)return;
    const ctl=new AbortController();
    const timer=window.setTimeout(()=>{
      void fetch(`/api/bsc/search?q=${encodeURIComponent(query.trim().slice(0,64))}`,{signal:ctl.signal})
        .then(async response=>response.ok?await response.json() as {chainId:number;tokens:TokenCard[]}:null)
        .then(body=>{if(!ctl.signal.aborted)setResult({query,tokens:body?.chainId===56?body.tokens.filter(t=>t.chain_id===56):[]});})
        .catch(()=>{if(!ctl.signal.aborted)setResult({query,tokens:[]});});
    },300);
    return()=>{ctl.abort();window.clearTimeout(timer);};
  },[query]);
  return result.query===query?result.tokens:[];
}
