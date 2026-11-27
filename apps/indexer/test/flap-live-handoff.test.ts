import {readFileSync} from 'node:fs';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import {prepareFlapStartup} from '../src/bsc/startup';
import type {Hex} from 'viem';
const available=await pgAvailable(),hash=('0x'+'aa'.repeat(32)) as Hex;
describe.skipIf(!available)('audited live/history handoff',()=>{
 let db:Awaited<ReturnType<typeof freshDb>>;
 const rpc={chainId:async()=>56,header:async(n:bigint|'finalized')=>({number:n==='finalized'?1000n:n,hash,parentHash:hash,timestamp:Math.floor(Date.now()/1000)})};
 const env=()=>({DATABASE_URL:db.url,BSC_RPC_URL:'https://rpc.invalid',BSC_START_BLOCK:'10',BSC_LIVE_START_BLOCK:'20',BSC_INDEX_EPOCH:'handoff'});
 beforeAll(async()=>{db=await freshDb('live_handoff');await db.sql.unsafe(readFileSync(new URL('../../../packages/db/migrations/0023_flap_live_handoffs.sql',import.meta.url),'utf8'));});
 beforeEach(async()=>{await db.sql`truncate chain_v2.flap_startup_configs,chain_v2.market_cursors,chain_v2.flap_live_cursors,chain_v2.flap_live_handoffs`;await prepareFlapStartup(db.sql,rpc,env());await db.sql`update chain_v2.market_cursors set block=30,block_hash=${hash}`;await db.sql`update chain_v2.flap_live_cursors set block=40,block_hash=${hash}`;});
 afterAll(async()=>await db?.drop());
 it('starts a current live tail while retaining the exact history checkpoint and auditing the old live range',async()=>{
  const before=await db.sql`select * from chain_v2.market_cursors`;
  const settings=await prepareFlapStartup(db.sql,rpc,{...env(),BSC_LIVE_CATCHUP_BLOCKS:'100'});
  expect(settings.live.startBlock).toBe('1000');expect(settings.history.startBlock).toBe('10');
  expect(await db.sql`select * from chain_v2.market_cursors`).toEqual(before);
  expect((await db.sql`select previous_start,previous_block,next_start from chain_v2.flap_live_handoffs`)[0]).toMatchObject({previous_start:'20',previous_block:'40',next_start:'1000'});
  expect((await db.sql`select block,block_hash,start_block from chain_v2.flap_live_cursors`)[0]).toMatchObject({block:null,block_hash:null,start_block:'1000'});
  const restarted=await prepareFlapStartup(db.sql,rpc,{...env(),BSC_LIVE_CATCHUP_BLOCKS:'100'});
  expect(restarted).toEqual(settings);expect(await db.sql`select * from chain_v2.flap_live_handoffs`).toHaveLength(1);
 });
 it('rolls back when a saved checkpoint fails ancestry verification',async()=>{
  const before=await db.sql`select * from chain_v2.flap_live_cursors`;
  await expect(prepareFlapStartup(db.sql,{...rpc,header:async n=>({...await rpc.header(n),hash:n===40n?('0x'+'bb'.repeat(32)) as Hex:hash})},{...env(),BSC_LIVE_CATCHUP_BLOCKS:'100'})).rejects.toThrow('ancestry');
  expect(await db.sql`select * from chain_v2.flap_live_cursors`).toEqual(before);expect(await db.sql`select * from chain_v2.flap_live_handoffs`).toHaveLength(0);
 });
 it('keeps a current live cursor and refuses a handoff without covering history',async()=>{
  await db.sql`update chain_v2.flap_live_cursors set block=990`;
  expect((await prepareFlapStartup(db.sql,rpc,{...env(),BSC_LIVE_CATCHUP_BLOCKS:'100'})).live.startBlock).toBe('20');
  await db.sql`update chain_v2.flap_live_cursors set block=40`;
  await db.sql`update chain_v2.market_cursors set block=null,block_hash=null`;
  await expect(prepareFlapStartup(db.sql,rpc,{...env(),BSC_LIVE_CATCHUP_BLOCKS:'100'})).rejects.toThrow('retained history');
 });
});
