import {Hono} from 'hono';
import {createPublicClient,http,parseAbi,formatUnits,erc20Abi,type Address,type Hash} from 'viem';
import {bsc} from 'viem/chains';
import type {Sql} from 'postgres';
import {BSC_PUBLIC_RPC} from '@rushr/core/chain/bsc-rpc';
import {applyTrade,emptyPosition} from '@rushr/core';
import {assertBscQuote,quoteBscSpot,simulateBscSpot,reconcileBscSpot,type BscSpotQuote,type BscApproval} from '@rushr/trade/bsc';
import {fail,limit,requireMember,type Ctx} from '../agents/http';
import {refreshWalletPnl} from '../data';
import {safetyOf} from '../agents/agents';

const jsonSafe=(value:unknown)=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
const clientFor=(rpc?:string)=>createPublicClient({chain:bsc,transport:http(rpc??BSC_PUBLIC_RPC)});
const FEED='0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee' as const; // Official Chainlink BSC BNB/USD registry, checked 2026-11-18.
const ORACLE=parseAbi(['function decimals() view returns (uint8)','function description() view returns (string)','function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)']);
export function reviveBscQuote(value:unknown):BscSpotQuote{
  if(!value||typeof value!=='object')throw fail(422,'invalid_quote','A reviewed BNB quote is required.');
  const q=value as Record<string,unknown>,r=q.request as Record<string,unknown>|undefined;
  const raw=(v:unknown)=>{if(typeof v!=='string'||!/^\d{1,78}$/.test(v))throw fail(422,'invalid_quote','Invalid raw quote amount.');return BigInt(v);};
  const quote={...q,request:{...r,amountIn:raw(r?.amountIn)},amountOut:raw(q.amountOut),minAmountOut:raw(q.minAmountOut),blockNumber:raw(q.blockNumber)} as unknown as BscSpotQuote;
  try{assertBscQuote(quote,quote.quotedAt);}catch{throw fail(422,'invalid_quote','BNB quote identity did not verify.');}
  return quote;
}
export function reviveBscApprovals(value:unknown):{tx:BscApproval;hash:Hash}[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>2)throw fail(422,'invalid_approvals','At most two exact approvals are allowed.');
  return value.map(row=>{if(!row?.tx||!/^0x[0-9a-f]{64}$/.test(row.hash)||!/^\d{1,78}$/.test(row.tx.amount)||!/^\d{1,78}$/.test(row.tx.value))throw fail(422,'invalid_approvals','Invalid approval receipt.');
    return {hash:row.hash,tx:{...row.tx,amount:BigInt(row.tx.amount),value:BigInt(row.tx.value)}};
  });
}
export async function journalBscTrade(sql:Sql,client:ReturnType<typeof clientFor>,quote:BscSpotQuote,hash:Hash,approvals:{tx:BscApproval;hash:Hash}[]=[]){
  const accounting=await reconcileBscSpot(client,quote,hash,approvals);
  const record=accounting.transactions[0]!;
  const [previous]=await sql`select block_hash,finalized from verified_bnb_trades where tx_hash=${hash}`;
  if(previous?.finalized&&previous.block_hash!==record.blockHash){await sql`update product_config set halted=true where singleton=true`;throw fail(503,'finalized_reorg','Finalized receipt changed; product accounting halted.');}
  const block=await client.getBlock({blockNumber:record.block});
  await sql`insert into verified_bnb_trades(tx_hash,account,token,side,block_number,block_hash,token_amount,native_amount,gas_wei,finalized,quote,approvals,eligible)
    values(${hash},${quote.request.trader},${quote.request.token},${quote.request.side},${record.block.toString()},${record.blockHash},${accounting.actualTokenAmount.toString()},${accounting.actualNativeAmount.toString()},${accounting.networkFeeWei.toString()},${accounting.finality==='finalized'},${sql.json(jsonSafe(quote))},${sql.json(jsonSafe(approvals))},${record.status==='success'&&accounting.meetsMinimum})
    on conflict(tx_hash) do update set block_number=excluded.block_number,block_hash=excluded.block_hash,token_amount=excluded.token_amount,native_amount=excluded.native_amount,gas_wei=excluded.gas_wei,finalized=excluded.finalized,eligible=excluded.eligible,approvals=excluded.approvals,updated_at=now()`;
  if(accounting.finality!=='finalized'||record.status!=='success'||!accounting.meetsMinimum)return {accounting:jsonSafe(accounting),projected:false};
  const [decimals,description,round]=await Promise.all([
    client.readContract({address:FEED,abi:ORACLE,functionName:'decimals',blockNumber:record.block}),
    client.readContract({address:FEED,abi:ORACLE,functionName:'description',blockNumber:record.block}),
    client.readContract({address:FEED,abi:ORACLE,functionName:'latestRoundData',blockNumber:record.block}),
  ]);
  if(decimals!==8||description!=='BNB / USD'||round[1]<=0n||round[3]===0n||round[3]>block.timestamp||block.timestamp-round[3]>3600n||round[4]<round[0])throw fail(503,'usd_unavailable','Fresh historical BNB/USD oracle data is required for PnL. Receipt remains journaled.');
  const usd=formatUnits(accounting.actualNativeAmount*round[1],26);
  const finalized=await client.getBlock({blockTag:'finalized'});
  const held=await client.readContract({address:quote.request.token,abi:erc20Abi,functionName:'balanceOf',args:[quote.request.trader],blockNumber:finalized.number});
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${`bnb:${quote.request.trader}`},0))`;
    const [token]=await tx`select decimals from tokens where address=${quote.request.token}`;
    if(!token||token.decimals!==quote.tokenDecimals)throw fail(503,'metadata_pending','Verified token metadata is required before financial projection.');
    await tx`insert into swaps(tx,log_index,token,pool,block,time,trader,side,token_amount,quote,quote_amount,price_usd,usd)
      values(${hash},0,${quote.request.token},${quote.pool},${record.block.toString()},${new Date(Number(block.timestamp)*1000)},${quote.request.trader},${quote.request.side},${accounting.actualTokenAmount.toString()},${'0x0000000000000000000000000000000000000000'},${accounting.actualNativeAmount.toString()},${usd}::numeric*power(10::numeric,${quote.tokenDecimals})/${accounting.actualTokenAmount.toString()}::numeric,${usd}) on conflict(tx,log_index) do nothing`;
    await tx`insert into trades_ledger(id,chain_id,status,tx_hash,block_number,ts,trader,source_kind,side,token,venue,pool_id,router,fee_amount,fee_bps)
      values(${`bnb:${hash}`},56,'confirmed',${hash},${record.block.toString()},${new Date(Number(block.timestamp)*1000)},${quote.request.trader},'web',${quote.request.side},${quote.request.token},${quote.venue},${quote.pool},${quote.router},0,0) on conflict(tx_hash) do nothing`;
    const rows=await tx`select tx,log_index,side,token_amount,usd,time from swaps where trader=${quote.request.trader} and token=${quote.request.token} and usd is not null order by block,log_index,tx`;
    const position=emptyPosition();let bought=0n,sold=0n,boughtUsd=0,soldUsd=0,buys=0,sells=0;
    for(const row of rows){const amount=BigInt(row.token_amount);const realized=applyTrade(position,row.side,amount,Number(row.usd));
      if(row.side==='buy'){bought+=amount;boughtUsd+=Number(row.usd);buys++;}else{sold+=amount;soldUsd+=Number(row.usd);sells++;}
      await tx`update swaps set realized_usd=${realized} where tx=${row.tx} and log_index=${row.log_index}`;
    }
    await tx`insert into positions(wallet,token,bought_tokens,bought_usd,sold_tokens,sold_usd,buys,sells,held_tokens,cost_basis_usd,realized_usd,unbacked_sold_tokens,first_trade_at,last_trade_at)
      values(${quote.request.trader},${quote.request.token},${bought.toString()},${boughtUsd},${sold.toString()},${soldUsd},${buys},${sells},${position.held.toString()},${position.cost},${position.realized},${position.unbacked.toString()},${rows[0]!.time},${rows.at(-1)!.time})
      on conflict(wallet,token) do update set bought_tokens=excluded.bought_tokens,bought_usd=excluded.bought_usd,sold_tokens=excluded.sold_tokens,sold_usd=excluded.sold_usd,buys=excluded.buys,sells=excluded.sells,held_tokens=excluded.held_tokens,cost_basis_usd=excluded.cost_basis_usd,realized_usd=excluded.realized_usd,unbacked_sold_tokens=excluded.unbacked_sold_tokens,first_trade_at=excluded.first_trade_at,last_trade_at=excluded.last_trade_at`;
    await tx`insert into balances(token,wallet,amount,first_received_at,updated_at) values(${quote.request.token},${quote.request.trader},${held.toString()},${new Date(Number(block.timestamp)*1000)},${new Date(Number(finalized.timestamp)*1000)})
      on conflict(token,wallet) do update set amount=excluded.amount,updated_at=excluded.updated_at where balances.updated_at<=excluded.updated_at`;
    await tx`update tokens set price_usd=${usd}::numeric*power(10::numeric,${quote.tokenDecimals})/${accounting.actualTokenAmount.toString()}::numeric,price_at=${new Date(Number(block.timestamp)*1000)} where address=${quote.request.token} and (price_at is null or price_at<=${new Date(Number(block.timestamp)*1000)})`;
  });
  await refreshWalletPnl(sql);
  return {accounting:jsonSafe(accounting),projected:true};
}
export async function recoverProductTrades(sql:Sql,rpc?:string){
  const rows=await sql`select tx_hash,quote,approvals from verified_bnb_trades where eligible and (not finalized or tx_hash not in(select tx from swaps)) order by updated_at limit 10`;
  let projected=0,pending=0;
  for(const row of rows){try{const result=await journalBscTrade(sql,clientFor(rpc),reviveBscQuote(row.quote),row.tx_hash,reviveBscApprovals(row.approvals));if(result.projected)projected++;else pending++;}catch{pending++;}}
  return {chainId:56,projected,pending};
}
export const productTrade=new Hono<Ctx>();
productTrade.use('*',async(c,next)=>{if(c.env.CHAIN_ID!=='56')return next();await next();});
for(const mode of ['quote','build'] as const)productTrade.post(`/trade/${mode}`,async(c,next)=>{
  if(c.env.CHAIN_ID!=='56')return next();
  const member=requireMember(c,{scope:'trade'});await limit(c,mode);
  if(c.env.AGENT_TRADE_ENABLED!=='1')throw fail(404,'feature_disabled','BNB API trade builds are disabled.');
  const b=c.var.body as Record<string,unknown>;
  if(typeof b.amountIn!=='string'||!/^\d{1,78}$/.test(b.amountIn))throw fail(422,'invalid_amount','Use positive raw input units.');
  if(b.quoteAsset!==undefined&&b.quoteAsset!=='BNB')throw fail(422,'invalid_quote_asset','BNB is the native input/output asset.');
  if(b.from!==undefined&&String(b.from).toLowerCase()!==member.wallet)throw fail(403,'wrong_wallet','Use the registered wallet.');
  const safety=await safetyOf(c.var.sql,String(b.token).toLowerCase());
  if(b.side==='buy'&&safety.blocked)throw fail(403,'blocked_token','This BNB token is blocked.');
  const client=clientFor(c.env.BSC_RPC_URL);
  const [quote]=await quoteBscSpot(client,{chainId:56,side:b.side as 'buy'|'sell',token:b.token as Address,trader:member.wallet as Address,amountIn:BigInt(b.amountIn),slippageBps:Number(b.slippageBps??100)});
  if(mode==='quote')return c.json({chainId:56,quote:jsonSafe(quote),safety,unsigned:true,platformFeeBps:0});
  const simulation=await simulateBscSpot(client,quote!);
  return c.json({chainId:56,quote:jsonSafe(quote),tx:jsonSafe(simulation.build.tx),approvals:jsonSafe(simulation.build.approvals),simulation:jsonSafe(simulation),unsigned:true});
});
productTrade.get('/tokens/:address/safety',async(c,next)=>{
  if(c.env.CHAIN_ID!=='56')return next();await limit(c,'read');
  const address=c.req.param('address').toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(address))throw fail(422,'invalid_token','Invalid BNB token.');
  return c.json({chainId:56,safety:await safetyOf(c.var.sql,address),note:'Unassessed tokens remain unknown. Quote and simulation success is not a sellability or safety guarantee.'});
});
productTrade.post('/trades',async(c,next)=>{
  if(c.env.CHAIN_ID!=='56')return next();
  const member=requireMember(c);await limit(c,'write');const b=c.var.body as Record<string,unknown>;
  const quote=reviveBscQuote(b.quote);
  if(quote.request.trader.toLowerCase()!==member.wallet||typeof b.txHash!=='string'||!/^0x[0-9a-f]{64}$/.test(b.txHash))throw fail(422,'wrong_trader','Receipt must belong to the signed-in wallet.');
  return c.json(await journalBscTrade(c.var.sql,clientFor(c.env.BSC_RPC_URL),quote,b.txHash as Hash,reviveBscApprovals(b.approvals)));
});
