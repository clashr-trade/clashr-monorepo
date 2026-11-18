import {getPublicBscToken,type PublicBscDetail,type PublicBscMarket,type PublicBscToken} from './bsc-public-market';
const MANAGER='0x5c952063c7fc8610ffdb798152d69f0b9550762b';
const WBNB='0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const USDT='0x55d398326f99059ff775485246999027b3197955';
const number=(v:unknown)=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};
export function normalizeFourMemeRows(rows:unknown,bnbUsd:number|null):PublicBscToken[]{
  if(!Array.isArray(rows))return [];
  return rows.slice(0,60).flatMap((r:Record<string,unknown>)=>{
    if(!r||r.networkCode!==0||typeof r.tokenAddress!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(r.tokenAddress)
      ||typeof r.name!=='string'||typeof r.shortName!=='string'||!['PUBLISH','TRADE'].includes(String(r.status)))return [];
    const progress=number(r.progress),time=number(r.createDate);
    if(progress===null||progress>1||!time||!Number.isSafeInteger(time)||time<1_000_000_000_000)return [];
    const quote=r.symbol==='BNB'?'BNB':r.symbol==='USDT'?'USDT':null;
    const rate=quote==='USDT'?1:quote==='BNB'?bnbUsd:null;
    const convert=(v:unknown)=>{const n=number(v);return n===null||rate===null?null:n*rate;};
    const migrated=r.status==='TRADE';
    const image=typeof r.img==='string'?(r.img.startsWith('/market/')?`https://static.four.meme${r.img}`:r.img.startsWith('https://')?r.img:null):null;
    return [{chain_id:56,address:r.tokenAddress.toLowerCase(),symbol:r.shortName,name:r.name,launchpad:'fourmeme',
      status:migrated?'migrated':'bonding',market_column:migrated?'migrated':progress>=0.5?'almost':'new',created_at:new Date(time).toISOString(),
      market_cap_usd:convert(r.cap),price_usd:convert(r.price),price_native:quote==='BNB'?number(r.price):bnbUsd&&convert(r.price)!==null?convert(r.price)!/bnbUsd:null,
      volume_24h_usd:number(r.day1Vol),liquidity_usd:null,holders:number(r.hold)??0,holders_known:number(r.hold)!==null,
      bonding_progress:progress,risk:null,verdict:null,top10_pct:null,dev_pct:null,bundled_pct:null,snipers_pct:null,insiders_pct:null,fresh_pct:null,
      airdropped:null,copycat:null,serial_launcher:null,image_url:image,quote:quote==='BNB'?WBNB:quote==='USDT'?USDT:null,quote_symbol:quote,
      pool_address:MANAGER,dex:'fourmeme',decimals:null,
      buy_tax_pct:number(r.taxFee)===null?null:number(r.taxFee)!*100,sell_tax_pct:number(r.taxFeeSell)===null?null:number(r.taxFeeSell)!*100,
    } satisfies PublicBscToken];
  });
}
let cache:{until:number;value:PublicBscMarket}|null=null,inflight:Promise<PublicBscMarket>|null=null;
export function getFourMemeMarket(fetcher:typeof fetch=fetch):Promise<PublicBscMarket>{
  if(fetcher!==fetch)return load(fetcher);
  if(cache&&cache.until>Date.now())return Promise.resolve(cache.value);
  return inflight??=load(fetcher).then(value=>{cache={until:Date.now()+15_000,value};return value;}).finally(()=>{inflight=null;});
}
async function load(fetcher:typeof fetch):Promise<PublicBscMarket>{
  let bnbUsd:number|null=null;
  try{
    const quote=await fetcher(`https://api.dexscreener.com/latest/dex/tokens/${WBNB}`,{signal:AbortSignal.timeout(6000)});
    const data=await quote.json() as {pairs?:{chainId:string;baseToken:{address:string};priceUsd:string;liquidity?:{usd:number}}[]};
    const pairs=(data.pairs??[]).filter(p=>p.chainId==='bsc'&&p.baseToken.address.toLowerCase()===WBNB&&number(p.priceUsd));
    pairs.sort((a,b)=>(b.liquidity?.usd??0)-(a.liquidity?.usd??0));bnbUsd=number(pairs[0]?.priceUsd);
  }catch{/* Missing conversion stays unknown, never interpreted as a USD price. */}
  const results=await Promise.allSettled(['NEW','PROGRESS','DEX'].map(async type=>{
    const response=await fetcher('https://four.meme/meme-api/v1/public/token/ranking',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({type,pageSize:50}),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('Four.meme market unavailable');
    const body=await response.json() as {code:number;data:unknown};if(body.code!==0)throw new Error('Four.meme market unavailable');
    return normalizeFourMemeRows(body.data,bnbUsd);
  }));
  if(results.every(result=>result.status==='rejected'))throw new Error('Four.meme market unavailable');
  const unique=new Map<string,PublicBscToken>();
  for(const result of results)if(result.status==='fulfilled')for(const token of result.value)unique.set(token.address,token);
  return {chainId:56,source:'fourmeme',provenance:'third-party-indicative',fetchedAt:new Date().toISOString(),tokens:[...unique.values()],partial:results.some(result=>result.status==='rejected')};
}
export async function getBnbProductToken(address:string):Promise<PublicBscDetail|null>{
  try{const spot=await getPublicBscToken(address);if(spot)return spot;}catch{/* A curve may not have a Pancake pool yet. */}
  const market=await getFourMemeMarket().catch(()=>null);
  const known=market?.tokens.find(t=>t.address===address.toLowerCase());
  if(known)return {chainId:56,source:'fourmeme',token:known,pools:[]};
  const response=await fetch(`https://four.meme/meme-api/v1/private/token/get/v2?address=${encodeURIComponent(address)}`,{signal:AbortSignal.timeout(8000)});
  if(!response.ok)return null;
  const body=await response.json() as {code:number;data?:Record<string,unknown>};
  const d=body.data;if(body.code!==0||d?.networkCode!=='BSC'||String(d.address).toLowerCase()!==address.toLowerCase())return null;
  const p=d.tokenPrice as Record<string,unknown>|undefined;
  const conversion=market?.tokens.find(t=>t.price_native&&t.price_usd);
  const bnbUsd=conversion?conversion.price_usd!/conversion.price_native!:null;
  const [token]=normalizeFourMemeRows([{...d,networkCode:0,tokenAddress:d.address,img:d.image,progress:p?.progress,price:p?.price,cap:p?.marketCap,hold:p?.holderCount,day1Vol:p?.dayTrading}],bnbUsd);
  return token?{chainId:56,source:'fourmeme',token,pools:[]}:null;
}
