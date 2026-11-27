import {toEventSelector} from 'viem';
import type {Sql} from 'postgres';
import {decodeFlap,FLAP_EVENTS,FLAP_PORTAL,FLAP_TOPICS,projectFlap} from './flap';
import type {Header,MarketLog,MarketRpc} from './rpc';

/** Provider transfer history supplies a candidate height, never an age or verdict.
 * Accept a launch only after checking the real Portal event in a finalized block.
 * Recover the first minute separately so older launches do not require a full replay.
 */
export async function recoverFlapLaunch(sql:Sql,rpc:MarketRpc,url:string,token:string,fetcher:typeof fetch=fetch){
 const [saved]=await sql`select t.created_block,exists(select 1 from chain_v2.flap_launch_coverage c where c.chain_id=56 and c.address=t.address) as recovered,
 exists(select 1 from (select * from chain_v2.market_cursors union all select * from chain_v2.flap_live_cursors) c where c.chain_id=56 and c.halt_reason is null and c.start_block<=t.created_block) as indexed
 from chain_v2.flap_tokens t where t.chain_id=56 and t.address=${token}`;
 if(!saved||saved.recovered||saved.created_block!==null&&saved.indexed)return false;
 let height:string|undefined=saved.created_block!==null?'0x'+BigInt(saved.created_block).toString(16):undefined;
 if(!height){
 const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[{fromAddress:'0x0000000000000000000000000000000000000000',fromBlock:'0x0',contractAddresses:[token],category:['erc20'],order:'asc',maxCount:'0x1',excludeZeroValue:true}]})});
 if(!response.ok)return false;
 const body=await response.json() as {id?:number;error?:unknown;result?:{transfers?:{blockNum?:string}[]}};
 height=body.result?.transfers?.[0]?.blockNum;
 if(body.id!==1||body.error||!height||!/^0x[0-9a-f]+$/i.test(height))return false;
 }
 if(await rpc.chainId()!==56)throw new Error('Wrong launch recovery chain');
 const head=await rpc.header('finalized'),block=BigInt(height);if(block>head.number)return false;
 const created=await rpc.header(block);
 const launchLogs=await rpc.logs(block,block,[FLAP_PORTAL],[toEventSelector(FLAP_EVENTS[0]!)]);
 const launches=launchLogs.filter(log=>log.blockHash===created.hash&&decodeFlap(log).token===token);
 if(launches.length!==1)return false;
 // Persist the verified age even if the optional early-history recovery later fails.
 const headers=new Map<string,Header>([[String(block),created]]);
 if((await rpc.header(block)).hash!==created.hash)throw new Error('Launch ancestry changed');
 await sql.begin(tx=>projectFlap(tx,rpc,launches,headers,block));
 let end=block;
 // BNB blocks are sub-second; cap recovery at 400 blocks / 40 log requests.
 // No coverage is published unless the boundary really reaches the first minute.
 for(let n=block+10n;n<=head.number&&n<=block+400n;n+=10n){
  const h=await rpc.header(n);headers.set(String(n),h);end=n;
  if(h.timestamp>=created.timestamp+60)break;
 }
 const boundary=headers.get(String(end));if(!boundary||boundary.timestamp<created.timestamp+60)return true;
 const logs:MarketLog[]=[];
 for(let start=block;start<=end;start+=10n){
  const batch=await rpc.logs(start,start+9n<end?start+9n:end,[FLAP_PORTAL],FLAP_TOPICS);
  logs.push(...batch.filter(log=>decodeFlap(log).token===token));
  if(logs.length>1000)throw new Error('Launch recovery event budget exceeded');
 }
 for(const log of logs){
  const n=BigInt(log.blockNumber),header=headers.get(String(n))??await rpc.header(n);headers.set(String(n),header);
  if(header.hash!==log.blockHash)throw new Error('Launch history ancestry mismatch');
 }
 if((await rpc.header(block)).hash!==created.hash||(await rpc.header(end)).hash!==boundary.hash)throw new Error('Launch history ancestry changed');
 await sql.begin(async tx=>{
  await projectFlap(tx,rpc,logs,headers,end);
  await tx`insert into chain_v2.flap_launch_coverage(chain_id,address,through_block,block_hash) values(56,${token},${String(end)},${boundary.hash}) on conflict(chain_id,address) do update set through_block=excluded.through_block,block_hash=excluded.block_hash`;
 });
 return true;
}
