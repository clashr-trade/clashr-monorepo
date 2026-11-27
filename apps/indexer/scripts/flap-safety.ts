import postgres from 'postgres';
import {refreshFlapSafety} from '../src/bsc/flap-safety';
import {validateIndexDatabase} from '../../../scripts/backend-env.mjs';
const url=process.env.BSC_INDEX_DATABASE_URL,rpc=process.env.BSC_RPC_URL;
validateIndexDatabase(url, process.env);
if(!url||!rpc)throw new Error('Explicit BSC index and RPC required');
const sql=postgres(url,{max:1,prepare:false,fetch_types:false});
try{do{
 const rows=await sql`select w.address from chain_v2.flap_holder_watches w left join chain_v2.flap_safety_snapshots s on s.chain_id=w.chain_id and s.address=w.address where w.chain_id=56 and w.complete and w.checked_at>now()-interval '5 minutes' and w.requested_at>now()-interval '1 hour' and (w.safety_attempted_at is null or w.safety_attempted_at<now()-interval '30 seconds') and (s.computed_at is null or s.computed_at<now()-interval '60 seconds') order by (w.detail_requested_at>now()-interval '5 minutes') desc nulls last,w.safety_attempted_at asc nulls first limit 4`;
 for(const row of rows){await sql`update chain_v2.flap_holder_watches set safety_attempted_at=now() where chain_id=56 and address=${row.address}`;try{console.log('Flap safety refreshed',row.address,await refreshFlapSafety(sql,rpc,row.address));}catch{console.error('Flap safety unavailable; no safe defaults published');}}
 if(!process.argv.includes('--follow'))break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}while(true);}finally{await sql.end({timeout:2});}
