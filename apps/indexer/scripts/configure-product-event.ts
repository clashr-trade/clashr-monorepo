import postgres from 'postgres';
import {CLASHR_SEASON_ZERO} from '../src/product/season-zero';
import {bnbEventConfig} from '../src/product/events';
if(!process.env.DATABASE_URL)throw new Error('Dedicated BNB DATABASE_URL required');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
try{
  const [identity]=await sql`select chain_id from product_config where singleton=true`;
  if(identity?.chain_id!==56)throw new Error('Refusing a non-BNB product database');
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(56,130024)`;
    const [previous]=await tx`select config from product_events where id='rush' for update`;
    const config={...CLASHR_SEASON_ZERO,
      prizes:previous?.config?.prizes??CLASHR_SEASON_ZERO.prizes,
      rules:previous?.config?.rules??CLASHR_SEASON_ZERO.rules,
      excludedWallets:previous?.config?.excludedWallets??[],
      excludedHandles:[...new Set([...CLASHR_SEASON_ZERO.excludedHandles,...(previous?.config?.excludedHandles??[])])],
    };
    bnbEventConfig(config);
    const [frozen]=await tx`select 1 from season_standings where season_id='s0' limit 1`;
    const [season]=await tx`select starts_at,ends_at from seasons where id='s0' for update`;
    if(frozen&&(!season||season.starts_at.toISOString()!==config.startsAt||season.ends_at.toISOString()!==config.endsAt))throw new Error('Season 0 has frozen standings; reconcile them before changing its dates.');
    await tx`insert into product_events(id,config) values('rush',${tx.json(config)}) on conflict(id) do update set config=excluded.config`;
    await tx`insert into seasons(id,name,starts_at,ends_at) values('s0','Season 0',${config.startsAt},${config.endsAt}) on conflict(id) do update set name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at`;
    console.log(`Configured Clashr Season 0: ${config.startsAt} to ${config.endsAt} (7 days). Existing prize rules and exclusions were preserved.`);
  });
}finally{await sql.end();}
