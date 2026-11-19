import {decodeFunctionResult,encodeFunctionData,erc20Abi,type Hex} from 'viem';
import type {Sql} from 'postgres';
import type {MarketRpc} from './rpc';
const ZERO='0x0000000000000000000000000000000000000000';
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v);
/** Provider history discovers addresses only. Every published amount is read from the finalized chain. */
export async function snapshotFlapHolders(sql:Sql,rpc:MarketRpc,url:string,token:string,fetcher:typeof fetch=fetch){
 if(await rpc.chainId()!==56)throw new Error('Wrong holder RPC chain');const head=await rpc.header('finalized');
 const [watch]=await sql`select block,block_hash from chain_v2.flap_holder_watches where chain_id=56 and address=${token}`;
 if(!watch)return false;
 if(watch.block_hash&&watch.block!==null&&(await rpc.header(BigInt(watch.block))).hash!==watch.block_hash)throw new Error('Holder checkpoint changed');
 const candidates=new Set<string>();let pageKey:string|undefined;
 for(let page=0;page<2;page++){
  const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[{fromBlock:'0x0',toBlock:`0x${head.number.toString(16)}`,contractAddresses:[token],category:['erc20'],order:'asc',maxCount:'0x3e8',excludeZeroValue:true,...(pageKey?{pageKey}:{})}]})});
  if(response.status===429)throw new Error('BSC RPC HTTP 429');
  if(!response.ok)return false;
  const body=await response.json() as {id?:number;error?:unknown;result?:{transfers?:{from?:string;to?:string;category?:string;blockNum?:string;rawContract?:{address?:string}}[];pageKey?:string}};
  if(body.id!==1||body.error||!Array.isArray(body.result?.transfers))return false;
  for(const row of body.result.transfers){
   const from=row.from?.toLowerCase(),to=row.to?.toLowerCase();
   if(row.category!=='erc20'||row.rawContract?.address?.toLowerCase()!==token||!address(from)||!address(to)||!/^0x[0-9a-f]+$/i.test(row.blockNum??'')||BigInt(row.blockNum!)>head.number)return false;
   if(from!==ZERO)candidates.add(from);if(to!==ZERO)candidates.add(to);
   if(candidates.size>100)return false;
  }
  pageKey=body.result.pageKey;if(!pageKey)break;
 }
 if(!candidates.size)return false;
 const balances=new Map<string,bigint>(),wallets=[...candidates].sort();
 const supply=decodeFunctionResult({abi:erc20Abi,functionName:'totalSupply',data:await rpc.call(token,encodeFunctionData({abi:erc20Abi,functionName:'totalSupply'}),head.number)});
 if(supply<=0n)return false;
 for(let i=0;i<wallets.length;i+=2){await Promise.all(wallets.slice(i,i+2).map(async wallet=>{
  const amount=decodeFunctionResult({abi:erc20Abi,functionName:'balanceOf',data:await rpc.call(token,encodeFunctionData({abi:erc20Abi,functionName:'balanceOf',args:[wallet as Hex]}),head.number)});balances.set(wallet,amount);
 }));}
 // Even a partial provider history is sufficient only if these actual balances account for the entire supply.
 // Missing a positive holder makes this fail: no inferred zeroes, estimated amounts or incomplete snapshots.
 if([...balances.values()].reduce((a,b)=>a+b,0n)!==supply)return false;
 if((await rpc.header(head.number)).hash!==head.hash)throw new Error('Holder ancestry changed');
 let applied=false;
 await sql.begin(async tx=>{
  const [current]=await tx`select block,block_hash from chain_v2.flap_holder_watches where chain_id=56 and address=${token} for update`;
  if(!current||String(current.block)!==String(watch.block)||current.block_hash!==watch.block_hash)return;
  if(current.block!==null&&BigInt(current.block)>head.number)return;
  await tx`delete from chain_v2.flap_balances where chain_id=56 and token=${token}`;
  for(const [wallet,amount] of balances)if(amount>0n)await tx`insert into chain_v2.flap_balances(chain_id,token,wallet,amount) values(56,${token},${wallet},${amount.toString()})`;
  await tx`update chain_v2.flap_tokens set total_supply=${supply.toString()} where chain_id=56 and address=${token} and state_block<=${head.number.toString()}`;
  await tx`update chain_v2.flap_holder_watches set block=${head.number.toString()},block_hash=${head.hash},complete=true,checked_at=now(),last_error=null where chain_id=56 and address=${token}`;
  applied=true;
 });
 return applied;
}
