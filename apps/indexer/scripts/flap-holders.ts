/** Batched, resumable holder indexing shared by feed and detail-page tokens. */
import postgres from 'postgres';
import {BscRpc} from '../src/bsc/rpc';
import {advanceFlapHolders,type HolderWatch} from '../src/bsc/flap-holders';
import {snapshotFlapHolders} from '../src/bsc/flap-holder-snapshot';
import {recoverFlapLaunch} from '../src/bsc/flap-launch-history';
import {validateIndexDatabase} from '../../../scripts/backend-env.mjs';
const url=process.env.BSC_INDEX_DATABASE_URL,rpcUrl=process.env.BSC_RPC_URL;
validateIndexDatabase(url, process.env);
if(!url||!rpcUrl)throw new Error('Explicit index database and RPC required');
const sql=postgres(url,{max:1,prepare:false,fetch_types:false});
let span=500n,failures=0;
try{do{
 const rows=await sql<(Omit<HolderWatch,'created_block'>&{created_block:string|null;complete:boolean;checked_at:Date|null})[]>`select w.address,w.block,w.block_hash,w.complete,w.checked_at,coalesce(t.created_block,w.block+1) as created_block from chain_v2.flap_holder_watches w join chain_v2.flap_tokens t using(chain_id,address)
  where w.chain_id=56 and (w.requested_at>now()-interval '2 minutes' or w.detail_requested_at>now()-interval '5 minutes')
  and (w.last_error is null or w.attempted_at<now()-case when w.last_error='history_unavailable' then interval '5 minutes' else interval '15 seconds' end)
  and (w.checked_at is null or w.checked_at<now()-interval '30 seconds' or not w.complete)
  order by (w.detail_requested_at>now()-interval '5 minutes') desc nulls last,w.attempted_at asc nulls first,t.created_block desc limit 48`;
 if(rows.length){
  const first=rows[0]!;
  await sql`update chain_v2.flap_holder_watches set attempted_at=now() where chain_id=56 and address=${first.address}`;
  let seeded=false;
  try{if(await recoverFlapLaunch(sql,new BscRpc(rpcUrl),rpcUrl,first.address)){console.log('Recovered finalized Flap launch',first.address);if(!process.argv.includes('--follow'))break;continue;}}catch{console.error('Launch recovery deferred; no age guessed');}
  if(first.block===null||!first.checked_at||Date.now()-new Date(first.checked_at).getTime()>300000){try{seeded=await snapshotFlapHolders(sql,new BscRpc(rpcUrl),rpcUrl,first.address);if(seeded){failures=0;console.log('Flap holder snapshot verified',first.address);}}
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
