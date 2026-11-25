import {afterEach,describe,it,expect,vi} from 'vitest';
import type {Sql} from 'postgres';
import {indexedProductMarket,syncProductMarket} from '../src/product/market';

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
  it('syncs an indexed document without contacting a frontend',async()=>{
    const fetcher=vi.fn(()=>{throw new Error('Frontend must not be called');});vi.stubGlobal('fetch',fetcher);
    const sql=vi.fn(()=>{throw new Error('No SQL needed for empty feed');}) as unknown as Sql;
    await expect(syncProductMarket(sql,{chainId:56,source:'flap',tokens:[]})).resolves.toMatchObject({updated:0,source:'flap'});
    expect(fetcher).not.toHaveBeenCalled();expect(sql).not.toHaveBeenCalled();
  });
  it('maps finalized index rows into new, almost and migrated metadata',()=>{
    const token={chainId:56,coin:{address:'0x'+'ab'.repeat(20),name:'Example',symbol:'EX',image:'https://example.com/token.png'},decimals:18,progress:10,listed:false,createdAt:'2026-11-25T00:00:00Z',priceUsd:2,totalSupply:'100000000000000000000',quoteToken:'0x'+'00'.repeat(20),holders:3};
    const index={chainId:56,provenance:'finalized-onchain',items:[token,{...token,progress:75},{...token,listed:true},{...token,decimals:null},{...token,progress:NaN}]};
    const result=indexedProductMarket(index as unknown as Parameters<typeof indexedProductMarket>[0]);
    expect(result.tokens.map(t=>t.market_column)).toEqual(['new','almost','migrated']);
    expect(result.tokens[0]).toMatchObject({market_cap_usd:200,bonding_progress:.1,holders:3,launchpad:'flap'});
    expect(()=>indexedProductMarket({...index,chainId:4663} as unknown as Parameters<typeof indexedProductMarket>[0])).toThrow('Wrong indexed market source');
  });

});
