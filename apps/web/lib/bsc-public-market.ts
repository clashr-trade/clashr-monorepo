import type { Candle, Column, TokenCard } from './api';

export interface PublicBscToken extends TokenCard {
  chain_id:56; market_column:Column; holders_known:boolean; pool_address:string; dex:'v2'|'v3'|'fourmeme';
  decimals:number|null; price_native:number|null;
}
export interface PublicBscMarket {
  chainId:56; source:'geckoterminal'|'fourmeme'; provenance:'third-party-indicative'; fetchedAt:string;
  tokens:PublicBscToken[]; partial:boolean;
}
type Resource = {id:string;type:string;attributes?:Record<string,unknown>};
interface Pool extends Resource {relationships?:Record<string,{data?:{id:string}}>}
export interface PoolDocument {data?:Pool[];included?:Resource[]}
const address = (v: unknown): v is string => typeof v==='string' && /^0x[0-9a-fA-F]{40}$/.test(v);
const amount = (v:unknown):number|null => {
  if (v==null||v==='') return null;
  const n=Number(v); return Number.isFinite(n)&&n>=0?n:null;
};
const safeImage=(v:unknown)=>typeof v==='string'&&/^https:\/\//.test(v)?v:null;

/** Public quotes are explicitly separate from canonical ingestion and never authorize trades. */
export function normalizeBscPools(document:PoolDocument,column:Column):PublicBscToken[] {
  const resources=new Map((document.included??[]).map(r=>[r.id,r]));
  const seen=new Set<string>();
  return (Array.isArray(document.data)?document.data:[]).slice(0,20).flatMap(pool=>{
    const a=pool.attributes??{}, r=pool.relationships;
    const tokenRef=r?.base_token?.data?.id??'',quoteRef=r?.quote_token?.data?.id??'';
    const dexId=r?.dex?.data?.id;
    const dex=dexId==='pancakeswap_v2'?'v2':dexId==='pancakeswap-v3-bsc'?'v3':null;
    if (!dex||!pool.id.startsWith('bsc_')||!tokenRef.startsWith('bsc_')||!quoteRef.startsWith('bsc_')||!address(a.address))return [];
    const t=resources.get(tokenRef)?.attributes??{},q=resources.get(quoteRef)?.attributes??{};
    if(!address(t.address)||!address(q.address)||typeof t.name!=='string'||typeof t.symbol!=='string')return [];
    const token=t.address.toLowerCase();
    if(seen.has(token)||tokenRef.toLowerCase()!==`bsc_${token}`||quoteRef.toLowerCase()!==`bsc_${q.address.toLowerCase()}`||pool.id.toLowerCase()!==`bsc_${a.address.toLowerCase()}`)return [];
    const created=typeof a.pool_created_at==='string'?a.pool_created_at:'';
    if(!Number.isFinite(Date.parse(created)))return [];
    seen.add(token);
    const transactions=(a.transactions as {h24?:{buys?:number;sells?:number}}|undefined)?.h24;
    const volume=a.volume_usd as {h24?:string}|undefined;
    return [{chain_id:56,market_column:column,address:token,name:t.name,symbol:t.symbol,
      launchpad:null,status:'new',created_at:created,market_cap_usd:amount(a.market_cap_usd),
      volume_24h_usd:amount(volume?.h24),liquidity_usd:amount(a.reserve_in_usd),price_usd:amount(a.base_token_price_usd),
      price_native:amount(a.base_token_price_native_currency),holders:0,holders_known:false,bonding_progress:null,
      risk:null,verdict:null,top10_pct:null,dev_pct:null,bundled_pct:null,snipers_pct:null,insiders_pct:null,fresh_pct:null,airdropped:null,
      copycat:null,serial_launcher:null,image_url:safeImage(t.image_url),quote:q.address.toLowerCase(),quote_symbol:typeof q.symbol==='string'?q.symbol:undefined,
      buys_24h:amount(transactions?.buys),sells_24h:amount(transactions?.sells),
      pool_address:a.address.toLowerCase(),dex,decimals:Number.isInteger(t.decimals)&&Number(t.decimals)>=0&&Number(t.decimals)<=36?Number(t.decimals):null,
    } satisfies PublicBscToken];
  });
}

let marketCache:{expires:number;value:PublicBscMarket}|null=null;
let marketInflight:Promise<PublicBscMarket>|null=null;
/** Share public-source requests across renders/search/polling, within its modest API budget. */
export function getPublicBscMarket(fetcher:typeof fetch=fetch):Promise<PublicBscMarket> {
  if(fetcher!==fetch)return loadPublicBscMarket(fetcher);
  if(marketCache&&marketCache.expires>Date.now())return Promise.resolve(marketCache.value);
  return marketInflight??=(loadPublicBscMarket(fetcher).then(value=>{
    marketCache={expires:Date.now()+30_000,value};return value;
  }).finally(()=>{marketInflight=null;}));
}
async function loadPublicBscMarket(fetcher:typeof fetch):Promise<PublicBscMarket> {
  const paths:[string,Column][]=[['new_pools','new'],['trending_pools','almost'],['pools','migrated']];
  const results=await Promise.allSettled(paths.map(async([path,column])=>{
    const response=await fetcher(`https://api.geckoterminal.com/api/v2/networks/bsc/${path}?include=base_token,quote_token,dex`,
      {next:{revalidate:30},signal:AbortSignal.timeout(8_000),headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('BSC public market unavailable');
    return normalizeBscPools(await response.json() as PoolDocument,column);
  }));
  if(results.every(r=>r.status==='rejected'))throw new Error('BSC public market unavailable');
  const seen=new Set<string>();
  const tokens=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(t=>{if(seen.has(t.address))return false;seen.add(t.address);return true;});
  return {chainId:56,source:'geckoterminal',provenance:'third-party-indicative',fetchedAt:new Date().toISOString(),tokens,partial:results.some(r=>r.status==='rejected')};
}

export interface PublicBscDetail { chainId:56;source:'geckoterminal'|'fourmeme';token:PublicBscToken;pools:PublicBscToken[];poolsPartial?:boolean }
const detailCache=new Map<string,{expires:number;value:PublicBscDetail|null}>();
const detailInflight=new Map<string,Promise<PublicBscDetail|null>>();
export function getPublicBscToken(token:string,fetcher:typeof fetch=fetch):Promise<PublicBscDetail|null> {
  if(!address(token))return Promise.resolve(null);
  if(fetcher!==fetch)return loadPublicBscToken(token,fetcher);
  const key=token.toLowerCase(),cached=detailCache.get(key);
  if(cached&&cached.expires>Date.now())return Promise.resolve(cached.value);
  const existing=detailInflight.get(key);if(existing)return existing;
  const task=loadPublicBscToken(key,fetcher).then(value=>{
    if(detailCache.size>=200)detailCache.delete(detailCache.keys().next().value!);
    detailCache.set(key,{expires:Date.now()+30_000,value});return value;
  }).finally(()=>{detailInflight.delete(key);});
  detailInflight.set(key,task);return task;
}
async function loadPublicBscToken(token:string,fetcher:typeof fetch):Promise<PublicBscDetail|null> {
  if(!address(token))return null;
  try {
    const response=await fetcher(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${token.toLowerCase()}/pools?include=base_token,quote_token,dex`,
      {next:{revalidate:30},signal:AbortSignal.timeout(8_000)});
    if(!response.ok)throw new Error('BSC token source unavailable');
    const document=await response.json() as PoolDocument;
    const pools=(document.data??[]).slice(0,20).flatMap(pool=>normalizeBscPools({data:[pool],included:document.included},'new'))
      .filter(pool=>pool.address===token.toLowerCase()).sort((a,b)=>(b.liquidity_usd??0)-(a.liquidity_usd??0));
    if(pools[0])return {chainId:56,source:'geckoterminal',token:pools[0],pools};
    return null;
  } catch(error) {
    // A source quota failure must not discard a pool already fetched for this exact BSC token.
    const known=fetcher===fetch&&marketCache&&marketCache.expires>Date.now()?marketCache.value.tokens.find(t=>t.address===token.toLowerCase()):undefined;
    if(known)return {chainId:56,source:'geckoterminal',token:known,pools:[known],poolsPartial:true};
    throw error;
  }
}
const CHART_INTERVALS:Record<string,[string,number]>={'1m':['minute',1],'5m':['minute',5],'15m':['minute',15],'1h':['hour',1],'4h':['hour',4]};
export async function getPublicBscCandles(token:string,interval:string,fetcher:typeof fetch=fetch):Promise<Candle[]> {
  const timeframe=CHART_INTERVALS[interval];
  if(!timeframe)throw new Error('Unsupported candle interval');
  const detail=await getPublicBscToken(token,fetcher);
  if(!detail)return [];
  const response=await fetcher(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${detail.token.pool_address}/ohlcv/${timeframe[0]}?aggregate=${timeframe[1]}&limit=300&currency=usd&token=base`,
    {next:{revalidate:30},signal:AbortSignal.timeout(8_000)});
  if(!response.ok)throw new Error('BSC chart source unavailable');
  const body=await response.json() as {data?:{attributes?:{ohlcv_list?:number[][]}}};
  const candles=new Map<number,Candle>();
  for(const row of (body.data?.attributes?.ohlcv_list??[]).slice(0,300)) {
    const [time,open,high,low,close,volume]=row;
    if(row.length<6||![time,open,high,low,close,volume].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||!Number.isInteger(time)||high!<Math.max(open!,close!)||low!>Math.min(open!,close!))continue;
    candles.set(time!,{time:time!,open:open!,high:high!,low:low!,close:close!,volume:volume!});
  }
  return [...candles.values()].sort((a,b)=>a.time-b.time);
}
