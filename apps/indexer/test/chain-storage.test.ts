import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { freshDb, pgAvailable } from '../../../packages/agents/test/pg';
import { migrateLegacyBatch, reconcileLegacySnapshot } from '../../../packages/db/src/chain-migration';
import { createChainApi } from '../src/chain-api';
import type { Env } from '../src/env';

const TOKEN = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const pg = await pgAvailable();

describe.skipIf(!pg)('chain successor storage and API (real PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof freshDb>>;
  let sql: Sql;
  beforeAll(async () => { db = await freshDb('chain_storage'); sql = db.sql; });
  afterAll(async () => { await db?.drop(); });
  async function drain() {
    for (let i = 0; i < 200; i++) {
      const result = await migrateLegacyBatch(sql, 2);
      if (result.phase === 'idle') return;
    }
    throw new Error('Backfill did not converge');
  }

  it('keeps legacy identities intact and backfills resumably without mixing native units', async () => {
    await sql`insert into public.tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at,price_eth)
      values(${TOKEN},'Legacy','OLD',18,100,${TOKEN},1,now(),0.5)`;
    await sql`insert into chain_v2.tokens(chain_id,address,name,symbol,decimals,total_supply,deployer,created_block,created_at,price_native)
      values(56,${TOKEN},'BSC','BNBTEST',18,200,${TOKEN},2,now(),0.25)`;
    await migrateLegacyBatch(sql, 1);
    await drain();
    await drain(); // Completed runs are safe to repeat.
    const rows = await sql`select chain_id,name,price_native::text from chain_v2.tokens where address=${TOKEN} order by chain_id`;
    expect(rows.map((row) => [row.chain_id,row.name,row.price_native])).toEqual([[56,'BSC','0.25'],[4663,'Legacy','0.5']]);
    expect((await sql`select price_eth::text from public.tokens where address=${TOKEN}`)[0]?.price_eth).toBe('0.5');
  });
  it('reconciles updates, primary-key changes and deletes to current legacy state', async () => {
    await sql`update public.tokens set name='Changed',address=${OTHER} where address=${TOKEN}`;
    await drain();
    expect((await sql`select name from chain_v2.tokens where chain_id=4663 and address=${OTHER}`)[0]?.name).toBe('Changed');
    expect(await sql`select 1 from chain_v2.tokens where chain_id=4663 and address=${TOKEN}`).toHaveLength(0);
    await sql`delete from public.tokens where address=${OTHER}`;
    await drain();
    expect(await sql`select 1 from chain_v2.tokens where chain_id=4663 and address=${OTHER}`).toHaveLength(0);
    expect(await sql`select 1 from chain_v2.tokens where chain_id=56 and address=${TOKEN}`).toHaveLength(1);
  });
  it('audits complete rows and rejects drift even when row counts match', async () => {
    expect((await reconcileLegacySnapshot(sql)).ready).toBe(true);
    await sql`insert into public.tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at)
      values(${OTHER},'Audit','AUDIT',18,1,${OTHER},1,now())`;
    expect((await reconcileLegacySnapshot(sql)).ready).toBe(false);
    await drain();
    expect((await reconcileLegacySnapshot(sql)).ready).toBe(true);
    await sql`update chain_v2.tokens set name='Drift' where chain_id=4663 and address=${OTHER}`;
    const audit = await reconcileLegacySnapshot(sql);
    expect(audit.ready).toBe(false);
    expect(audit.tables.find((t) => t.table === 'tokens')).toMatchObject({source:'1',target:'1',missing:'1',extra:'1'});
    await sql`delete from public.tokens where address=${OTHER}`;
    await drain();
    expect((await reconcileLegacySnapshot(sql)).ready).toBe(true);
  });
  it('isolates identical transaction hashes and pool IDs by chain and protocol', async () => {
    for (const chain of [4663,56,97]) {
      await sql`insert into chain_v2.swaps(chain_id,tx,log_index,token,pool,block,time,trader,side,token_amount,quote,quote_amount)
        values(${chain},'same-hash',0,${TOKEN},${TOKEN},1,now(),${OTHER},'buy',1,${OTHER},2)`;
      for (const dex of ['v2','v3']) await sql`insert into chain_v2.pools(chain_id,id,token,quote,dex,created_block,created_at)
        values(${chain},${TOKEN},${TOKEN},${OTHER},${dex},1,now())`;
    }
    expect(await sql`select 1 from chain_v2.swaps where tx='same-hash'`).toHaveLength(3);
    expect(await sql`select 1 from chain_v2.pools where id=${TOKEN}`).toHaveLength(6);
    await expect(sql`insert into chain_v2.indexer_state(chain_id,key,value) values(1,'cursor','{}')`).rejects.toThrow();
  });
  it('serves only explicitly ready chain-qualified data; legacy data is never a BSC fallback', async () => {
    const api = createChainApi(() => postgres(db.url, { max: 1, fetch_types: false, prepare: false }));
    const env = { CHAIN_V2_READS: '1' } as Env;
    expect((await api.request('/chains/56/tokens', {}, env)).status).toBe(503);
    await sql`insert into chain_v2.indexer_state(chain_id,key,value) values(56,'market_ready','true')`;
    expect((await api.request('/chains/56/tokens', {}, env)).status).toBe(503);
    await sql`insert into chain_v2.market_cursors(chain_id,config_hash,start_block,block,block_hash,observed_finalized,checked_at)
      values(56,'test',1,1,${'0x'+'a'.repeat(64)},1,now())`;
    const response = await api.request(`/chains/56/tokens/${TOKEN}`, {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ chainId:56,token:{ chain_id:56,name:'BSC' } });
    expect((await api.request(`/chains/4663/tokens/${TOKEN}`, {}, env)).status).toBe(404);
    expect((await api.request('/chains/56/tokens?limit=NaN', {}, env)).status).toBe(400);
    expect((await api.request('/chains/56/tokens?limit=101', {}, env)).status).toBe(400);
    expect((await api.request('/chains/56/tokens/invalid', {}, env)).status).toBe(400);
  });
  it('does not lose an earlier sequence ID whose transaction commits later', async () => {
    let allocated!: () => void;
    let release!: () => void;
    const allocation = new Promise<void>((resolve) => { allocated = resolve; });
    const commit = new Promise<void>((resolve) => { release = resolve; });
    const slow = sql.begin(async (tx) => {
      await tx`insert into public.tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at)
        values(${TOKEN},'Late commit','LATE',18,1,${TOKEN},1,now())`;
      allocated();
      await commit;
    });
    try {
      await allocation;
      await sql`insert into public.tokens(address,name,symbol,decimals,total_supply,deployer,created_block,created_at)
        values(${OTHER},'Early commit','EARLY',18,1,${OTHER},1,now())`;
      await drain();
    } finally { release(); }
    await slow;
    await drain();
    expect(await sql`select 1 from chain_v2.tokens where chain_id=4663 and address in (${TOKEN},${OTHER})`).toHaveLength(2);
  });
  it('rolls back failed batches without acknowledging changes or changing another chain', async () => {
    await sql`insert into public.trades_ledger(id,chain_id,status,tx_hash,ts,trader,source_kind)
      values('unexpected-chain',56,'submitted','poison-hash',now(),${TOKEN},'web')`;
    const [before] = await sql`select count(*)::int as count from chain_v2.legacy_changes`;
    await expect(migrateLegacyBatch(sql)).rejects.toThrow('unexpected chain');
    const [after] = await sql`select count(*)::int as count from chain_v2.legacy_changes`;
    expect(after?.count).toBe(before?.count);
    expect(await sql`select 1 from chain_v2.trades_ledger where id='unexpected-chain'`).toHaveLength(0);
    await sql`delete from public.trades_ledger where id='unexpected-chain'`;
    await drain();
    expect((await sql`select name from chain_v2.tokens where chain_id=56 and address=${TOKEN}`)[0]?.name).toBe('BSC');
  });
  it('handles legacy TRUNCATE rebuilds without deleting BSC data', async () => {
    await sql`truncate public.tokens`;
    expect(await sql`select 1 from chain_v2.tokens where chain_id=4663`).toHaveLength(0);
    expect(await sql`select 1 from chain_v2.tokens where chain_id=56`).toHaveLength(1);
    expect((await sql`select complete from chain_v2.backfill_progress where table_name='tokens'`)[0]?.complete).toBe(false);
    await drain();
    expect((await sql`select complete from chain_v2.backfill_progress where table_name='tokens'`)[0]?.complete).toBe(true);
  });
});

describe('chain API deployment gates', () => {
  const api = createChainApi(() => { throw new Error('must not open a database'); });
  it('rejects unknown chain IDs and reports capabilities without storage access', async () => {
    expect((await api.request('/chains/1/tokens', {}, {} as Env)).status).toBe(400);
    expect((await api.request('/chains/56/tokens', {}, {} as Env)).status).toBe(503);
    const response = await api.request('/chains/56/capabilities', {}, {} as Env);
    expect(await response.json()).toMatchObject({chainId:56,trading:false,marketReadsConfigured:false});
  });
});
