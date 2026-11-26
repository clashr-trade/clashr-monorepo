import postgres from 'postgres';
import {readFlapMetadata} from '../src/bsc/flap-metadata';
import {validateIndexDatabase} from '../../../scripts/backend-env.mjs';
const url=process.env.BSC_INDEX_DATABASE_URL;
validateIndexDatabase(url, process.env);
if(!url)throw new Error('Explicit index database required');
const sql=postgres(url,{max:1,prepare:false,fetch_types:false});
const address=process.argv.find(arg=>arg.startsWith('--address='))?.slice(10).toLowerCase();
if(address&&!/^0x[0-9a-f]{40}$/.test(address))throw new Error('Invalid token address');
try{do{
 const rows=address
  ?await sql`select address,metadata_cid from chain_v2.flap_tokens where chain_id=56 and address=${address} and metadata_cid is not null and metadata_json is null`
  :await sql`select address,metadata_cid from chain_v2.flap_tokens where metadata_cid is not null and metadata_json is null and (metadata_checked_at is null or metadata_checked_at<now()-interval '1 hour') order by created_block desc limit 5`;
 for(const row of rows){
  let metadata=null;try{metadata=await readFlapMetadata(row.metadata_cid);}catch{/* Retry after cooldown, never block live ingestion. */}
  await sql`update chain_v2.flap_tokens set metadata_json=${metadata?sql.json(metadata):null},metadata_checked_at=now() where chain_id=56 and address=${row.address}`;
 }
 console.log('Flap metadata processed',rows.length);
 if(!process.argv.includes('--follow'))break;
 await new Promise(resolve=>setTimeout(resolve,rows.length?1000:15000));
}while(true);}finally{await sql.end({timeout:2});}
