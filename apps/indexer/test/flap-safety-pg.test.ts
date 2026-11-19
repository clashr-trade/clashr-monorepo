import {it,expect,vi,beforeAll,afterAll,describe} from 'vitest';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
const chain=vi.hoisted(()=>({getChainId:vi.fn(async()=>56),getBlock:vi.fn(async()=>({hash:'0x'+'11'.repeat(32),timestamp:BigInt(Math.floor(Date.now()/1000))})),getBytecode:vi.fn(async()=>undefined)}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>chain}));
import {refreshFlapSafety} from '../src/bsc/flap-safety';
import {flapMarket} from '../src/product/flap';
vi.mock('../src/product/flap-pricing',()=>({displayQuotes:async()=>new Map()}));
const available=await pgAvailable(),token='0x'+'aa'.repeat(20),dev='0x'+'bb'.repeat(20),buyer='0x'+'cc'.repeat(20),pool='0x'+'dd'.repeat(20),hash='0x'+'11'.repeat(32);
describe.skipIf(!available)('Flap finalized safety enrichment',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 beforeAll(async()=>{
  db=await freshDb('flap_safety');vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:400})));
  await db.sql`insert into chain_v2.market_cursors(chain_id,config_hash,start_block,block,block_hash,observed_finalized,checked_at) values(56,${'a'.repeat(64)},900,1000,${hash},1000,now())`;
  await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,created_at,creator,name,symbol,decimals,total_supply,state,state_block) values(56,${token},950,now()-interval '10 seconds',${dev},'Safety','SAFE',18,1000,${db.sql.json({status:1,progress:'0',pool,quoteTokenAddress:'0x'+'0'.repeat(40),price:'1',buyTaxRate:'0',sellTaxRate:'0'})},1000)`;
  await db.sql`insert into chain_v2.flap_holder_watches(chain_id,address,block,block_hash,complete,checked_at) values(56,${token},1000,${hash},true,now())`;
  await db.sql`insert into chain_v2.flap_balances(chain_id,token,wallet,amount) values(56,${token},${pool},800),(56,${token},${dev},100),(56,${token},${buyer},100)`;
  await db.sql`insert into chain_v2.flap_events(chain_id,tx,log_index,block,block_hash,time,event,token,payload) values(56,'tx',1,951,${hash},now()-interval '9 seconds','TokenBought',${token},${db.sql.json({buyer,amount:'100'})})`;
 });
 afterAll(async()=>{vi.unstubAllGlobals();await db?.drop();});
 it('excludes the protocol reserve, publishes measured fields and masks unavailable funding',async()=>{
  expect(await refreshFlapSafety(db.sql,'https://rpc.invalid',token)).toBe(true);
  const [s]=await db.sql`select data from chain_v2.flap_safety_snapshots where address=${token}`;
  expect(s!.data).toMatchObject({top10Pct:20,devPct:10,snipersPct:10,sniperCount:1,insidersPct:null,freshWalletsPct:null,bundledPct:null,coverage:{holders:true,launch:true,funding:false}});
  expect(chain.getBytecode).toHaveBeenCalledTimes(2);
  expect((await flapMarket(db.sql,token)).items[0]?.safety).toMatchObject({top10Pct:20,throughBlock:'1000'});
 });
 it('does not reuse launch classifications across an unindexed creation boundary',async()=>{
  await db.sql`update chain_v2.market_cursors set start_block=960`;
  await refreshFlapSafety(db.sql,'https://rpc.invalid',token);
  const [s]=await db.sql`select data from chain_v2.flap_safety_snapshots where address=${token}`;expect(s!.data.sniperCount).toBeNull();expect(s!.data.top10Pct).toBe(20);
 });
 it('rejects mismatching finalized checkpoints',async()=>{
  chain.getBlock.mockResolvedValueOnce({hash:'0x'+'22'.repeat(32),timestamp:1n});
  await expect(refreshFlapSafety(db.sql,'https://rpc.invalid',token)).rejects.toThrow('ancestry');
 });
 it('does not publish expired safety cache entries',async()=>{
  await db.sql`update chain_v2.flap_safety_snapshots set computed_at=now()-interval '6 minutes'`;
  expect((await flapMarket(db.sql,token)).items[0]?.safety).toBeNull();
 });
});
