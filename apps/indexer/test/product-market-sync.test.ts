import {afterEach,describe,it,expect,vi} from 'vitest';
import type {Sql} from 'postgres';
import {syncProductMarket} from '../src/product/market';

afterEach(()=>vi.unstubAllGlobals());
describe('internal market metadata sync',()=>{
  it('does not consume RPC quota or open database work for an empty indexed feed',async()=>{
    const fetcher=vi.fn(async(_input:unknown)=>Response.json({chainId:56,source:'flap',tokens:[]}));
    vi.stubGlobal('fetch',fetcher);
    const sql=vi.fn(()=>{throw new Error('No SQL needed for empty feed');}) as unknown as Sql;
    expect(await syncProductMarket(sql,'http://127.0.0.1:3000','https://quota-exhausted.invalid')).toMatchObject({updated:0,metadataOnly:true});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3000/api/bsc/market');
    expect(sql).not.toHaveBeenCalled();
  });
});
