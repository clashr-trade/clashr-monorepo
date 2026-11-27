import {getPublicBscToken,type PublicBscMarket,type PublicBscToken,type PublicBscDetail} from './bsc-public-market';
import type {Candle} from './api';
import type {Tx,HolderInfo} from './trades';
import {cache} from 'react';
export async function getFlapHolders(address:string):Promise<HolderInfo[]|null>{
 const origin=process.env.PRODUCT_API_URL??'http://127.0.0.1:8790';
 if(!/^0x[0-9a-f]{40}$/i.test(address))return null;
 const r=await fetch(origin+'/flap/holders?address='+address,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return null;
 const b=await r.json() as {chainId:number;available:boolean;holders:HolderInfo[]};return b.chainId===56&&b.available?b.holders:null;
}
export async function getFlapTrades(address:string):Promise<Tx[]>{
 if(!/^0x[0-9a-f]{40}$/i.test(address))throw new Error('Invalid address');
 const origin=process.env.PRODUCT_API_URL??'http://127.0.0.1:8790';
 const response=await fetch(`${origin}/flap/trades?address=${address.toLowerCase()}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Flap activity unavailable');
 const body=await response.json() as {chainId:number;trades:Tx[]};
 if(body.chainId!==56||!Array.isArray(body.trades))throw new Error('Invalid Flap activity');
 return body.trades;
}
const ZERO='0x0000000000000000000000000000000000000000';
interface IndexedFlapRow {
 coin:{address:string;name:string;symbol:string};
 creator:string|null;metadataCid:string|null;metadata:Record<string,unknown>|null;
 decimals:number|null;totalSupply:string|null;
}
// Share metadata and page reads within a single render, without persisting data.
const indexed=cache(async(address?:string)=>{
 const origin=process.env.PRODUCT_API_URL??'http://127.0.0.1:8790';
 const response=await fetch(`${origin}/flap/market${address?'?address='+address:''}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Flap finalized index unavailable');
 const body=await response.json() as {chainId:number;provenance:string;items:IndexedFlapRow[];checkedAt:string;stale?:boolean;lagBlocks?:number;cursor?:string};
 if(!body||body.chainId!==56||body.provenance!=='finalized-onchain'||!Array.isArray(body.items))throw new Error('Invalid Flap index');
 return body;
});
export function normalizeIndexedFlap(rows:unknown):PublicBscToken[]{
 if(!Array.isArray(rows))return [];
 return rows.slice(0,150).flatMap(r=>{
  if(r.chainId!==56||!/^0x[0-9a-f]{40}$/.test(r.coin?.address)||!Number.isInteger(r.decimals)||r.decimals<0||r.decimals>36)return [];
  const progress=Number(r.progress);if(!Number.isFinite(progress)||progress<0||progress>100)return [];
  if(!Number.isFinite(Date.parse(r.createdAt))&&!r.listed&&progress<50)return [];
  return [{chain_id:56,address:r.coin.address,name:r.coin.name,symbol:r.coin.symbol,launchpad:'flap',status:r.listed?'migrated':'bonding',
   market_column:r.listed?'migrated':progress>=50?'almost':'new',created_at:r.createdAt??'',
   price_usd:r.priceUsd??null,market_cap_usd:r.priceUsd&&r.totalSupply?Number(r.totalSupply)/10**r.decimals*r.priceUsd:null,liquidity_usd:r.liquidityUsd??null,volume_24h_usd:r.volume24hUsd??null,price_native:r.priceNative??null,price_source:r.priceSource??null,
   holders:r.holders??0,holders_known:Number.isInteger(r.holders),bonding_progress:progress/100,quote:r.quoteToken,quote_symbol:r.quoteSymbol??(r.quoteToken===ZERO?'BNB':null),
   image_url:typeof r.coin.image==='string'&&r.coin.image.startsWith('https://')?r.coin.image:null,risk:null,verdict:null,top10_pct:r.safety?.top10Pct??null,dev_pct:r.safety?.devPct??null,bundled_pct:r.safety?.bundledPct??null,snipers_pct:r.safety?.snipersPct??null,insiders_pct:r.safety?.insidersPct??null,fresh_pct:r.safety?.freshWalletsPct??null,airdropped:null,copycat:null,serial_launcher:null,
   signals:r.safety??undefined,
   quote_usd:r.quoteUsd??null,
   safety_status:r.safetyStatus??(r.safety?'partial':'indexing'),
   safety_at:r.safety?.computedAt??null,safety_block:r.safety?.throughBlock??null,
   website:r.metadata?.website??null,twitter:r.metadata?.twitter??null,telegram:r.metadata?.telegram??null,
   buy_tax_pct:Number(r.tax.buyTaxBps)/100,sell_tax_pct:Number(r.tax.sellTaxBps)/100,
   decimals:r.decimals,pool_address:r.poolAddress??'',dex:'flap'} satisfies PublicBscToken];
 });
}
let cached:{until:number;value:PublicBscMarket}|null=null,pending:Promise<PublicBscMarket>|null=null;
export function getFlapMarket():Promise<PublicBscMarket>{
 if(cached&&cached.until>Date.now())return Promise.resolve(cached.value);
 return pending??=indexed().then(body=>{
  const value:PublicBscMarket={chainId:56,source:'flap',provenance:'finalized-onchain',fetchedAt:body.checkedAt,tokens:normalizeIndexedFlap(body.items),partial:false,stale:body.stale,lagBlocks:body.lagBlocks,indexedBlock:body.cursor};
  cached={until:Date.now()+1000,value};return value;
 }).finally(()=>{pending=null;});
}
export async function getFlapTokenInfo(address:string):Promise<Record<string,unknown>|null>{
 if(!/^0x[0-9a-f]{40}$/.test(address.toLowerCase()))return null;
 const body=await indexed(address.toLowerCase()),r=body.items[0];
 return r?{address:r.coin.address,name:r.coin.name,symbol:r.coin.symbol,creator:r.creator,metadataCid:r.metadataCid,metadata:r.metadata,decimals:r.decimals,totalSupply:r.totalSupply}:null;
}
export const getBnbProductToken=cache(async(address:string):Promise<PublicBscDetail|null>=>{
 if(!/^0x[0-9a-f]{40}$/i.test(address))return null;
 let bodyError:unknown;let token:PublicBscToken|undefined;
 try{token=normalizeIndexedFlap((await indexed(address.toLowerCase())).items)[0];}catch(error){bodyError=error;}
 if(token&&token.status!=='migrated')return {chainId:56,source:'flap',token,pools:[]};
 try{const spot=await getPublicBscToken(address);if(spot){
  if(token)return {chainId:56,source:'flap',token:{...token,price_usd:spot.token.price_usd,market_cap_usd:spot.token.market_cap_usd,liquidity_usd:spot.token.liquidity_usd,volume_24h_usd:spot.token.volume_24h_usd},pools:spot.pools};
  return spot;
 }}catch{/* Existing indexed tokens remain available during third-party pool discovery failure. */}
 if(token)return {chainId:56,source:'flap',token,pools:[]};if(bodyError)throw bodyError;return null;
});
// Historical executions displayed using the current indicative quote-asset/USD conversion.
export async function getFlapCandles(address:string,interval:string):Promise<Candle[]>{
 const seconds:Record<string,number>={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400};
 if(!seconds[interval])throw new Error('Invalid interval');
 const {candlesFromBscTrades}=await import('./bsc-token-workspace');
 return candlesFromBscTrades(await getFlapTrades(address),seconds[interval]!);
}
