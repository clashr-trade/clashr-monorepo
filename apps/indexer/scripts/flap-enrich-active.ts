/** Discover older active curves from our own verified events; no launchpad HTTP API. */
import postgres from 'postgres';
import {createPublicClient,http,erc20Abi,type Address} from 'viem';
import {bsc} from 'viem/chains';
import {FLAP_ABI,FLAP_PORTAL} from '../src/bsc/flap';
import {validateIndexDatabase} from '../../../scripts/backend-env.mjs';
const url=process.env.BSC_INDEX_DATABASE_URL;
validateIndexDatabase(url, process.env);
if(!url||!process.env.BSC_RPC_URL)throw new Error('Explicit index database and BSC RPC required');
const sql=postgres(url,{max:1,prepare:false,fetch_types:false});
const client=createPublicClient({chain:bsc,transport:http(process.env.BSC_RPC_URL,{retryCount:0,timeout:10000})});
let scanOffset=0;
async function run(){
 if(await client.getChainId()!==56)throw new Error('Wrong chain');
 const head=await client.getBlock({blockTag:'finalized'});
 const rows=await sql`select e.token,max(e.block) as last_block from chain_v2.flap_events e
  where not exists(select 1 from chain_v2.flap_tokens t where t.chain_id=56 and t.address=e.token)
  and e.chain_id=56 group by e.token order by last_block desc,e.token limit 80 offset ${scanOffset}`;
 scanOffset=rows.length<80?0:scanOffset+rows.length;
 if(!rows.length)return;
 const states=await client.multicall({contracts:rows.map(r=>({address:FLAP_PORTAL,abi:FLAP_ABI,functionName:'getTokenV8Safe' as const,args:[r.token as Address]})),blockNumber:head.number,allowFailure:true});
 let discovered=0;
 const candidates=states.flatMap((r,i)=>r.status==='success'&&(r.result.status===4||(r.result.status===1&&r.result.progress>=500000000000000000n))?[{token:rows[i]!.token as Address,state:r.result}]:[]).sort((a,b)=>a.token.localeCompare(b.token));
 for(const candidate of candidates){
  const values=await client.multicall({contracts:[
   {address:candidate.token,abi:erc20Abi,functionName:'name'}, {address:candidate.token,abi:erc20Abi,functionName:'symbol'},
   {address:candidate.token,abi:erc20Abi,functionName:'decimals'}, {address:candidate.token,abi:erc20Abi,functionName:'totalSupply'},
  ],blockNumber:head.number,allowFailure:false});
  if(values[2]>36)continue;
  if((await client.getBlock({blockNumber:head.number})).hash!==head.hash)throw new Error('Finalized ancestry changed');
  const state=JSON.parse(JSON.stringify(candidate.state,(_,v)=>typeof v==='bigint'?v.toString():v));
  await sql`insert into chain_v2.flap_tokens(chain_id,address,name,symbol,decimals,total_supply,state,state_block)
   values(56,${candidate.token},${values[0].slice(0,256)},${values[1].slice(0,64)},${values[2]},${values[3].toString()},${sql.json(state)},${head.number.toString()})
   on conflict(chain_id,address) do nothing`;
  discovered++;
 }
 console.log(JSON.stringify({activeChecked:rows.length,qualifyingDiscovered:discovered,finalizedBlock:head.number.toString()}));
}
try{
 do{try{await run();}catch{console.error('Active discovery failed; indexed feed remains available');if(!process.argv.includes('--follow'))process.exitCode=1;}
 if(!process.argv.includes('--follow'))break;
 await new Promise(resolve=>setTimeout(resolve,60000));
 }while(true);
}finally{await sql.end({timeout:2});}
