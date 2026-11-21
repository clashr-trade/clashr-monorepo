import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }));
import { middleware } from '../middleware';
import { POST } from '../app/api/rpc/route';
import { devAllowedOrigin } from '../lib/dev-origin';
import { proxyProduct } from '../lib/product-proxy';

const DEV = 'http://203.0.113.5:3000';
const page = () => middleware(new NextRequest(`${DEV}/trenches`, { headers: { host: '203.0.113.5:3000' } }));
const rpc = () =>
  POST(new Request(`${DEV}/api/rpc?chainId=56`, { method: 'POST', headers: { origin: DEV },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('DEV_ALLOWED_ORIGIN', () => {
  it('is ignored when unset, malformed or in production builds', () => {
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID', '56');
    expect(devAllowedOrigin()).toBeNull();
    expect(page().status).toBe(301);
    vi.stubEnv('DEV_ALLOWED_ORIGIN', 'not a url');
    expect(devAllowedOrigin()).toBeNull();
    vi.stubEnv('DEV_ALLOWED_ORIGIN', DEV);
    vi.stubEnv('NODE_ENV', 'production');
    expect(devAllowedOrigin()).toBeNull();
    const response = page();
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toMatch(/^https:/);
  });

  it('serves the configured dev host over http without HSTS', () => {
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID', '56');
    vi.stubEnv('DEV_ALLOWED_ORIGIN', DEV);
    const response = page();
    expect(response.status).toBe(200);
    expect(response.headers.get('strict-transport-security')).toBeNull();
    const other = middleware(new NextRequest('http://198.51.100.9:3000/trenches', { headers: { host: '198.51.100.9:3000' } }));
    expect(other.status).toBe(301);
  });

  it('admits the configured origin to product API writes only when set', async () => {
    const upstream = vi.fn(async () => Response.json({ ok: true }, { headers: { 'x-clashr-chain-id': '56' } }));
    const write = (origin: string) =>
      proxyProduct(new Request('http://localhost:3000/api/product/v1/me', { method: 'POST', headers: { origin }, body: '{}' }),
        ['v1', 'me'], 'http://127.0.0.1:8790', upstream as unknown as typeof fetch);
    expect((await write(DEV)).status).toBe(403);
    vi.stubEnv('DEV_ALLOWED_ORIGIN', DEV);
    expect((await write(DEV)).status).toBe(200);
    expect((await write('http://198.51.100.9:3000')).status).toBe(403);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await write(DEV)).status).toBe(403);
  });

  it('admits the configured origin to the RPC proxy only when set', async () => {
    vi.stubEnv('BSC_RPC_URL', 'https://bsc-route.invalid');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jsonrpc: '2.0', id: 1, result: '0x38' })));
    expect((await rpc()).status).toBe(403);
    vi.stubEnv('DEV_ALLOWED_ORIGIN', DEV);
    expect((await rpc()).status).toBe(200);
  });
});
