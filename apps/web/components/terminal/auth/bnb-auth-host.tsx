'use client';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import {useEffect,useState} from 'react';
import {auth,setAuthActions,setAuthState} from '@/lib/auth';
import {setMe} from '@/lib/members';
import {bscWalletProvider,bscWalletClient,switchBscWalletChain} from '@/lib/bsc-wallet';
import {bsc} from 'viem/chains';

async function session(path:string,body?:unknown){
  const response=await fetch(`/api/product/v1/auth/wallet/${path}`,{method:body?'POST':'GET',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json() as {address:`0x${string}`;message:string;error?:{message?:string}};
  if(!response.ok)throw new Error(data.error?.message??'Wallet sign-in failed');
  if(path.startsWith('nonce')&&typeof data.message!=='string')throw new Error('Invalid sign-in challenge');
  if((path==='session'||path==='verify')&&!/^0x[0-9a-fA-F]{40}$/.test(data.address))throw new Error('Invalid wallet session');
  return data;
}
const signedIn=(address:`0x${string}`)=>setAuthState({enabled:true,ready:true,authenticated:true,user:{id:`bnb:${address.toLowerCase()}`,wallet:address,externalWallet:address,walletKind:'external',email:null,twitter:null}});
export default function BnbAuthHost(){
  const {t:translateUI}=usePlatformLanguage();
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true,busy=false;
    const provider=bscWalletProvider();
    const logout=async()=>{try{await session('logout',{});}finally{if(active){setAuthState({enabled:true,ready:true,authenticated:false,user:null});setMe(null);}}};
    setAuthState({enabled:true});
    void session('session').then(data=>{if(active)signedIn(data.address);}).catch(()=>{if(active)setAuthState({ready:true,authenticated:false,user:null});});
    setAuthActions({
      login(){if(busy)return;busy=true;setError('');void(async()=>{
        const injected=bscWalletProvider();if(!injected)throw new Error('Open an EVM wallet browser to sign in.');
        const wallet=bscWalletClient(injected);const [account]=await wallet.requestAddresses();if(!account)throw new Error('No wallet account selected.');
        await switchBscWalletChain(injected);
        const challenge=await session(`nonce?address=${account}`);
        const signature=await wallet.signMessage({account,message:challenge.message});
        if(!active)return;
        const [accounts,chain]=await Promise.all([wallet.getAddresses(),wallet.getChainId()]);
        if(accounts[0]?.toLowerCase()!==account.toLowerCase()||chain!==56)throw new Error('Wallet changed during sign-in. Try again.');
        const verified=await session('verify',{message:challenge.message,signature});if(active)signedIn(verified.address);
      })().catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Wallet sign-in failed');}).finally(()=>{busy=false;});},
      logout,
      exportWallet:async()=>{throw new Error('Manage and export this external wallet in your wallet application.');},
      sendTransaction:async tx=>{
        const account=auth.state.user?.wallet,provider=bscWalletProvider();if(!account||!provider)throw new Error('Sign in with your BNB wallet first.');
        const wallet=bscWalletClient(provider),[accounts,chain]=await Promise.all([wallet.getAddresses(),wallet.getChainId()]);
        if(accounts[0]?.toLowerCase()!==account.toLowerCase()||chain!==56||auth.state.user?.wallet!==account)throw new Error('Wallet or network changed. Sign in again on BNB.');
        return wallet.sendTransaction({chain:bsc,account,to:tx.to,data:tx.data,value:tx.value??0n,...(tx.gas?{gas:tx.gas}:{})});
      },
      signTransaction:async()=>{throw new Error('Silent signing is unavailable for external BNB wallets.');},
      getAccessToken:async()=>null, // Same-origin API proxy attaches the HttpOnly session.
    });
    const changed=()=>{if(auth.state.authenticated)void logout();};
    provider?.on?.('accountsChanged',changed);provider?.on?.('chainChanged',changed);provider?.on?.('disconnect',changed);
    return()=>{active=false;setAuthActions(null);provider?.removeListener?.('accountsChanged',changed);provider?.removeListener?.('chainChanged',changed);provider?.removeListener?.('disconnect',changed);};
  },[]);
  return error?<div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-risk-high/30 bg-surface p-4 text-xs text-risk-high"><p>{error}</p><button className="mt-2 underline" onClick={()=>setError('')}>{translateUI("Dismiss")}</button></div>:null;
}
