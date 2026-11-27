import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {flapMarket,flapHolders,flapTrades} from '../src/product/flap';
const conversions=vi.hoisted(()=>new Map<string,{usd:number;decimals:number;symbol:string;at:string}>());
const migrated=vi.hoisted(()=>new Map());
vi.mock('../src/product/flap-pricing',()=>({displayQuotes:async()=>conversions}));
vi.mock('../src/product/flap-dex-pricing',()=>({migratedDisplayQuotes:async()=>migrated}));
const available=await pgAvailable();
describe.skipIf(!available)('Flap market column selection',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 beforeAll(async()=>{
  db=await freshDb('flap_columns');
  await db.sql`insert into chain_v2.market_cursors(chain_id,config_hash,start_block,block,block_hash,observed_finalized,checked_at)
   values(56,${'a'.repeat(64)},1,1000,${'0x'+'11'.repeat(32)},1000,now())`;
  await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,created_at,creator,metadata_cid,name,symbol,decimals,state,state_block)
   select 56,'0x'||lpad(to_hex(n),40,'0'),n,now(),'creator','cid','new '||n,'NEW',18,
    jsonb_build_object('status',1,'progress','0','quoteTokenAddress','0x0000000000000000000000000000000000000000','price','1','buyTaxRate','0','sellTaxRate','0'),1000
   from generate_series(1,160) n`;
  await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,created_at,name,symbol,decimals,state,state_block)
   select 56,'0x'||lpad(to_hex(n),40,'0'),case when n=163 then null else 1 end,case when n=163 then null else now() end,
    'old '||n,'OLD',18,jsonb_build_object('status',case when n=162 then 4 else 1 end,'progress','800000000000000000','quoteTokenAddress','0x0000000000000000000000000000000000000000','price','1','buyTaxRate','0','sellTaxRate','0'),1000
   from generate_series(161,163) n`;
 });
 afterAll(async()=>{await db?.drop();});
 it('reserves slots for older almost and migrated tokens despite more than 150 newer launches',async()=>{
  const result=await flapMarket(db.sql);
  expect(result.items.filter(r=>r.listed)).toHaveLength(1);
  expect(result.items.filter(r=>!r.listed&&r.progress>=50)).toHaveLength(2);
  expect(result.items.filter(r=>!r.listed&&r.progress<50)).toHaveLength(50);
 });
 it('automatically queues feed tokens without overriding detail-page priority',async()=>{
  const feed=await flapMarket(db.sql);
  const [count]=await db.sql`select count(*)::int as n from chain_v2.flap_holder_watches`;
  expect(count!.n).toBeGreaterThanOrEqual(feed.items.length);
  const token=feed.items[0]!.coin.address;await flapMarket(db.sql,token);await flapMarket(db.sql);
  const [watch]=await db.sql`select detail_requested_at from chain_v2.flap_holder_watches where address=${token}`;expect(watch!.detail_requested_at).not.toBeNull();
 });
 it('preserves unknown launch dates for on-chain active discovery',async()=>{
  const result=await flapMarket(db.sql);
  expect(result.items.find(r=>r.coin.name==='old 163')?.createdAt).toBeNull();
 });
 it('prices migrated tokens from their DEX instead of the zeroed curve price',async()=>{
  const address='0x'+(162).toString(16).padStart(40,'0');
  migrated.set(address,{priceUsd:.25,liquidityUsd:12000,volume24hUsd:3000,pool:'0x'+'ab'.repeat(20),at:new Date().toISOString(),source:'dexscreener-indicative'});
  const item=(await flapMarket(db.sql,address)).items[0];
  expect(item).toMatchObject({listed:true,priceUsd:.25,liquidityUsd:12000,volume24hUsd:3000,priceSource:'dexscreener-indicative'});
 });
 it('never reports incomplete holder history as a known count',async()=>{
  const address='0x'+'1'.padStart(40,'0');
  await db.sql`update chain_v2.flap_tokens set total_supply=1000 where address=${address}`;
  await db.sql`insert into chain_v2.flap_holder_watches(chain_id,address,complete) values(56,${address},false) on conflict(chain_id,address) do update set complete=false`;
  await db.sql`insert into chain_v2.flap_balances(chain_id,token,wallet,amount) values(56,${address},'wallet-a',500),(56,${address},'wallet-b',500)`;
  expect(await flapHolders(db.sql,address)).toMatchObject({available:false,holders:null});
  await db.sql`update chain_v2.flap_holder_watches set complete=true,block=1000 where address=${address}`;
  const complete=await flapHolders(db.sql,address);expect(complete.available).toBe(true);expect(complete.count).toBe(2);expect(complete.holders?.[0]?.pct).toBe(50);
 });
 it('values ERC20-quoted trades in actual quote units and preserves canonical candle ordering fields',async()=>{
  const address='0x'+'ab'.repeat(20),quote='0x'+'cd'.repeat(20);
  conversions.set(quote,{usd:2,decimals:6,symbol:'SIX',at:new Date().toISOString()});
  await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,created_at,name,symbol,decimals,total_supply,state,state_block)
   values(56,${address},1,now(),'quoted','Q',18,1000000000000000000000,${db.sql.json({status:1,progress:'0',quoteTokenAddress:quote,price:'10000000000000000',buyTaxRate:'0',sellTaxRate:'0'})},1000)`;
  await db.sql`insert into chain_v2.flap_events(chain_id,tx,log_index,block,block_hash,time,event,token,payload)
   values(56,'tx',7,1000,'hash',now(),'TokenBought',${address},${db.sql.json({buyer:address,amount:'100000000000000000000',eth:'1000000',postPrice:'10000000000000000'})})`;
  expect((await flapTrades(db.sql,address))[0]).toMatchObject({tokens:100,usd:2,priceUsd:0.02,block:'1000',logIndex:7});
  expect((await flapMarket(db.sql,address)).items[0]).toMatchObject({priceUsd:0.02,priceNative:null,quoteSymbol:'SIX'});
 });
});
