import {displayQuotes} from './flap-pricing';
export async function flapHolders(sql:Sql,address:string){
 const [watch]=await sql`select w.*,t.total_supply from chain_v2.flap_holder_watches w join chain_v2.flap_tokens t on t.chain_id=w.chain_id and t.address=w.address where w.chain_id=56 and w.address=${address}`;
 if(!watch?.complete||!watch.total_supply||BigInt(watch.total_supply)<=0n)return {available:false,holders:null};
 const [count]=await sql`select count(*)::int as n from chain_v2.flap_balances where chain_id=56 and token=${address} and amount>0`;
 const rows=await sql`select wallet,amount::text from chain_v2.flap_balances where chain_id=56 and token=${address} and amount>0 order by amount desc,wallet limit 200`;
 const [safety]=await sql`select data from chain_v2.flap_safety_snapshots where chain_id=56 and address=${address} and block<=${String(watch.block)} and computed_at>now()-interval '5 minutes'`;
 return {available:true,through:watch.block,count:count!.n,holders:rows.map(r=>({wallet:r.wallet,amount:r.amount,pct:Number(BigInt(r.amount)*1000000n/BigInt(watch.total_supply))/10000,tags:safety?.data.walletTags?.[r.wallet]??[],funder:null}))};
}
import type { Sql } from 'postgres';
export async function flapTrades(sql:Sql,address:string,rpcUrl?:string){
 const rows=await sql`select e.*,t.decimals,t.state from chain_v2.flap_events e join chain_v2.flap_tokens t on t.chain_id=e.chain_id and t.address=e.token
  where e.chain_id=56 and e.token=${address} and e.event in ('TokenBought','TokenSold') order by e.block desc,e.log_index desc limit 300`;
 const quotes=await displayQuotes(rows.map(r=>r.state.quoteTokenAddress),rpcUrl);
 return rows.filter(r=>r.decimals!==null).map(r=>{const conversion=quotes.get(r.state.quoteTokenAddress.toLowerCase());return {id:`${r.tx}:${r.log_index}`,tx:r.tx,time:Math.floor(new Date(r.time).getTime()/1000),block:String(r.block),logIndex:r.log_index,
  trader:String(r.payload.buyer??r.payload.seller).toLowerCase(),side:r.event==='TokenBought'?'buy':'sell',
  tokens:Number(r.payload.amount)/10**r.decimals,
  priceUsd:conversion?Number(r.payload.postPrice)/1e18*conversion.usd:null,
  usd:conversion?Number(r.payload.eth)/10**conversion.decimals*conversion.usd:null,tags:[]};});
}
/** Indexed protocol state plus explicitly indicative USD conversion and complete holder snapshots. */
export async function flapMarket(sql:Sql,address?:string,rpcUrl?:string){
 const [cursor]=await sql`select block,observed_finalized,checked_at,halt_reason from (select * from chain_v2.market_cursors union all select * from chain_v2.flap_live_cursors) c where chain_id=56 order by block desc nulls last limit 1`;
 if(!cursor || cursor.halt_reason)throw new Error('Flap index not ready');
 const rows=address
  ?await sql`select * from chain_v2.flap_tokens where chain_id=56 and address=${address} and state is not null`
  :await sql`with ranked as (
 select *,row_number() over(partition by case when state->>'status'='4' then 'migrated' when state->>'status'='1' and (state->>'progress')::numeric>=500000000000000000 then 'almost' else 'new' end
 order by created_block desc nulls last,state_block desc,address) as column_rank from chain_v2.flap_tokens where chain_id=56 and (state->>'status'='4' or (state->>'status'='1' and (created_block is not null or (state->>'progress')::numeric>=500000000000000000))))
 select * from ranked where column_rank<=50 order by created_block desc nulls last,state_block desc,address`;
 // Enrol the feed too, throttling queue writes independently of 2s HTTP reads.
 if(rows.length)await sql`insert into chain_v2.flap_holder_watches(chain_id,address,detail_requested_at)
  select 56,address,case when ${!!address} then now() else null end from chain_v2.flap_tokens where chain_id=56 and address in ${sql(rows.map(r=>r.address))}
  on conflict(chain_id,address) do update set requested_at=now(),detail_requested_at=case when ${!!address} then now() else flap_holder_watches.detail_requested_at end
  where flap_holder_watches.requested_at<now()-interval '30 seconds' or (${!!address} and (flap_holder_watches.detail_requested_at is null or flap_holder_watches.detail_requested_at<now()-interval '15 seconds'))`;
 const counts=rows.length?await sql`select w.address,count(b.wallet)::int as n from chain_v2.flap_holder_watches w left join chain_v2.flap_balances b on b.chain_id=w.chain_id and b.token=w.address and b.amount>0 where w.chain_id=56 and w.complete=true and w.address in ${sql(rows.map(r=>r.address))} group by w.address`:[];
 const countsByAddress=new Map(counts.map(r=>[r.address,r.n]));
 const safetyRows=rows.length?await sql`select address,data,block,computed_at from chain_v2.flap_safety_snapshots where chain_id=56 and address in ${sql(rows.map(r=>r.address))} and computed_at>now()-interval '5 minutes'`:[];
 const safetyByAddress=new Map(safetyRows.map(r=>[r.address,{...r.data,throughBlock:String(r.block),computedAt:new Date(r.computed_at).toISOString()}]));
 const watchRows=rows.length?await sql`select address,block,last_error from chain_v2.flap_holder_watches where chain_id=56 and address in ${sql(rows.map(r=>r.address))}`:[];
 const watches=new Map(watchRows.map(r=>[r.address,r]));
 const quotes=await displayQuotes(rows.map(r=>r.state.quoteTokenAddress),rpcUrl);
 const items=rows.filter(row=>[1,4].includes(Number(row.state.status))).map(row=>{
  const s=row.state;
  const conversion=quotes.get(s.quoteTokenAddress.toLowerCase());
  const safety=safetyByAddress.get(row.address),watch=watches.get(row.address);
  return {coin:{address:row.address,name:row.name,symbol:row.symbol,image:row.metadata_json?.image??null},metadata:row.metadata_json??null,listed:Number(s.status)===4,launchMode:'curve',
   createdAt:row.created_at?new Date(row.created_at).toISOString():null,quoteToken:s.quoteTokenAddress,quoteSymbol:conversion?.symbol??null,quoteUsd:conversion?.usd??null,
   progress:Number(BigInt(s.progress)*10000n/10n**18n)/100,
   tax:{buyTaxBps:s.buyTaxRate,sellTaxBps:s.sellTaxRate},
   chainId:56,decimals:row.decimals,priceNative:s.quoteTokenAddress==='0x0000000000000000000000000000000000000000'?Number(s.price)/1e18:null,
   totalSupply:row.total_supply,priceUsd:conversion?Number(s.price)/1e18*conversion.usd:null,usdConversionAt:conversion?.at??null,
   metadataCid:row.metadata_cid,creator:row.creator,stateBlock:row.state_block,holders:countsByAddress.get(row.address)??null,safety:safety??null,
   safetyStatus:safety?(safety.coverage?.holders&&safety.coverage?.launch&&safety.coverage?.funding?'ready':'partial'):row.created_block===null||watch?.last_error==='history_unavailable'?'history-unavailable':watch?.last_error?'retrying':'indexing',
  };
 });
 const lagBlocks=Math.max(0,Number(BigInt(cursor.observed_finalized??cursor.block??0)-BigInt(cursor.block??0)));
 return {chainId:56,source:'flap',provenance:'finalized-onchain',cursor:cursor.block,checkedAt:cursor.checked_at,lagBlocks,stale:!cursor.checked_at||Date.now()-new Date(cursor.checked_at).getTime()>60000||lagBlocks>100,items};
}
