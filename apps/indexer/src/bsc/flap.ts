import { decodeEventLog, decodeFunctionResult, encodeFunctionData, parseAbi, toEventSelector, type Hex } from 'viem';
import type { TransactionSql } from 'postgres';
export const FLAP_PORTAL='0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0' as const;
export const FLAP_ABI=parseAbi(['function getTokenV8Safe(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId))']);
import type { Header, MarketLog, MarketRpc } from './rpc';
export const FLAP_EVENTS = parseAbi([
 'event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)',
 'event TokenBought(uint256 ts,address token,address buyer,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)',
 'event TokenSold(uint256 ts,address token,address seller,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)',
 'event LaunchedToDEX(address token,address pool,uint256 amount,uint256 eth)',
 'event FlapTokenCLPoolCreated(address token,bytes32 poolId,uint160 sqrtPriceX96)',
]);
export const FLAP_TOPICS = FLAP_EVENTS.map(e => toEventSelector(e));
export function decodeFlap(log: MarketLog) {
 if(log.address.toLowerCase()!==FLAP_PORTAL || log.topics.length!==1) throw new Error('Invalid Flap emitter/event shape');
 const decoded=decodeEventLog({abi:FLAP_EVENTS,data:log.data,topics:log.topics as never,strict:true});
 return {event:decoded.eventName,token:decoded.args.token.toLowerCase(),args:decoded.args};
}
const ERC20=parseAbi(['function decimals() view returns(uint8)','function totalSupply() view returns(uint256)']);
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
/** Runs inside the finalized batch transaction; projection failure cannot advance the cursor. */
export async function projectFlap(tx:TransactionSql,rpc:MarketRpc,logs:MarketLog[],headers:Map<string,Header>,end:bigint){
 const events=logs.map(log=>({log,...decodeFlap(log)})), touched=[...new Set(events.map(e=>e.token))];

 for(const {log,event,token,args} of events){
  const header=headers.get(BigInt(log.blockNumber).toString())!;
  await tx`insert into chain_v2.flap_events(chain_id,tx,log_index,block,block_hash,time,event,token,payload)
   values(56,${log.transactionHash},${Number(BigInt(log.logIndex))},${BigInt(log.blockNumber).toString()},${log.blockHash},${new Date(header.timestamp*1000)},${event},${token},${tx.json(JSON.parse(json(args)))}) on conflict(chain_id,tx,log_index) do nothing`;
  const conflicts=await tx`select 1 from chain_v2.flap_events where chain_id=56 and tx=${log.transactionHash} and log_index=${Number(BigInt(log.logIndex))} and (block_hash<>${log.blockHash} or payload<>${tx.json(JSON.parse(json(args)))})`;
  if(conflicts.length)throw new Error('Conflicting finalized Flap event');
  if(event==='TokenCreated' && 'creator' in args && 'meta' in args)await tx`insert into chain_v2.flap_tokens(chain_id,address,created_block,created_at,creator,metadata_cid,name,symbol)
   values(56,${token},${BigInt(log.blockNumber).toString()},${new Date(header.timestamp*1000)},${args.creator.toLowerCase()},${args.meta},${args.name.slice(0,256)},${args.symbol.slice(0,64)}) on conflict(chain_id,address) do update set created_block=excluded.created_block,created_at=excluded.created_at,creator=excluded.creator,metadata_cid=excluded.metadata_cid,name=excluded.name,symbol=excluded.symbol where flap_tokens.created_block is null`;
 }
 const knownTokens=await tx`select address,decimals from chain_v2.flap_tokens where chain_id=56 and address in ${tx(touched.length?touched:[''])} order by address`;
 if(knownTokens.length>40 || events.filter(e=>e.event==='TokenCreated').length>20)throw new Error('Flap token budget exceeded; reduce block batch');
 for(let offset=0;offset<knownTokens.length;offset+=4){
 const updates=await Promise.all(knownTokens.slice(offset,offset+4).map(async knownRow=>{
 const token=knownRow.address;


  const state=decodeFunctionResult({abi:FLAP_ABI,functionName:'getTokenV8Safe',data:await rpc.call(FLAP_PORTAL,encodeFunctionData({abi:FLAP_ABI,functionName:'getTokenV8Safe',args:[token as Hex]}),end)});
  const decimals=knownRow.decimals??decodeFunctionResult({abi:ERC20,functionName:'decimals',data:await rpc.call(token,encodeFunctionData({abi:ERC20,functionName:'decimals'}),end)});
  const supply=knownRow.decimals!==null?null:decodeFunctionResult({abi:ERC20,functionName:'totalSupply',data:await rpc.call(token,encodeFunctionData({abi:ERC20,functionName:'totalSupply'}),end)});
  if(decimals>36)throw new Error('Unsupported Flap decimals');
  return {token,state,decimals,supply};
 }));
 for(const {token,state,decimals,supply} of updates) await tx`update chain_v2.flap_tokens set state=${tx.json(JSON.parse(json(state)))},state_block=${end.toString()},decimals=${decimals},total_supply=coalesce(${supply?.toString()??null},total_supply) where chain_id=56 and address=${token} and (state_block is null or state_block<=${end.toString()})`;
 }

 return {launches:events.filter(e=>e.event==='TokenCreated').length,trades:events.filter(e=>e.event==='TokenBought'||e.event==='TokenSold').length};
}
