import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {backendEnvironment, validateIndexDatabase} from '../../../scripts/backend-env.mjs';
import {freshDb, pgAvailable} from '../../../packages/agents/test/pg';
import {migrateDeployment} from '../scripts/railway-migrations';
import {productServer} from '../scripts/product-server';
import type {AgentsEnv} from '../src/agents/env';

describe('Railway runtime configuration', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('accepts only explicitly opted-in private Railway index hosts, preserving local safety', () => {
    const privateUrl = 'postgres://test:secret@postgres.railway.internal:5432/railway';
    expect(() => validateIndexDatabase(privateUrl, {})).toThrow('local');
    expect(validateIndexDatabase(privateUrl, {CLASHR_DEPLOYMENT:'railway'})).toBe(privateUrl);
    for (const host of ['postgres.example.com','postgres.railway.internal.attacker.com','railway.internal']) {
      expect(() => validateIndexDatabase(`postgres://test@${host}/db`, {CLASHR_DEPLOYMENT:'railway'})).toThrow();
    }
    expect(validateIndexDatabase('postgres://test@127.0.0.1/db', {})).toContain('127.0.0.1');
    expect(() => validateIndexDatabase('https://postgres.railway.internal/db', {CLASHR_DEPLOYMENT:'railway'})).toThrow('protocol');
  });
  it('ignores local env files in managed mode and preserves process overrides locally', () => {
    const root = mkdtempSync(join(tmpdir(),'clashr-railway-env-'));
    try {
      writeFileSync(join(root,'.env.backend'), 'CLASHR_ENV_FIXTURE=file\n');
      vi.stubEnv('CLASHR_ENV_FIXTURE', undefined);
      expect(backendEnvironment(root).env.CLASHR_ENV_FIXTURE).toBe('file');
      expect(backendEnvironment(root,undefined,true).env.CLASHR_ENV_FIXTURE).toBeUndefined();
      expect(backendEnvironment(root,undefined,true).source).toBe('process environment');
      vi.stubEnv('CLASHR_ENV_FIXTURE','process');
      expect(backendEnvironment(root).env.CLASHR_ENV_FIXTURE).toBe('process');
      expect(() => backendEnvironment(root,'missing')).toThrow('not found');
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  it('validates the actual managed launcher without connecting or requiring a local env file', () => {
    const file = fileURLToPath(new URL('../../../scripts/dev-backend.mjs', import.meta.url));
    const child = spawnSync(process.execPath,[file,'--railway','--check'], {encoding:'utf8',env:{...process.env,
      DATABASE_URL:'postgres://test:secret@postgres.railway.internal/railway', BSC_INDEX_DATABASE_URL:'postgres://test:secret@postgres.railway.internal/railway',
      BSC_RPC_URL:'https://rpc.invalid/private-key', BSC_START_BLOCK:'', BSC_LIVE_START_BLOCK:'', BSC_INDEX_EPOCH:'',
      PRODUCT_ORIGIN:'https://frontend.up.railway.app',IP_SALT:'stable-test',ADMIN_TOKEN:'stable-test',PRODUCT_MEDIA_DIR:'/data/media'}});
    expect(child.status,child.stderr).toBe(0);
    expect(child.stdout).toContain('api, live, history, metadata, holders, safety, discovery');
    expect(child.stdout+child.stderr).not.toMatch(/private-key|postgres:\/\//);
  });
});

const pg = await pgAvailable();
describe.skipIf(!pg)('Railway fresh database migration and transport', () => {
  let db: Awaited<ReturnType<typeof freshDb>>;
  beforeEach(async () => {db = await freshDb('railway_deploy',{migrate:false});});
  afterEach(async () => {await db?.drop();});
  it('initializes chain-56 product and index storage, then preserves data on redeploy', async () => {
    const launcher = fileURLToPath(new URL('../../../scripts/migrate-backend.mjs',import.meta.url));
    const migrated = spawnSync(process.execPath,[launcher,'--railway'],{encoding:'utf8',env:{...process.env,DATABASE_URL:db.url,BSC_INDEX_DATABASE_URL:db.url}});
    expect(migrated.status,migrated.stderr).toBe(0);
    expect(migrated.stdout).toContain('product database: applied');
    expect(migrated.stdout+migrated.stderr).not.toContain(db.url);
    const [identity] = await db.sql`select chain_id,halted from product_config`;
    expect(identity).toMatchObject({chain_id:56,halted:false});
    await db.sql`insert into product_events(id,config) values('migration-fixture','{}')`;
    expect(await migrateDeployment(db.sql,true)).toBe(0);
    expect(await db.sql`select * from product_events where id='migration-fixture'`).toHaveLength(1);
    expect(await db.sql`select * from chain_v2.flap_live_cursors`).toHaveLength(0);
    const server = productServer({DATABASE_URL:db.url,CHAIN_ID:'56'} as AgentsEnv,{publicOnly:true});
    await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200); expect(await health.json()).toMatchObject({ok:true,chainId:56});
      for (const route of ['/admin/sync-market','/admin/recover-trades']) expect((await fetch(base+route,{method:'POST'})).status).toBe(404);
    } finally {await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));}
  });
  it('refuses untracked existing data without creating migration state', async () => {
    await db.sql`create table existing_accounts(id text)`;
    await expect(migrateDeployment(db.sql,true)).rejects.toThrow('untracked non-empty');
    const [row] = await db.sql`select to_regclass('public.clashr_deployment_migrations') as name`;
    expect(row!.name).toBeNull();
  });
  it('fails closed when an applied migration checksum differs', async () => {
    await migrateDeployment(db.sql,true);
    await db.sql`update clashr_deployment_migrations set hash='changed' where name='migrations/0000_init.sql'`;
    await expect(migrateDeployment(db.sql,true)).rejects.toThrow('checksum');
    const [identity] = await db.sql`select chain_id from product_config`;
    expect(identity!.chain_id).toBe(56);
  });
  it('serializes concurrent predeploy commands', async () => {
    const counts = await Promise.all([migrateDeployment(db.sql,true),migrateDeployment(db.sql,true)]);
    expect(counts.filter(n=>n===0)).toHaveLength(1);
    const names = await db.sql`select name from clashr_deployment_migrations`;
    expect(new Set(names.map(r=>r.name)).size).toBe(names.length);
  });
});
