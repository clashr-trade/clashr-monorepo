import postgres from 'postgres';
import {makeDemoAccounts,DEMO_CONFIG_ID} from '../src/product/demo-data';
const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL is required');
const sql=postgres(url,{max:1,prepare:false});
try{
 await sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(56,130021)`;
  const [identity]=await tx`select chain_id from product_config where singleton=true`;
  if(identity?.chain_id!==56)throw new Error('A dedicated BNB product database is required');
  if(process.argv.includes('--remove')){await tx`delete from product_events where id=${DEMO_CONFIG_ID}`;console.log('Removed only the simulated demo profiles.');return;}
  const [existing]=await tx`select config from product_events where id=${DEMO_CONFIG_ID}`;
  const anchor=!process.argv.includes('--refresh')&&existing?.config?.generatedAt?new Date(existing.config.generatedAt):new Date();
  const data=makeDemoAccounts(anchor);
  const collisions=await tx`select handle from members where handle in ${tx(data.accounts.map(a=>a.member.handle))} or wallet in ${tx(data.accounts.map(a=>a.member.wallet))}`;
  if(collisions.length)throw new Error('Demo handles collide with real members; no changes made: '+collisions.map(m=>m.handle).join(', '));
  await tx`insert into product_events(id,config) values(${DEMO_CONFIG_ID},${tx.json(data)}) on conflict(id) do update set config=excluded.config`;
  console.log('Installed 21 read-only demo profiles: 14 humans and 7 agents.');
  console.log('Open /demo to browse. Trades, balances and PnL are simulated; real members and verified ledgers are unchanged.');
  for(const a of data.accounts)console.log(a.member.kind+' @'+a.member.handle+' /u/'+a.member.handle);
 });
}finally{await sql.end();}
