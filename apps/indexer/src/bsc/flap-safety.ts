import {computeSignals,tagHolders,type TokenSnapshot} from '@rushr/core';
import {createPublicClient,http,type Address} from 'viem';
import {bsc} from 'viem/chains';
import type {Sql} from 'postgres';
import {FLAP_PORTAL} from './flap';

const ZERO='0x0000000000000000000000000000000000000000';
const DEAD='0x000000000000000000000000000000000000dead';
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v);
/** Only empty code and exact EIP-7702 delegation designators count as EOAs. */
export const bscWalletIsContract=(code:string)=>code!=='0x'&&!/^0xef0100[0-9a-f]{40}$/i.test(code);
export interface SafetyCoverage {holders:boolean;launch:boolean;funding:boolean}
/** Reuse Rushr maths but never turn absent BSC enrichment into safe-looking zeroes or a risk verdict. */
export function projectFlapSafety(snapshot:TokenSnapshot,coverage:SafetyCoverage){
 const s=computeSignals(snapshot);
 const walletTags=Object.fromEntries(Object.entries(tagHolders(snapshot)).map(([wallet,tags])=>[wallet,tags.filter(tag=>tag==='dev'||tag==='sniper'&&coverage.launch||tag==='bundler'&&coverage.launch&&coverage.funding||['insider','fresh'].includes(tag)&&coverage.holders&&coverage.funding)]));
 return {
  top10Pct:coverage.holders?s.top10Pct:null,devPct:coverage.holders&&address(snapshot.deployer)?s.devPct:null,
  burntPct:coverage.holders?s.burntPct??null:null,
  sniperCount:coverage.launch?s.sniperCount:null,snipersPct:coverage.launch&&coverage.holders?s.snipersPct:null,
  bundledPct:coverage.launch&&coverage.funding&&coverage.holders?s.bundledPct:null,
  bundledStillHeldPct:coverage.launch&&coverage.funding&&coverage.holders?s.bundledStillHeldPct:null,
  insidersPct:coverage.holders&&coverage.funding?s.insidersPct:null,
  freshWalletsPct:coverage.holders&&coverage.funding?s.freshWalletsPct:null,
  // Observed sells and absence of a warning are not proof that a future sell will succeed.
  noSells:null,verified:null,renounced:null,risk:null,verdict:null,
  coverage,walletTags,exclusions:'protocol-pools-burns-contracts',
 };
}

/** The optional provider method is enrichment only; unsupported/errors are not negative findings. */
export async function firstFunding(url:string,wallet:string,through:bigint,fetcher:typeof fetch=fetch){
 try{
  const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[{toAddress:wallet,fromBlock:'0x0',toBlock:`0x${through.toString(16)}`,category:['external','internal'],order:'asc',maxCount:'0x1',excludeZeroValue:true,withMetadata:true}]})});
  if(r.status===400||r.status===404)return {status:'unsupported' as const};
  if(!r.ok)return {status:'unknown' as const};
  const body=await r.json() as {id?:number;error?:{code?:number};result?:{transfers?:{from?:string;to?:string;blockNum?:string;metadata?:{blockTimestamp?:string}}[]}};
  if(body.error?.code===-32601||body.error?.code===-32602)return {status:'unsupported' as const};
  const t=body.result?.transfers?.[0],from=t?.from?.toLowerCase(),time=Date.parse(t?.metadata?.blockTimestamp??'');
  if(body.id!==1||body.error||!address(from)||t?.to?.toLowerCase()!==wallet||!/^0x[0-9a-f]+$/i.test(t?.blockNum??'')||BigInt(t!.blockNum!)>through||!Number.isFinite(time))return {status:'unknown' as const};
  return {status:'known' as const,funder:from,at:new Date(time)};
 }catch{return {status:'unknown' as const};}
}
let fundingUnavailableUntil=0;
/** Bounded background enrichment; never runs on the market request or live-ingestion critical path. */
export async function refreshFlapSafety(sql:Sql,rpcUrl:string,token:string){
 const [t]=await sql`select t.*,w.block,w.block_hash,w.complete,w.checked_at from chain_v2.flap_tokens t join chain_v2.flap_holder_watches w on w.chain_id=t.chain_id and w.address=t.address where t.chain_id=56 and t.address=${token}`;
 if(!t?.complete||!t.total_supply||BigInt(t.total_supply)<=0n||!t.checked_at||Date.now()-new Date(t.checked_at).getTime()>300000)return false;
 const through=BigInt(t.block),client=createPublicClient({chain:bsc,transport:http(rpcUrl,{timeout:5000,retryCount:0})});
 if(await client.getChainId()!==56)throw new Error('Wrong safety RPC chain');
 const header=await client.getBlock({blockNumber:through});if(header.hash!==t.block_hash)throw new Error('Safety checkpoint ancestry mismatch');
 const balances=await sql`select wallet,amount::text from chain_v2.flap_balances where chain_id=56 and token=${token} and amount>0 order by amount desc,wallet limit 1001`;
 const events=await sql`select block,time,payload from chain_v2.flap_events where chain_id=56 and token=${token} and event='TokenBought' and block<=${through.toString()} and time<=${t.created_at??new Date(0)}::timestamptz+interval '60 seconds' order by block,log_index limit 2001`;
 const excluded=new Set([ZERO,DEAD,FLAP_PORTAL,token,String(t.state?.pool??'').toLowerCase()]);
 const wanted=[...new Set([t.creator,...balances.map(b=>b.wallet),...events.map(e=>String(e.payload.buyer).toLowerCase())].filter(w=>address(w)&&!excluded.has(w)))];
 let facts=await sql`select * from chain_v2.flap_wallet_facts where chain_id=56 and address in ${sql(wanted.length?wanted:[''])}`;
 let byWallet=new Map(facts.map(f=>[f.address,f]));
 // At most 20 code reads + 20 optional funding calls per pass; later passes resume cached work.
 const codeKnown=(f:typeof facts[number]|undefined)=>f?.is_contract!=null&&f.code_block!=null&&BigInt(f.code_block)<=through&&f.code_checked_at&&Date.now()-new Date(f.code_checked_at).getTime()<=300000;
 const missing=wanted.filter(w=>!codeKnown(byWallet.get(w))).slice(0,20);
 for(let i=0;i<missing.length;i+=4)await Promise.all(missing.slice(i,i+4).map(async wallet=>{
  const code=await client.getBytecode({address:wallet as Address,blockNumber:through});
  await sql`insert into chain_v2.flap_wallet_facts(chain_id,address,is_contract,code_block,code_checked_at) values(56,${wallet},${bscWalletIsContract(code??'0x')},${through.toString()},now()) on conflict(chain_id,address) do update set is_contract=excluded.is_contract,code_block=excluded.code_block,code_checked_at=excluded.code_checked_at`;
 }));
 if(Date.now()>fundingUnavailableUntil)for(const wallet of wanted.filter(w=>{const f=byWallet.get(w);return !f?.funding_checked_at||f.funding_status!=='known'&&Date.now()-new Date(f.funding_checked_at).getTime()>3600000;}).slice(0,20)){
  const f=await firstFunding(rpcUrl,wallet,through);
  await sql`insert into chain_v2.flap_wallet_facts(chain_id,address,first_funder,funded_at,funding_status,funding_checked_at) values(56,${wallet},${f.status==='known'?f.funder:null},${f.status==='known'?f.at:null},${f.status},now()) on conflict(chain_id,address) do update set first_funder=excluded.first_funder,funded_at=excluded.funded_at,funding_status=excluded.funding_status,funding_checked_at=excluded.funding_checked_at`;
  if(f.status==='unsupported'){fundingUnavailableUntil=Date.now()+3600000;break;}
 }
 facts=await sql`select * from chain_v2.flap_wallet_facts where chain_id=56 and address in ${sql(wanted.length?wanted:[''])}`;byWallet=new Map(facts.map(f=>[f.address,f]));
 const people=balances.filter(b=>!excluded.has(b.wallet)&&codeKnown(byWallet.get(b.wallet))&&byWallet.get(b.wallet)?.is_contract===false);
 const holdersComplete=balances.length<=1000&&balances.every(b=>excluded.has(b.wallet)||codeKnown(byWallet.get(b.wallet)));
 const [cursor]=await sql`select 1 from (select * from chain_v2.market_cursors union all select * from chain_v2.flap_live_cursors) c where chain_id=56 and halt_reason is null and start_block<=${t.created_block??'-1'} and block>=${through.toString()} limit 1`;
 const launch=!!t.created_at&&!!cursor&&events.length<=2000&&!!t.creator;
 const funding=wanted.every(w=>{const f=byWallet.get(w);return f?.funding_status==='known'&&f.funded_at&&new Date(f.funded_at).getTime()<=Number(header.timestamp)*1000;});
 const common=new Set((await sql`select first_funder from chain_v2.flap_wallet_facts where chain_id=56 and first_funder is not null group by first_funder having count(*)>=50`).map(r=>r.first_funder));
 const wallets=Object.fromEntries(wanted.map(w=>{const f=byWallet.get(w);return [w,{firstFunder:f?.first_funder&&!common.has(f.first_funder)?f.first_funder:null,firstSeen:f?.funded_at?Math.floor(new Date(f.funded_at).getTime()/1000):null}];}));
 const data=projectFlapSafety({address:token,symbol:t.symbol,totalSupply:BigInt(t.total_supply),deployer:t.creator??'',createdAt:t.created_at?Math.floor(new Date(t.created_at).getTime()/1000):0,createdBlock:BigInt(t.created_block??0),holders:people.map(b=>({wallet:b.wallet,amount:BigInt(b.amount)})),burnt:balances.filter(b=>b.wallet===ZERO||b.wallet===DEAD).reduce((a,b)=>a+BigInt(b.amount),0n),holderCount:people.length,earlyBuys:events.map(e=>({trader:String(e.payload.buyer).toLowerCase(),block:BigInt(e.block),time:Math.floor(new Date(e.time).getTime()/1000),tokenAmount:BigInt(e.payload.amount)})),launchIndexed:launch,wallets,airdropped:[],devTokens:[],twinOrganicHolders:0,launchpad:'flap',now:Number(header.timestamp)}, {holders:holdersComplete,launch,funding});
 if((await client.getBlock({blockNumber:through})).hash!==header.hash)throw new Error('Safety ancestry changed');
 await sql`insert into chain_v2.flap_safety_snapshots(chain_id,address,block,block_hash,data) values(56,${token},${through.toString()},${header.hash},${sql.json(data)}) on conflict(chain_id,address) do update set block=excluded.block,block_hash=excluded.block_hash,data=excluded.data,computed_at=now() where flap_safety_snapshots.block<=excluded.block`;
 return true;
}
