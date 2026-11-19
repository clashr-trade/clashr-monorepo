import postgres from 'postgres';
import {refreshFlapSafety} from '../src/bsc/flap-safety';
const url=process.env.BSC_INDEX_DATABASE_URL,rpc=process.env.BSC_RPC_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!rpc)throw new Error('Explicit local BSC index and RPC required');
const sql=postgres(url,{max:1,prepare:false,fetch_types:false});
try{do{
 const rows=await sql`select w.address from chain_v2.flap_holder_watches w left join chain_v2.flap_safety_snapshots s on s.chain_id=w.chain_id and s.address=w.address where w.chain_id=56 and w.complete and w.requested_at>now()-interval '1 hour' and (s.computed_at is null or s.computed_at<now()-interval '30 seconds') order by (w.detail_requested_at>now()-interval '5 minutes') desc nulls last,s.computed_at asc nulls first limit 8`;
 for(const row of rows){try{console.log('Flap safety refreshed',row.address,await refreshFlapSafety(sql,rpc,row.address));}catch{console.error('Flap safety unavailable; no safe defaults published');}}
 if(!process.argv.includes('--follow'))break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}while(true);}finally{await sql.end({timeout:2});}
