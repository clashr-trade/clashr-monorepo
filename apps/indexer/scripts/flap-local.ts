/** Resumable local finalized Flap worker; failed transactions never advance the cursor. */
import postgres from 'postgres';
import {bscConfig} from '../src/bsc/config';
import {BscRpc,BscRpcRequestError} from '../src/bsc/rpc';
import {ingestBscBatch} from '../src/bsc/ingest';
import {validateIndexDatabase} from '../../../scripts/backend-env.mjs';
const env={...process.env,DATABASE_URL:process.env.BSC_INDEX_DATABASE_URL??process.env.DATABASE_URL,BSC_INDEX_ENABLED:'1',BSC_INDEX_SOURCE:'flap'};
validateIndexDatabase(env.DATABASE_URL, process.env);
const live=process.argv.includes('--live');
if(live){if(!process.env.BSC_LIVE_START_BLOCK)throw new Error('Explicit live start block required');env.BSC_START_BLOCK=process.env.BSC_LIVE_START_BLOCK;env.BSC_INDEX_EPOCH=process.env.BSC_LIVE_INDEX_EPOCH??(env.BSC_INDEX_EPOCH??'')+'_live';}
const config={...await bscConfig(env),live},sql=postgres(env.DATABASE_URL,{max:1,prepare:false,fetch_types:false});
const follow=process.argv.includes('--follow');
let blocks=50,failures=0;
// Backfill owns the prefix before live's persisted start, never a second live tail.
const historyEnd=!live&&process.env.BSC_LIVE_START_BLOCK?BigInt(process.env.BSC_LIVE_START_BLOCK)-1n:null;
try{
 indexLoop:do{
  let idle=false,retryDelay=0;
  try{
   const minute=Math.floor(Date.now()/60000);
   for(let step=0;step<20;step++){
    let batchBlocks=blocks;
    if(historyEnd!==null){
     const [saved]=await sql`select block from chain_v2.market_cursors where chain_id=56`;
     const previous=saved?.block==null?config.startBlock-1n:BigInt(saved.block);
     if(previous>=historyEnd){console.log('History prefix complete; live worker owns subsequent blocks.');break indexLoop;}
     batchBlocks=Number(historyEnd-previous<BigInt(blocks)?historyEnd-previous:BigInt(blocks));
    }
    const result=await ingestBscBatch(sql,new BscRpc(env.BSC_RPC_URL!),{...config,batchBlocks},{version:2,chainId:56,kind:'market-index',configHash:config.hash,minute,step,executionId:'local-'+crypto.randomUUID()});
    console.log(JSON.stringify(result));failures=0;
    if(!live)await new Promise(resolve=>setTimeout(resolve,5000));
    if(result.phase==='halted')throw new Error('Index requires operator reconciliation: saved finalized block integrity halt');
    if(result.phase==='stale-job')throw new Error('Index requires operator reconciliation: stale job configuration');
    if(!('continueIndexing' in result)||!result.continueIndexing){idle=true;break;}
   }
  }catch(error){
   const message=error instanceof Error?error.message:'';
   if(/budget exceeded|budget exhausted|batch exceeds/.test(message)&&blocks>1){blocks=Math.max(1,Math.floor(blocks/2));console.log('Reducing Flap batch to',blocks);continue;}
   if(/operator reconciliation|configuration changed|ancestry|Noncontiguous|chain mismatch/.test(message)){
    const reason=/configuration changed/.test(message)?'Configured start block, epoch or decoder differs from the saved cursor':/chain mismatch/.test(message)?'RPC chain is not BNB mainnet':/ancestry|Noncontiguous/.test(message)?'RPC returned inconsistent finalized block history':/stale job/.test(message)?'Stale job configuration':'Saved finalized block integrity halt';
    throw new Error(`Index integrity check failed: ${reason}. Run npm run start:backend -- --check-index. Cursors were preserved.`);
   }
   if(!follow)throw new Error('Flap batch failed; cursor preserved');
   failures++;console.error('Flap batch failed; cursor preserved. Retrying.',failures,/^BSC RPC/.test(message)?message:'database or transport error',typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'');
   if(error instanceof BscRpcRequestError)retryDelay=error.retryAfterMs;
  }
  if(!follow||(!live&&idle))break;
  await new Promise(resolve=>setTimeout(resolve,failures?Math.max(retryDelay,Math.min(30000,1000*2**Math.min(failures,5))):idle?500:250));
 }while(true);
}finally{await sql.end({timeout:2});}
