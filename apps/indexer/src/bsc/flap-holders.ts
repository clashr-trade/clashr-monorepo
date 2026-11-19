import {decodeEventLog,decodeFunctionResult,encodeFunctionData,erc20Abi,parseAbi,toEventSelector,type Hex} from 'viem';
import type {Sql} from 'postgres';
import type {MarketRpc} from './rpc';
const ABI=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const ZERO='0x0000000000000000000000000000000000000000';
export interface HolderWatch {address:string;created_block:string;block:string|null;block_hash:string|null}
export const holderPrevious=(w:HolderWatch)=>w.block===null?BigInt(w.created_block)-1n:BigInt(w.block);
/** Share bounded log queries across tokens with overlapping contiguous ranges. No gaps or guessed balances. */
export async function advanceFlapHolders(sql:Sql,rpc:MarketRpc,watches:HolderWatch[],span=500n,requestDelayMs=200){
 if(!watches.length)return 0;
 if(await rpc.chainId()!==56)throw new Error('Wrong holder RPC chain');const head=await rpc.header('finalized'),start=holderPrevious(watches[0]!)+1n;
 const end=start+span-1n<head.number?start+span-1n:head.number;
 if(end<start)return 0;
 const group=watches.filter(w=>holderPrevious(w)>=start-1n&&holderPrevious(w)<end).slice(0,12).sort((a,b)=>a.address.localeCompare(b.address));
 const addresses=group.map(w=>w.address),byAddress=new Map(group.map(w=>[w.address,w]));
 const anchors=new Map<string,Awaited<ReturnType<MarketRpc['header']>>>();
 for(const w of group){const previous=holderPrevious(w);const h=anchors.get(String(previous))??await rpc.header(previous);anchors.set(String(previous),h);if(w.block_hash&&h.hash!==w.block_hash)throw new Error('Holder checkpoint changed');}
 const ranges:bigint[]=[];for(let b=start;b<=end;b+=10n)ranges.push(b);
 const logs:Awaited<ReturnType<MarketRpc['logs']>>=[];
 // getLogs is expensive on free plans. Share its address filter rather than bursting parallel requests.
 for(const b of ranges){logs.push(...await rpc.logs(b,b+9n<end?b+9n:end,addresses,[toEventSelector(ABI[0])]));if(requestDelayMs)await new Promise(resolve=>setTimeout(resolve,requestDelayMs));}
 const heights=[...new Set(logs.map(l=>BigInt(l.blockNumber).toString()))],hashes=new Map<string,Hex>();
 for(let i=0;i<heights.length;i+=4){const hs=await Promise.all(heights.slice(i,i+4).map(n=>rpc.header(BigInt(n))));for(const h of hs)hashes.set(String(h.number),h.hash);}
 const boundary=await rpc.header(end),deltas=new Map(group.map(w=>[w.address,new Map<string,bigint>()])),seen=new Set<string>();
 for(const log of logs){
  const w=byAddress.get(log.address);if(!w||log.removed||hashes.get(String(BigInt(log.blockNumber)))!==log.blockHash)throw new Error('Holder log ancestry mismatch');
  const id=log.transactionHash+':'+log.logIndex;if(seen.has(id))throw new Error('Duplicate holder log');seen.add(id);
  // A newer watch may share this batch, but must never replay its already-applied prefix.
  if(BigInt(log.blockNumber)<=holderPrevious(w))continue;
  const {args}=decodeEventLog({abi:ABI,eventName:'Transfer',data:log.data,topics:log.topics as [Hex,Hex,Hex]});
  const delta=deltas.get(w.address)!,from=args.from.toLowerCase(),to=args.to.toLowerCase();
  if(from!==ZERO)delta.set(from,(delta.get(from)??0n)-args.value);
  if(to!==ZERO)delta.set(to,(delta.get(to)??0n)+args.value);
 }
 const supplies=new Map<string,bigint>();
 if(end===head.number)for(let i=0;i<group.length;i+=4)await Promise.all(group.slice(i,i+4).map(async w=>supplies.set(w.address,decodeFunctionResult({abi:erc20Abi,functionName:'totalSupply',data:await rpc.call(w.address,encodeFunctionData({abi:erc20Abi,functionName:'totalSupply'}),end)}))));
 if((await rpc.header(end)).hash!==boundary.hash)throw new Error('Holder ancestry changed');
 for(const [height,h] of anchors)if((await rpc.header(BigInt(height))).hash!==h.hash)throw new Error('Holder ancestry changed');
 let updated=0;
 await sql.begin(async tx=>{
  for(const w of group){
   const [current]=await tx`select block,block_hash from chain_v2.flap_holder_watches where chain_id=56 and address=${w.address} for update`;
   if(!current||String(current.block)!==String(w.block)||current.block_hash!==w.block_hash)continue;
   for(const [wallet,amount] of [...deltas.get(w.address)!].sort(([a],[b])=>a.localeCompare(b)))await tx`insert into chain_v2.flap_balances(chain_id,token,wallet,amount) values(56,${w.address},${wallet},${amount.toString()}) on conflict(chain_id,token,wallet) do update set amount=flap_balances.amount+excluded.amount`;
   const [negative]=await tx`select 1 from chain_v2.flap_balances where chain_id=56 and token=${w.address} and amount<0 limit 1`;if(negative)throw new Error('Incomplete holder history');
   const supply=supplies.get(w.address);if(supply!==undefined){
    const [sum]=await tx`select coalesce(sum(amount),0)::text as supply from chain_v2.flap_balances where chain_id=56 and token=${w.address}`;
    if(BigInt(sum!.supply)!==supply)throw new Error('Holder supply mismatch');
    await tx`update chain_v2.flap_tokens set total_supply=${supply.toString()} where chain_id=56 and address=${w.address} and state_block<=${end.toString()}`;
   }
   await tx`update chain_v2.flap_holder_watches set block=${end.toString()},block_hash=${boundary.hash},complete=${end===head.number},checked_at=now(),last_error=null where chain_id=56 and address=${w.address}`;updated++;
  }
 });
 return updated;
}
