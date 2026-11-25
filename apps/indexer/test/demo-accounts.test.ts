import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {makeDemoAccounts,demoPerformance,demoPnlHistory,DEMO_CONFIG_ID} from '../src/product/demo-data';
import {productApp} from '../src/product/app';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import type {AgentsEnv} from '../src/agents/env';
const anchor=new Date('2026-11-25T12:00:00Z');
describe('simulated portfolios',()=>{
 it('has 14 fictional humans and 7 agents with deterministic unique identities',()=>{
  const data=makeDemoAccounts(anchor);expect(data.accounts.filter(a=>a.summary.realized_usd<0)).toHaveLength(16);expect(data.accounts.filter(a=>a.summary.realized_usd>0)).toHaveLength(5);expect(data.accounts).toHaveLength(21);expect(data.accounts.filter(a=>a.member.kind==='human')).toHaveLength(14);expect(data.accounts.filter(a=>a.member.kind==='agent')).toHaveLength(7);
  expect(new Set(data.accounts.map(a=>a.positions.map(p=>p.symbol).sort().join('/'))).size).toBe(21);
  expect(new Set(data.accounts.flatMap(a=>a.positions.map(p=>p.token))).size).toBe(9);
  expect(new Set(data.accounts.map(a=>a.positions.find(p=>BigInt(p.held_tokens)>0n)!.token)).size).toBe(9);
  for(const account of data.accounts)expect(new Set(account.trades.map(t=>t.token))).toEqual(new Set(account.positions.map(p=>p.token)));
  expect(makeDemoAccounts(anchor)).toEqual(data);expect(new Set(data.accounts.map(a=>a.member.wallet)).size).toBe(21);
  for(const a of data.accounts){expect(a.member.handle).not.toMatch(/demo|test/);expect(a.member.demo).toBe(true);expect(a.trades.length).toBeGreaterThanOrEqual(6);expect(a.trades.length).toBeLessThanOrEqual(10);expect(Math.abs(a.summary.realized_usd)).toBeLessThan(20);expect(a.positions.some(p=>BigInt(p.held_tokens)>0n)).toBe(true);expect(a.positions.some(p=>p.held_tokens==='0')).toBe(true);}
 });
 it('derives period metrics from sale cost basis and per-token realized outcomes',()=>{
  const a=makeDemoAccounts(anchor).accounts[0]!,metrics=demoPerformance(a,anchor.getTime());
  expect(metrics['24h'].trades).toBe(2);expect(metrics['24h'].winRate).toBe(0);expect(metrics['24h'].roi).toBeCloseTo(-.03,2);
  expect(metrics['30d'].trades).toBe(a.trades.length);expect(metrics['30d'].winRate).toBe(.5);
  expect(demoPerformance(a,anchor.getTime()+31*86400000)['30d']).toEqual({roi:null,winRate:null,trades:0,tokens:0,volumeUsd:0});
 });
 it('reconciles every trade, realized chart, cash balance and marked portfolio',()=>{
  for(const [i,a]of makeDemoAccounts(anchor).accounts.entries()){
   const sells=a.trades.filter(t=>t.side==='sell'),realized=sells.reduce((sum,t)=>sum+Math.round((t.realizedUsd??0)*100),0)/100;
   expect(a.summary.realized_usd).toBeCloseTo(realized,8);
   expect(demoPnlHistory(a,'all',anchor.getTime()).realizedUsd).toBeCloseTo(realized,8);
   expect(a.summary.portfolio_value_usd-(2000+i*275)).toBeCloseTo(a.summary.realized_usd+a.summary.unrealized_usd,6);
   for(const p of a.positions){const trades=a.trades.filter(t=>t.token===p.token);expect(trades.filter(t=>t.side==='buy').reduce((s,t)=>s+t.usd,0)).toBeCloseTo(p.bought_usd,6);expect(trades.filter(t=>t.side==='sell').reduce((s,t)=>s+t.usd,0)).toBeCloseTo(p.sold_usd,6);}
   const week=demoPnlHistory(a,'7d',anchor.getTime());expect(week.points.at(-1)?.pnl).toBe(week.realizedUsd);expect(a.trades.every(t=>t.time<=anchor.getTime()/1000&&!/^0x/.test(t.tx))).toBe(true);
  }
 });
});
const available=await pgAvailable();
describe.skipIf(!available)('VPS-compatible demo installation and API isolation',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>,env:AgentsEnv;
 const require=createRequire(new URL('../../../packages/trade/package.json',import.meta.url)),loader=pathToFileURL(require.resolve('tsx')).href;
 const seed=(...args:string[])=>{const r=spawnSync(process.execPath,['--import',loader,fileURLToPath(new URL('../scripts/seed-demo-accounts.ts',import.meta.url)),...args],{encoding:'utf8',env:{...process.env,DATABASE_URL:db.url}});expect(r.status,r.stderr).toBe(0);};
 const call=async(path:string)=>{const r=await productApp.fetch(new Request('http://127.0.0.1:8790'+path),env);return {status:r.status,body:await r.json() as any};};
 beforeAll(async()=>{db=await freshDb('demo_accounts');await db.sql.unsafe(readFileSync(new URL('../../../packages/db/product/0001_bnb_product.sql',import.meta.url),'utf8'));await db.sql.unsafe(readFileSync(new URL('../../../packages/db/product/0002_receipt_recovery.sql',import.meta.url),'utf8'));env={DATABASE_URL:db.url,CHAIN_ID:'56',PRODUCT_ORIGIN:'http://localhost:3000',AGENTS_ENABLED:'1',IP_SALT:'demo-fixture'} as AgentsEnv;seed();});
 afterAll(async()=>{await db?.drop();});
 it('can run twice without duplicating profiles or changing history',async()=>{
  const before=(await db.sql`select config from product_events where id=${DEMO_CONFIG_ID}`)[0]?.config;seed();expect((await db.sql`select config from product_events where id=${DEMO_CONFIG_ID}`)[0]?.config).toEqual(before);
  const list=await call('/v1/demo/accounts');expect(list.status).toBe(200);expect(list.body.items).toHaveLength(21);expect((await call('/v1/demo/accounts?kind=agent')).body.items).toHaveLength(7);
 });
 it('serves profile, trades and PnL with explicit simulated provenance',async()=>{
  const profile=await call('/v1/members/maya_chen');expect(profile.body.member).toMatchObject({displayName:'Maya Chen',demo:true});const wallet=profile.body.member.wallet;
  const pnl=await call('/wallets/'+wallet+'/pnl');expect(pnl.body).toMatchObject({demo:true,provenance:'simulated'});expect(pnl.body.positions).toHaveLength(2);
  const trades=await call('/wallets/'+wallet+'/trades?limit=5');expect(trades.body.trades).toHaveLength(5);
  expect((await call('/wallets/'+wallet+'/pnl/history?range=7d')).body.points.length).toBeGreaterThan(1);
  expect((await call('/v1/auth/wallet/nonce?address='+wallet)).status).toBe(403);
 });
 it('never inserts fabricated users or transactions into verified tables',async()=>{
  for(const table of ['members','swaps','trades_ledger']){const [row]=await db.sql.unsafe('select count(*)::int as n from '+table);expect(row?.n).toBe(0);}
  expect((await call('/v1/members/discover')).body.items).toEqual([]);
 });
 it('gives real registered members priority and removes fixtures without deleting real data',async()=>{
  await db.sql`insert into members(id,kind,origin,handle,wallet,display_name) values('real-maya','human',null,'maya_chen',${'0x'+'ab'.repeat(20)},'Actual member')`;
  expect((await call('/v1/members/maya_chen')).body.member.displayName).toBe('Actual member');
  expect((await call('/v1/demo/accounts')).body.items).toHaveLength(20);
  seed('--remove');expect((await call('/v1/demo/accounts')).body.items).toHaveLength(0);
  expect((await db.sql`select count(*)::int as n from members`)[0]?.n).toBe(1);
 });
});
