import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {freshDb,pgAvailable} from '../../../packages/agents/test/pg';
import type {BscSpotQuote} from '@rushr/trade/bsc';
const state=vi.hoisted(()=>({finalized:true,hash:'0x'+'a'.repeat(64),stale:false}));
vi.mock('@rushr/trade/bsc',async importOriginal=>({...await importOriginal<any>(),reconcileBscSpot:vi.fn(async(_client,q,hash)=>({
  actualTokenAmount:10n**18n,actualNativeAmount:10n**15n,networkFeeWei:100n,finality:state.finalized?'finalized':'mined',meetsMinimum:true,
  transactions:[{hash,block:100n,blockHash:state.hash,status:'success'}],
}))}));
import {journalBscTrade} from '../src/product/trade';
const available=await pgAvailable();
describe.skipIf(!available)('BNB durable receipt and financial projection',()=>{
  let db:Awaited<ReturnType<typeof freshDb>>;
  const trader='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40);
  const quote={request:{trader,token,side:'buy'},tokenDecimals:18,pool:'0x'+'3'.repeat(40),router:'0x'+'4'.repeat(40),venue:'pancake-v2'} as BscSpotQuote;
  const client={getBlock:async()=>({number:100n,hash:state.hash,timestamp:1700000000n}),readContract:async({functionName}:{functionName:string})=>{
    if(functionName==='decimals')return 8;if(functionName==='description')return 'BNB / USD';
    if(functionName==='balanceOf')return 10n**18n;
    return [1n,60000000000n,1699999990n,state.stale?1699900000n:1699999990n,1n];
  }} as unknown as Parameters<typeof journalBscTrade>[1];
  beforeAll(async()=>{
    db=await freshDb('bnb_accounting');
    for(const name of ['0001_bnb_product','0002_receipt_recovery'])await db.sql.unsafe(await readFile(new URL(`../../../packages/db/product/${name}.sql`,import.meta.url),'utf8'));
    await db.sql`insert into tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at,status) values(${token},'Fixture','FIX',18,'1000000000000000000',${token},1,now(),'new')`;
  });
  afterAll(async()=>{await db?.drop();});
  it('journals mined receipts without projecting unfinalized financial facts',async()=>{
    state.finalized=false;const hash=('0x'+'5'.repeat(64)) as `0x${string}`;
    expect((await journalBscTrade(db.sql,client,quote,hash)).projected).toBe(false);
    expect((await db.sql`select * from verified_bnb_trades where tx_hash=${hash}`)).toHaveLength(1);
    expect((await db.sql`select * from swaps where tx=${hash}`)).toHaveLength(0);
  });
  it('projects a finalized fill using the historical oracle and is idempotent on replay',async()=>{
    state.finalized=true;const hash=('0x'+'6'.repeat(64)) as `0x${string}`;
    expect((await journalBscTrade(db.sql,client,quote,hash)).projected).toBe(true);
    expect((await journalBscTrade(db.sql,client,quote,hash)).projected).toBe(true);
    const [position]=await db.sql`select * from positions where wallet=${trader} and token=${token}`;
    expect(position.buys).toBe(1);expect(Number(position.bought_usd)).toBeCloseTo(0.6);
    expect((await db.sql`select * from swaps where tx=${hash}`)).toHaveLength(1);
    const [ledger]=await db.sql`select chain_id,fee_amount from trades_ledger where tx_hash=${hash}`;
    expect(ledger.chain_id).toBe(56);expect(String(ledger.fee_amount)).toBe('0');
  });
  it('retains the receipt but refuses stale USD data for financial projection',async()=>{
    state.stale=true;const hash=('0x'+'7'.repeat(64)) as `0x${string}`;
    await expect(journalBscTrade(db.sql,client,quote,hash)).rejects.toThrow('Fresh historical');
    expect((await db.sql`select * from verified_bnb_trades where tx_hash=${hash}`)).toHaveLength(1);
    expect((await db.sql`select * from swaps where tx=${hash}`)).toHaveLength(0);state.stale=false;
  });
  it('persists a halt if an already finalized receipt moves to another block hash',async()=>{
    const hash=('0x'+'6'.repeat(64)) as `0x${string}`;state.hash='0x'+'b'.repeat(64);
    await expect(journalBscTrade(db.sql,client,quote,hash)).rejects.toThrow('Finalized receipt changed');
    const [config]=await db.sql`select halted from product_config`;expect(config.halted).toBe(true);
  });
});
