/** Resumable local finalized Flap worker; failed transactions never advance the cursor. */
import postgres from 'postgres';
import {bscConfig} from '../src/bsc/config';
import {BscRpc,BscRpcRequestError} from '../src/bsc/rpc';
import {ingestBscBatch} from '../src/bsc/ingest';
const env={...process.env,DATABASE_URL:process.env.BSC_INDEX_DATABASE_URL??process.env.DATABASE_URL,BSC_INDEX_ENABLED:'1',BSC_INDEX_SOURCE:'flap'};
if(!env.DATABASE_URL||!['127.0.0.1','localhost'].includes(new URL(env.DATABASE_URL).hostname))throw new Error('Explicit local DATABASE_URL required');
const live=process.argv.includes('--live');
if(live){if(!process.env.BSC_LIVE_START_BLOCK)throw new Error('Explicit live start block required');env.BSC_START_BLOCK=process.env.BSC_LIVE_START_BLOCK;env.BSC_INDEX_EPOCH=(env.BSC_INDEX_EPOCH??'')+'_live';}
const config={...await bscConfig(env),live},sql=postgres(env.DATABASE_URL,{max:1,prepare:false,fetch_types:false});
const follow=process.argv.includes('--follow');
let blocks=50,failures=0;
try{
 do{
  let idle=false,retryDelay=0;
  try{
   const minute=Math.floor(Date.now()/60000);
   for(let step=0;step<20;step++){
    const result=await ingestBscBatch(sql,new BscRpc(env.BSC_RPC_URL!),{...config,batchBlocks:blocks},{version:2,chainId:56,kind:'market-index',configHash:config.hash,minute,step,executionId:'local-'+crypto.randomUUID()});
    console.log(JSON.stringify(result));failures=0;
    if(!live)await new Promise(resolve=>setTimeout(resolve,5000));
    if(result.phase==='halted'||result.phase==='stale-job')throw new Error('Index requires operator reconciliation');
    if(!('continueIndexing' in result)||!result.continueIndexing){idle=true;break;}
   }
  }catch(error){
   const message=error instanceof Error?error.message:'';
   if(/budget exceeded|budget exhausted|batch exceeds/.test(message)&&blocks>1){blocks=Math.max(1,Math.floor(blocks/2));console.log('Reducing Flap batch to',blocks);continue;}
   if(/operator reconciliation|configuration changed|ancestry|Noncontiguous|chain mismatch/.test(message))throw new Error('Index integrity check failed; operator reconciliation required');
   if(!follow)throw new Error('Flap batch failed; cursor preserved');
   failures++;console.error('Flap batch failed; cursor preserved. Retrying.',failures,/^BSC RPC/.test(message)?message:'database or transport error',typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'');
   if(error instanceof BscRpcRequestError)retryDelay=error.retryAfterMs;
  }
  if(!follow||(!live&&idle))break;
  await new Promise(resolve=>setTimeout(resolve,failures?Math.max(retryDelay,Math.min(30000,1000*2**Math.min(failures,5))):idle?500:250));
 }while(true);
}finally{await sql.end({timeout:2});}
