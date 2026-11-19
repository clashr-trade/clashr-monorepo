import {createPublicClient,erc20Abi,http,type Address} from 'viem';
import {bsc} from 'viem/chains';
const ZERO='0x0000000000000000000000000000000000000000';
const WBNB='0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
export type DisplayQuote={usd:number;at:string;decimals:number;symbol:string};
const memo=new Map<string,{until:number;value:DisplayQuote|null}>();
const pending=new Map<string,Promise<DisplayQuote|null>>();
const assets=new Map<string,{decimals:number;symbol:string}>();
/** Current indicative display conversion only; never an execution input or historical USD oracle. */
export function assetDisplayQuote(asset:string,rpcUrl?:string):Promise<DisplayQuote|null>{
 const address=asset.toLowerCase();
 if(!/^0x[0-9a-f]{40}$/.test(address))return Promise.resolve(null);
 const cached=memo.get(address);if(cached&&cached.until>Date.now())return Promise.resolve(cached.value);
 const active=pending.get(address);if(active)return active;
 const request=(async()=>{
  const native=address===ZERO;
  let metadata=native?{decimals:18,symbol:'BNB'}:assets.get(address);
  if(!metadata){
   if(!rpcUrl)return null;
   const client=createPublicClient({chain:bsc,transport:http(rpcUrl,{timeout:4000,retryCount:0})});
   if(await client.getChainId()!==56)return null;
   const [decimals,symbol]=await Promise.all([
    client.readContract({address:address as Address,abi:erc20Abi,functionName:'decimals'}),
    client.readContract({address:address as Address,abi:erc20Abi,functionName:'symbol'}),
   ]);
   if(!Number.isInteger(decimals)||decimals<0||decimals>36)return null;
   metadata={decimals,symbol:symbol.slice(0,40)};
   if(assets.size>=128)assets.delete(assets.keys().next().value!);assets.set(address,metadata);
  }
  const token=native?WBNB:address;
  const response=await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;
  const body=await response.json() as {pairs?:{chainId:string;baseToken?:{address:string};priceUsd:string;liquidity?:{usd:number}}[]};
  const pairs=(body.pairs??[]).filter(p=>p.chainId==='bsc'&&p.baseToken?.address.toLowerCase()===token&&Number.isFinite(Number(p.priceUsd))&&Number(p.priceUsd)>0&&Number(p.liquidity?.usd)>0)
   .sort((a,b)=>Number(b.liquidity!.usd)-Number(a.liquidity!.usd));
  return pairs[0]?{...metadata,usd:Number(pairs[0].priceUsd),at:new Date().toISOString()}:null;
 })().catch(()=>null).then(value=>{
  if(memo.size>=128)memo.delete(memo.keys().next().value!);
  memo.set(address,{until:Date.now()+(value?60000:10000),value});return value;
 }).finally(()=>pending.delete(address));
 pending.set(address,request);return request;
}
export function bnbDisplayQuote(){return assetDisplayQuote(ZERO);}
/** Bound first-look RPC/HTTP fanout when a feed contains several quote assets. */
export async function displayQuotes(addresses:string[],rpcUrl?:string){
 const unique=[...new Set(addresses.map(a=>a.toLowerCase()))];
 const quotes=new Map<string,DisplayQuote|null>();
 for(let i=0;i<unique.length;i+=4)await Promise.all(unique.slice(i,i+4).map(async a=>quotes.set(a,await assetDisplayQuote(a,rpcUrl))));
 return quotes;
}
