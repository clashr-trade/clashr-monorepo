import {API_URL} from './api';

export interface LandingPosition {
  handle:string; token:string; symbol:string; imageUrl:string|null;
  realizedUsd:number; returnPct:number; boughtUsd:number; soldUsd:number; heldHours:number|null;
}
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value);
const handlePattern=/^[a-z0-9_]{3,20}$/;
async function read<T>(path:string):Promise<T|null>{
  try{const response=await fetch(API_URL+path,{next:{revalidate:120},signal:AbortSignal.timeout(5000)});return response.ok?await response.json() as T:null;}catch{return null;}
}
/** Only complete closed positions are suitable for a realized-return showcase. */
export function normalizeLandingPosition(handle:string,token:string,value:unknown):LandingPosition|null{
  if(!handlePattern.test(handle)||!address(token)||!value||typeof value!=='object')return null;
  const p=value as Record<string,unknown>;
  if(p.partial_history!==false||p.unbacked!==false||!address(p.token)||p.token.toLowerCase()!==token.toLowerCase())return null;
  if(typeof p.symbol!=='string'||!p.symbol.trim())return null;
  if(!['bought_usd','sold_usd','realized_usd','buys','sells'].every(key=>typeof p[key]==='number'&&Number.isFinite(p[key])))return null;
  if((p.bought_usd as number)<=0||(p.sold_usd as number)<0||(p.buys as number)<1||(p.sells as number)<1)return null;
  try{if(BigInt(String(p.held_tokens))!==0n||BigInt(String(p.transferred_out_tokens))!==0n)return null;}catch{return null;}
  const first=typeof p.first_trade_at==='string'?Date.parse(p.first_trade_at):NaN;
  const last=typeof p.last_trade_at==='string'?Date.parse(p.last_trade_at):NaN;
  const returnPct=(p.realized_usd as number)/(p.bought_usd as number)*100;
  if(!Number.isFinite(returnPct))return null;
  return {handle,token:token.toLowerCase(),symbol:p.symbol,imageUrl:typeof p.image_url==='string'?p.image_url:null,realizedUsd:p.realized_usd as number,returnPct,boughtUsd:p.bought_usd as number,soldUsd:p.sold_usd as number,heldHours:Number.isFinite(first)&&Number.isFinite(last)&&last>=first?(last-first)/3600000:null};
}
export async function getLandingPosition(handle:string,token:string,wallet?:string):Promise<LandingPosition|null>{
  if(!handlePattern.test(handle)||!address(token))return null;
  const owner=wallet??(await read<{member?:{wallet?:string}}>(`/v1/members/${encodeURIComponent(handle)}`))?.member?.wallet;
  if(!address(owner))return null;
  const body=await read<{position?:unknown}>(`/wallets/${owner.toLowerCase()}/positions/${token.toLowerCase()}`);
  return normalizeLandingPosition(handle,token,body?.position);
}
export async function findLandingPosition(handle:string,wallet?:string):Promise<LandingPosition|null>{
  if(!handlePattern.test(handle)||!address(wallet))return null;
  const body=await read<{positions?:{token?:string}[]}>(`/wallets/${wallet.toLowerCase()}/pnl?limit=3`);
  if(!Array.isArray(body?.positions))return null;
  const results=await Promise.all(body.positions.slice(0,3).filter(row=>address(row?.token)).map(row=>getLandingPosition(handle,row.token!,wallet)));
  return results.find(Boolean)??null;
}
