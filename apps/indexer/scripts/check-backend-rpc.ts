import {BscRpc} from '../src/bsc/rpc';
import {FLAP_PORTAL,FLAP_TOPICS} from '../src/bsc/flap';

const url=process.env.BSC_RPC_URL;
if(!url)throw new Error('Configure BSC_RPC_URL first.');
let failed=false;
async function probe(name:string,run:()=>Promise<unknown>){
  try{await run();console.log(`[PASS] ${name}`);}
  catch(error){
    failed=true;
    // BscRpc deliberately redacts provider messages and credentials.
    console.error(`[FAIL] ${name}: ${error instanceof Error&&error.message.startsWith('BSC RPC')?error.message:'RPC transport or response unavailable'}`);
  }
}
await probe('BNB chain 56',()=>new BscRpc(url).chainId());
await probe('finalized block headers',()=>new BscRpc(url).header('finalized'));
const start=process.env.BSC_START_BLOCK;
if(!/^[1-9][0-9]{0,17}$/.test(start??''))throw new Error('Configure BSC_START_BLOCK before probing historical indexing.');
const block=BigInt(start!);
await probe('configured historical start block',()=>new BscRpc(url).header(block));
await probe('one-block Flap eth_getLogs',()=>new BscRpc(url).logs(block,block,[FLAP_PORTAL],FLAP_TOPICS));
if(failed){
  console.error('Fix BSC_RPC_URL provider quota, method permissions, historical coverage or VPS IP allowlists. No keys were printed and no index cursor was modified.');
  process.exitCode=1;
}else console.log('Required header/log probes passed. This does not guarantee all historical contract calls or throughput capacity.');
