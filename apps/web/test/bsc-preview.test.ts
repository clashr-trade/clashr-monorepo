import { describe, expect, it, vi } from 'vitest';
import { proxyBscRead } from '../lib/bsc-preview';

const address = '0x'+'1'.repeat(40);
const coverage = {fromBlock:'10',throughBlock:'12',finality:'finalized'};
const token = {chain_id:56,address,name:'Token',symbol:'TOK',decimals:18,total_supply:'1000000000000000000'};
describe('BSC preview read boundary', () => {
  it('never requests a legacy/default API when its own source is missing or misconfigured', async () => {
    const fetcher = vi.fn();
    for (const base of [undefined,'file:///tmp/data','https://user:secret@wrong.invalid','https://api.invalid/v1']) {
      const response = await proxyBscRead(['tokens'],base,fetcher);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({error:'bsc_not_configured'});
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect((await proxyBscRead(['..','v1','trades'],'https://bsc.invalid',fetcher)).status).toBe(400);
  });
  it('requests only chain 56 and forwards verified coverage with caching disabled', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({chainId:56,coverage,tokens:[token]}));
    const response = await proxyBscRead(['tokens'],'https://bsc.invalid',fetcher);
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://bsc.invalid/v2/chains/56/tokens?limit=50&status=spot');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({chainId:56,coverage,tokens:[token]});
  });
  it('rejects mixed-chain payloads and unfinalized provenance instead of displaying them', async () => {
    for (const body of [
      {chainId:4663,coverage,tokens:[token]},
      {chainId:56,coverage,tokens:[{...token,chain_id:4663}]},
      {chainId:56,coverage:{...coverage,finality:'latest'},tokens:[token]},
      {chainId:56,tokens:[token]},
    ]) {
      expect((await proxyBscRead(['tokens'],'https://bsc.invalid',async () => Response.json(body))).status).toBe(503);
    }
    expect((await proxyBscRead(['tokens',address,'pools'],'https://bsc.invalid',async () => Response.json({chainId:56,coverage,pools:[{chain_id:4663,id:address,dex:'v2'}]}))).status).toBe(503);
  });
  it('distinguishes missing coverage, unknown tokens and a disconnected source', async () => {
    const syncing = await proxyBscRead(['tokens'],'https://bsc.invalid',async () => Response.json({error:'chain_data_not_ready'},{status:503}));
    expect(await syncing.json()).toEqual({error:'chain_data_not_ready'});
    const missing = await proxyBscRead(['tokens',address],'https://bsc.invalid',async () => Response.json({error:'not_found'},{status:404}));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({error:'token_not_found'});
    const offline = await proxyBscRead(['tokens'],'https://bsc.invalid',async () => { throw new Error('secret provider failure'); });
    expect(await offline.json()).toEqual({error:'bsc_unavailable'});
  });
});
