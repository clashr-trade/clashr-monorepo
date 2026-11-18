import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  RPC_URL: 'https://legacy-route.invalid',
  BSC_RPC_URL: 'https://bsc-route.invalid' as string | undefined,
}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env }) }));
import { POST } from '../app/api/rpc/route';

afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();env.BSC_RPC_URL='https://bsc-route.invalid';});
const request = (chain: string, body: unknown) => new Request(`https://local/api/rpc${chain}`, { method: 'POST', body: JSON.stringify(body) });
const read = { jsonrpc: '2.0', id: 7, method: 'eth_getBalance', params: ['0x0000000000000000000000000000000000000001', 'latest'] };

describe('RPC proxy chain isolation', () => {
  it('serves unconfigured BNB reads through the verified official provider',async()=>{
    env.BSC_RPC_URL=undefined;vi.stubEnv('BSC_RPC_URL','');
    const fetch=vi.fn().mockImplementation(async(_url:string,init:RequestInit)=>{
      const call=JSON.parse(init.body as string);
      return Response.json({jsonrpc:'2.0',id:call.id,result:call.method==='eth_chainId'?'0x38':'0x2'});
    });
    vi.stubGlobal('fetch',fetch);
    const response=await POST(request('?chainId=56',read));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({result:'0x2'});
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['https://bsc-dataseed.bnbchain.org','https://bsc-dataseed.bnbchain.org']);
    fetch.mockClear();
    expect((await POST(request('?chainId=56',{...read,method:'eth_sendRawTransaction'}))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses server-only development provider settings when Worker bindings are absent',async()=>{
    env.BSC_RPC_URL=undefined;vi.stubEnv('BSC_RPC_URL','https://local-configured.invalid');
    const fetch=vi.fn().mockImplementation(async(_url:string,init:RequestInit)=>{
      const call=JSON.parse(init.body as string);return Response.json({jsonrpc:'2.0',id:call.id,result:'0x38'});
    });
    vi.stubGlobal('fetch',fetch);
    expect((await POST(request('?chainId=56',read))).status).toBe(200);
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['https://local-configured.invalid','https://local-configured.invalid']);
  });
  it('keeps old clients on Robinhood and forwards explicit BSC reads to BSC only', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const call = JSON.parse(init.body as string);
      return Response.json({ jsonrpc: '2.0', id: call.id, result: call.method === 'eth_chainId' ? (url === env.RPC_URL ? '0x1237' : '0x38') : '0x1' });
    });
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request('', read))).status).toBe(200);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([env.RPC_URL, env.RPC_URL]);
    fetch.mockClear();
    expect((await POST(request('?chainId=56', read))).status).toBe(200);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([env.BSC_RPC_URL, env.BSC_RPC_URL]);
  });
  it('rejects BSC broadcasts, unsupported chains, unconfigured chains and invalid calls before RPC access', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request('?chainId=56', { ...read, method: 'eth_sendRawTransaction' }))).status).toBe(403);
    expect((await POST(request('?chainId=1', read))).status).toBe(400);
    expect((await POST(request('?chainId=97', read))).status).toBe(503);
    expect((await POST(request('', null))).status).toBe(400);
    expect((await POST(request('', [null, read]))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
