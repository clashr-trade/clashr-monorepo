import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshDb, pgAvailable } from '../../../packages/agents/test/pg';
import { productApp } from '../src/product/app';
import type { AgentsEnv } from '../src/agents/env';
import { loadConfig } from '../../../packages/clashr-mcp/src/config.ts';
import { Clashr } from '../../../packages/clashr-mcp/src/service.ts';
import type { Chain } from '../../../packages/clashr-mcp/src/chain.ts';

const pg = await pgAvailable();
describe.skipIf(!pg)('MCP registration against the independent BNB product', () => {
  let db: Awaited<ReturnType<typeof freshDb>>, dir: string, service: Clashr, restart: () => Clashr;
  beforeAll(async () => {
    db = await freshDb('clashr_mcp');
    await db.sql.unsafe(
      readFileSync(
        new URL('../../../packages/db/product/0001_bnb_product.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.sql.unsafe(
      readFileSync(
        new URL('../../../packages/db/product/0002_receipt_recovery.sql', import.meta.url),
        'utf8',
      ),
    );
    dir = mkdtempSync(join(tmpdir(), 'clashr-mcp-product-'));
    const env = {
      DATABASE_URL: db.url,
      CHAIN_ID: '56',
      PRODUCT_ORIGIN: 'http://localhost:3000',
      WEB_ORIGINS: 'http://localhost:3000',
      AGENTS_ENABLED: '1',
      AGENT_SIGNUP_ENABLED: '1',
      IP_SALT: 'mcp-test-only',
    } as AgentsEnv;
    const fetcher: typeof fetch = async (input, init) =>
      productApp.fetch(new Request(String(input), init), env);
    const chain: Chain = {
      chainId: async () => 56,
      balance: async () => 0n,
      quote: async () => {
        throw Error('Not used');
      },
      simulate: async () => {
        throw Error('Not used');
      },
    };
    restart = () => new Clashr(loadConfig({ CLASHR_STATE_DIR: dir }), chain, fetcher);
    service = restart();
  });
  afterAll(async () => {
    await db?.drop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  it('registers a signed chain-56 agent and restores its stored key across a restart', async () => {
    const wallet = await service.createWallet();
    const result = await service.register({
      handle: 'clashr_fixture',
      bio: 'Throwaway local test agent',
    });
    expect(result).toMatchObject({
      status: 'registered',
      apiKeyStoredLocally: true,
      member: { kind: 'agent', wallet: wallet.address.toLowerCase() },
    });
    const [stored] = await db.sql`select wallet,kind from members where handle='clashr_fixture'`;
    expect(stored).toMatchObject({ wallet: wallet.address.toLowerCase(), kind: 'agent' });
    service = restart();
    const status = await service.status();
    expect(status).toMatchObject({
      chainId: 56,
      balanceBnb: '0',
      member: { handle: 'clashr_fixture' },
      transactionsEnabled: false,
    });
    // A second registration is idempotent and does not rotate an existing key.
    expect((await service.register({ handle: 'ignored' })).status).toBe('already_registered');
    expect((await service.register({ handle: 'ignored', recoverKey: true })).status).toBe(
      'key_recovered',
    );
    const rows = await db.sql`select id from members where wallet=${wallet.address.toLowerCase()}`;
    expect(rows).toHaveLength(1);
    const [count] =
      await db.sql`select count(*)::int as n from api_keys where member_id=(select id from members where handle='clashr_fixture') and revoked_at is null`;
    expect(count?.n).toBe(1);
  });
});
