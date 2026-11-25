import postgres from 'postgres';
import {RUSH} from '../src/agents/rush';
if(!process.env.DATABASE_URL)throw new Error('Dedicated BNB DATABASE_URL required');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
try{
  const [identity]=await sql`select chain_id from product_config where singleton=true`;
  if(identity?.chain_id!==56)throw new Error('Refusing a non-BNB product database');
  const config={id:'bnb-rush-1',name:'Clash the Trenches',startsAt:'2026-11-24T18:00:00.000Z',endsAt:'2026-12-01T00:00:00.000Z',prizes:RUSH.prizes,
    rules:{minUsd:RUSH.minUsd,minLiquidityUsd:RUSH.minLiquidityUsd},excludedWallets:[],excludedHandles:[]};
  await sql`insert into product_events(id,config) values('rush',${sql.json(config)}) on conflict(id) do update set config=product_events.config || jsonb_build_object('startsAt',excluded.config->'startsAt','endsAt',excluded.config->'endsAt')`;
  console.log('Configured Clashr event: Nov 24 18:00:00 UTC through Nov 30 23:59:59 UTC. Existing prizes and eligibility retained.');
}finally{await sql.end();}
