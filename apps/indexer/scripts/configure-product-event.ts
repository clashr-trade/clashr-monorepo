import postgres from 'postgres';
import {RUSH} from '../src/agents/rush';
if(!process.env.DATABASE_URL)throw new Error('Dedicated BNB DATABASE_URL required');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
try{
  const [identity]=await sql`select chain_id from product_config where singleton=true`;
  if(identity?.chain_id!==56)throw new Error('Refusing a non-BNB product database');
  const config={id:'bnb-rush-1',name:'Rush the Trenches',startsAt:RUSH.startsAt.toISOString(),endsAt:RUSH.endsAt.toISOString(),prizes:RUSH.prizes,
    rules:{minUsd:RUSH.minUsd,minLiquidityUsd:RUSH.minLiquidityUsd},excludedWallets:[],excludedHandles:[]};
  await sql`insert into product_events(id,config) values('rush',${sql.json(config)}) on conflict(id) do update set config=excluded.config`;
  console.log('Configured BNB Rush using the user-requested Robinhood schedule/prize template; BNB standings remain independent.');
}finally{await sql.end();}
