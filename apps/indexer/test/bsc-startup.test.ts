import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {freshDb, pgAvailable} from '../../../packages/agents/test/pg';
import {bscConfig} from '../src/bsc/config';
import {prepareFlapStartup} from '../src/bsc/startup';
import type {Hex} from 'viem';

const schema = readFileSync(new URL('../../../packages/db/migrations/0021_flap_startup_config.sql', import.meta.url), 'utf8');
const pg = await pgAvailable();
describe.skipIf(!pg)('persisted Flap startup (PostgreSQL)', () => {
  let db: Awaited<ReturnType<typeof freshDb>>;
  const env = () => ({DATABASE_URL: db.url, BSC_RPC_URL: 'https://rpc.invalid'});
  const rpc = () => ({chainId: vi.fn(async () => 56), header: vi.fn(async () => ({number: 1000n,
    timestamp: Math.floor(Date.now()/1000), hash: `0x${'a'.repeat(64)}` as Hex, parentHash: `0x${'b'.repeat(64)}` as Hex}))});
  beforeAll(async () => {db = await freshDb('flap_startup');});
  beforeEach(async () => {await db.sql`truncate chain_v2.flap_startup_configs,chain_v2.market_cursors,chain_v2.flap_live_cursors`;});
  afterAll(async () => {await db?.drop();});

  it('initializes both modes once from one finalized head and resumes despite stale environment values', async () => {
    const provider = rpc();
    const initial = await prepareFlapStartup(db.sql, provider, env(), {schema});
    expect(initial.history.startBlock).toBe('1000');
    expect(initial.live.startBlock).toBe('1000');
    expect(provider.chainId).toHaveBeenCalledTimes(1);
    expect(provider.header).toHaveBeenCalledTimes(1);
    await db.sql`update chain_v2.market_cursors set block=1005,block_hash=${'0x'+'c'.repeat(64)} where chain_id=56`;
    const offline = {chainId: vi.fn(() => {throw new Error('offline');}), header: vi.fn(() => {throw new Error('offline');})};
    const resumed = await prepareFlapStartup(db.sql, offline, {...env(), BSC_START_BLOCK:'7', BSC_LIVE_START_BLOCK:'8', BSC_INDEX_EPOCH:'stale'}, {schema});
    expect(resumed).toEqual(initial);
    expect(offline.chainId).not.toHaveBeenCalled();
    const [cursor] = await db.sql`select block,block_hash from chain_v2.market_cursors where chain_id=56`;
    expect(String(cursor!.block)).toBe('1005');
    expect(cursor!.block_hash).toBe('0x'+'c'.repeat(64));
    const [saved] = await db.sql`select configuration from chain_v2.flap_startup_configs where mode='history'`;
    expect(saved!.configuration).toMatchObject({version:2,decoder:'flap-1',scope:'flap-portal',epoch:'flap_v1',chain:{chainId:56}});
  });

  it('preserves explicit first-run historical coverage without RPC sampling', async () => {
    const provider = rpc();
    const result = await prepareFlapStartup(db.sql, provider, {...env(), BSC_START_BLOCK:'10', BSC_LIVE_START_BLOCK:'900', BSC_INDEX_EPOCH:'chosen'}, {schema});
    expect(result.history).toMatchObject({startBlock:'10',epoch:'chosen'});
    expect(result.live).toMatchObject({startBlock:'900',epoch:'chosen_live'});
    expect(provider.chainId).not.toHaveBeenCalled();
  });

  it('runs the actual startup entry point and reuses its saved configuration without exposing credentials', () => {
    const require = createRequire(new URL('../../../packages/trade/package.json', import.meta.url));
    const loader = pathToFileURL(require.resolve('tsx')).href;
    const file = fileURLToPath(new URL('../scripts/prepare-backend-index.ts', import.meta.url));
    const run = (extra: Record<string,string>) => spawnSync(process.execPath, ['--import',loader,file], {
      encoding:'utf8', env:{...process.env, DATABASE_URL:db.url, BSC_INDEX_DATABASE_URL:db.url,
        BSC_RPC_URL:'https://rpc.invalid/private-key', BSC_START_BLOCK:'10', BSC_LIVE_START_BLOCK:'20', BSC_INDEX_EPOCH:'entry', ...extra},
    });
    const first = run({});
    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({BSC_START_BLOCK:'10',BSC_LIVE_START_BLOCK:'20',BSC_INDEX_EPOCH:'entry',BSC_LIVE_INDEX_EPOCH:'entry_live'});
    const second = run({BSC_START_BLOCK:'50',BSC_INDEX_EPOCH:'stale'});
    expect(second.status, second.stderr).toBe(0);
    expect(JSON.parse(second.stdout)).toEqual(JSON.parse(first.stdout));
    expect(first.stderr+second.stderr).not.toContain('private-key');
    expect(first.stderr+second.stderr).not.toContain(db.url);
  });

  it('adopts a verified legacy cursor without changing its progress, including an advanced live start', async () => {
    const input = {...env(), BSC_INDEX_ENABLED:'1', BSC_INDEX_SOURCE:'flap', BSC_START_BLOCK:'10', BSC_LIVE_START_BLOCK:'20', BSC_INDEX_EPOCH:'old'};
    const history = await bscConfig(input);
    const live = await bscConfig({...input, BSC_START_BLOCK:'20', BSC_INDEX_EPOCH:'old_live'});
    await db.sql`insert into chain_v2.market_cursors(chain_id,config_hash,start_block,block,block_hash) values(56,${history.hash},10,40,${'0x'+'c'.repeat(64)})`;
    await db.sql`insert into chain_v2.flap_live_cursors(chain_id,config_hash,start_block) values(56,${live.hash},30)`;
    const result = await prepareFlapStartup(db.sql, rpc(), input, {schema});
    expect(result.live.startBlock).toBe('20');
    expect(result.history.hash).toBe(history.hash);
    const [cursor] = await db.sql`select block from chain_v2.market_cursors`;
    expect(String(cursor!.block)).toBe('40');
  });

  it('recognizes the saved legacy start only when its hash verifies and rolls back both modes on mismatch', async () => {
    const config = await bscConfig({...env(), BSC_INDEX_ENABLED:'1', BSC_INDEX_SOURCE:'flap', BSC_START_BLOCK:'10', BSC_INDEX_EPOCH:'old'});
    await db.sql`insert into chain_v2.market_cursors(chain_id,config_hash,start_block) values(56,${config.hash},10)`;
    const input = {...env(), BSC_START_BLOCK:'99', BSC_LIVE_START_BLOCK:'20', BSC_INDEX_EPOCH:'old'};
    const result = await prepareFlapStartup(db.sql, rpc(), input, {readOnly:true});
    expect(result.history.startBlock).toBe('10');
    expect(await db.sql`select * from chain_v2.flap_startup_configs`).toHaveLength(0);
    await db.sql`insert into chain_v2.flap_live_cursors(chain_id,config_hash,start_block) values(56,${'f'.repeat(64)},20)`;
    await expect(prepareFlapStartup(db.sql, rpc(), input, {schema})).rejects.toThrow('Legacy cursor configuration mismatch');
    expect(await db.sql`select * from chain_v2.flap_startup_configs`).toHaveLength(0);
    const [cursor] = await db.sql`select config_hash from chain_v2.market_cursors`;
    expect(cursor!.config_hash).toBe(config.hash);
  });

  it('rejects wrong-chain/stale heads without initializing cursors', async () => {
    const wrong = rpc(); wrong.chainId.mockResolvedValue(4663);
    await expect(prepareFlapStartup(db.sql, wrong, env(), {schema})).rejects.toThrow('not BNB');
    const stale = rpc(); stale.header.mockResolvedValue({...await stale.header(),timestamp:1});
    await expect(prepareFlapStartup(db.sql, stale, env(), {schema})).rejects.toThrow('stale');
    expect(await db.sql`select * from chain_v2.market_cursors`).toHaveLength(0);
  });

  it('keeps integrity halts and incompatible saved configurations blocking startup', async () => {
    await prepareFlapStartup(db.sql, rpc(), env(), {schema});
    await db.sql`update chain_v2.market_cursors set halt_reason='changed finalized hash'`;
    await expect(prepareFlapStartup(db.sql, rpc(), env(), {schema})).rejects.toThrow('integrity halt');
    await db.sql`update chain_v2.market_cursors set halt_reason=null`;
    await db.sql`update chain_v2.flap_startup_configs set config_hash=${'f'.repeat(64)} where mode='history'`;
    await expect(prepareFlapStartup(db.sql, rpc(), env(), {schema})).rejects.toThrow('incompatible');
  });

  it('serializes concurrent initializers so both reuse the first persisted configuration', async () => {
    const initial = await prepareFlapStartup(db.sql, rpc(), env(), {schema});
    const results = await Promise.allSettled([
      prepareFlapStartup(db.sql, rpc(), env(), {schema}),
      prepareFlapStartup(db.sql, rpc(), env(), {schema}),
    ]);
    for (const result of results) {
      if (result.status === 'fulfilled') expect(result.value).toEqual(initial);
      else expect(String(result.reason)).toContain('worker is active');
    }
    expect(await db.sql`select * from chain_v2.flap_startup_configs`).toHaveLength(2);
  });
});
