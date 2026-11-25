/** Batched, resumable holder indexing shared by feed and detail-page tokens. */
import postgres from 'postgres';
import {BscRpc} from '../src/bsc/rpc';
import {advanceFlapHolders,pendingFlapHolderWatches,type HolderWatch} from '../src/bsc/flap-holders';
import {snapshotFlapHolders} from '../src/bsc/flap-holder-snapshot';
const url=process.env.BSC_INDEX_DATABASE_URL,rpcUrl=process.env.BSC_RPC_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!rpcUrl)throw new Error('Explicit local index database and RPC required');
const sql=postgres(url,{max:1,prepare:false,fetch_types:false});
let span=500n,failures=0;
try{do{
 const rows=await pendingFlapHolderWatches(sql); if(rows.length){
  const first=rows[0]!;
  await sql`update chain_v2.flap_holder_watches set attempted_at=now() where chain_id=56 and address=${first.address}`;
  let seeded=false;
  {try{seeded=first.block===null?await snapshotFlapHolders(sql,new BscRpc(rpcUrl),rpcUrl,first.address):false;if(seeded){failures=0;console.log('Flap holder snapshot verified',first.address);}}
   catch(e){if(e instanceof Error&&e.message.includes('429')){failures++;await sql`update chain_v2.flap_holder_watches set last_error='rpc_unavailable' where chain_id=56 and address=${first.address}`;if(!process.argv.includes('--follow'))break;await new Promise(resolve=>setTimeout(resolve,15000));continue;}}
  }
  if(seeded){if(!process.argv.includes('--follow'))break;await new Promise(resolve=>setTimeout(resolve,1000));continue;}
  const eligible=rows.filter((w):w is HolderWatch&{complete:boolean}=>w.created_block!==null);
  if(first.created_block===null){await sql`update chain_v2.flap_holder_watches set last_error='history_unavailable' where chain_id=56 and address=${first.address}`;if(!process.argv.includes('--follow'))break;await new Promise(resolve=>setTimeout(resolve,1000));continue;}
  const previous=(w:HolderWatch)=>w.block===null?BigInt(w.created_block)-1n:BigInt(w.block);
  const pivot=first as HolderWatch;
  const group=[pivot,...eligible.filter(w=>w.address!==first.address&&previous(w)>=previous(pivot)&&previous(w)<previous(pivot)+span)].slice(0,12);
  await sql`update chain_v2.flap_holder_watches set attempted_at=now() where chain_id=56 and address in ${sql(group.map(w=>w.address))}`;
  try{const count=await advanceFlapHolders(sql,new BscRpc(rpcUrl),group,span);failures=0;console.log('Flap holder batch',count,'tokens',String(span),'blocks');}
  catch(e){const message=e instanceof Error?e.message:'';if(/budget|exceeds/.test(message)&&span>50n)span/=2n;
   await sql`update chain_v2.flap_holder_watches set last_error=${/ancestry|checkpoint|history|supply/.test(message)?'integrity_check':'rpc_unavailable'} where chain_id=56 and address in ${sql(group.map(w=>w.address))}`;
   failures++;console.error('Holder batch deferred; checkpoints preserved',/budget|HTTP|ancestry|checkpoint|history|supply/.test(message)?message:'transport unavailable');
  }
 }
 if(!process.argv.includes('--follow'))break;await new Promise(resolve=>setTimeout(resolve,failures?Math.min(30000,5000*2**Math.min(failures,3)):rows.length?1000:2000));
}while(true);}finally{await sql.end({timeout:2});}
