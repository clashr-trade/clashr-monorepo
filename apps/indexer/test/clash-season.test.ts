import {it,expect,describe,beforeAll,afterAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {CLASHR_SEASON_ZERO} from '../src/product/season-zero';
import {bnbEventConfig} from '../src/product/events';
it('configures a seven-day BNB Season 0 with the requested UTC start',()=>{
 const c=bnbEventConfig(CLASHR_SEASON_ZERO);
 expect(c.startsAt.toISOString()).toBe('2026-11-27T10:00:00.000Z');
 expect(c.endsAt.toISOString()).toBe('2026-12-04T10:00:00.000Z');
 expect(c.endsAt.getTime()-c.startsAt.getTime()).toBe(7*86400000);
 expect(c.name).toBe('Clash the Trenches');expect(c.excludedHandles).toContain('clashr_demo');
});
const available=await pgAvailable();
describe.skipIf(!available)('Clashr season publication',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 beforeAll(async()=>{db=await freshDb('clash_season');await db.sql.unsafe(readFileSync(new URL('../../../packages/db/product/0001_bnb_product.sql',import.meta.url),'utf8'));});
 afterAll(async()=>await db?.drop());
 const run=()=>{
  const require=createRequire(new URL('../../../packages/trade/package.json',import.meta.url));
  return spawnSync(process.execPath,['--import',pathToFileURL(require.resolve('tsx')).href,fileURLToPath(new URL('../scripts/configure-product-event.ts',import.meta.url))],{encoding:'utf8',env:{...process.env,DATABASE_URL:db.url}});
 };
 it('publishes matching event and season dates without changing configured prizes or exclusions',async()=>{
  await db.sql`insert into product_events(id,config) values('rush',${db.sql.json({...CLASHR_SEASON_ZERO,prizes:{caller:10,gainer:20,trader:30},excludedHandles:['team_account']})})`;
  const first=run();expect(first.status,first.stderr).toBe(0);
  const [event]=await db.sql`select config from product_events where id='rush'`;
  const [season]=await db.sql`select * from seasons where id='s0'`;
  expect(event!.config.prizes).toEqual({caller:10,gainer:20,trader:30});
  expect(event!.config.excludedHandles).toEqual(['clashr_demo','team_account']);
  expect(season!.starts_at.toISOString()).toBe(event!.config.startsAt);expect(season!.ends_at.toISOString()).toBe(event!.config.endsAt);
  expect(run().status).toBe(0);expect(await db.sql`select * from seasons`).toHaveLength(1);
 });
});
