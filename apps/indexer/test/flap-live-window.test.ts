import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {resumeFlapLiveWindow} from '../src/bsc/flap-live-window';
import {pendingFlapHolderWatches} from '../src/bsc/flap-holders';
import type {MarketRpc} from '../src/bsc/rpc';
const available=await pgAvailable(),hash='a'.repeat(64),historyHash='b'.repeat(64);
const blockHash=(n:bigint)=>('0x'+n.toString(16).padStart(64,'0')) as `0x${string}`;
const rpc={chainId:async()=>56,header:async(tag:bigint|'finalized')=>{const number=tag==='finalized'?10000n:tag;return {number,hash:blockHash(number),parentHash:blockHash(number-1n),timestamp:Math.floor(Date.now()/1000)};}} as MarketRpc;
const config={source:'flap' as const,live:true,startBlock:100n,batchBlocks:50,hash};
describe.skipIf(!available)('Live recovery and active holder queue',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 beforeAll(async()=>{db=await freshDb('flap_live_resume');});
 afterAll(async()=>{await db?.drop();});
 it('requires the matching continuous history backfill before moving a live cursor',async()=>{
  expect(await resumeFlapLiveWindow(db.sql,rpc,config,historyHash)).toBeNull();
  await db.sql`insert into chain_v2.market_cursors(chain_id,config_hash,start_block,block,block_hash) values(56,${historyHash},1,200,${blockHash(200n)})`;
  expect(await resumeFlapLiveWindow(db.sql,rpc,config,'c'.repeat(64))).toBeNull();
  expect(await resumeFlapLiveWindow(db.sql,rpc,config,historyHash)).toMatchObject({start:'9880',backfillFrom:'99'});
  const [live]=await db.sql`select start_block,block from chain_v2.flap_live_cursors`;
  expect(live).toMatchObject({start_block:'9880',block:'9879'});
  const [history]=await db.sql`select start_block,block from chain_v2.market_cursors`;
  expect(history).toMatchObject({start_block:'1',block:'200'});
  expect(await resumeFlapLiveWindow(db.sql,rpc,config,historyHash)).toBeNull();
 });
 it('never bypasses a halted cursor or a changed finalized checkpoint',async()=>{
  await db.sql`update chain_v2.flap_live_cursors set block=500,block_hash=${blockHash(501n)},halt_reason='halted'`;
  expect(await resumeFlapLiveWindow(db.sql,rpc,config,historyHash)).toBeNull();
  await db.sql`update chain_v2.flap_live_cursors set halt_reason=null`;
  await expect(resumeFlapLiveWindow(db.sql,rpc,config,historyHash)).rejects.toThrow('ancestry');
  expect((await db.sql`select block from chain_v2.flap_live_cursors`)[0]?.block).toBe('500');
 });
 it('puts visible feed tokens ahead of a long dormant watch queue and retains detail priority',async()=>{
  await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,name,symbol) values(56,'dormant',1,'old','OLD'),(56,'visible',2,'new','NEW'),(56,'detail',3,'detail','D')`;
  await db.sql`insert into chain_v2.flap_holder_watches(chain_id,address,requested_at,detail_requested_at) values(56,'dormant',now()-interval '20 minutes',null),(56,'visible',now(),null),(56,'detail',now()-interval '3 minutes',now())`;
  expect((await pendingFlapHolderWatches(db.sql)).map(w=>w.address)).toEqual(['detail','visible','dormant']);
  await db.sql`insert into chain_v2.flap_tokens(chain_id,address,created_block,created_at,name,symbol) values(56,'launch',4,now(),'launch','L')`;
  await db.sql`insert into chain_v2.flap_holder_watches(chain_id,address,requested_at,attempted_at) values(56,'launch',now(),now())`;
  expect((await pendingFlapHolderWatches(db.sql)).map(w=>w.address)).toEqual(['detail','launch','visible','dormant']);
 });
});
