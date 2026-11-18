import {describe,expect,it,vi} from 'vitest';
import {getPublicBscMarket,getPublicBscToken,getPublicBscCandles,normalizeBscPools,type PoolDocument} from '../lib/bsc-public-market';
const token='0x'+'1'.repeat(40),quote='0x'+'2'.repeat(40),pool='0x'+'3'.repeat(40);
function document():PoolDocument{return {data:[{id:`bsc_${pool}`,type:'pool',attributes:{address:pool,pool_created_at:'2026-11-17T00:00:00Z',market_cap_usd:null,fdv_usd:'999999',base_token_price_usd:'0.25',volume_usd:{h24:'100'},reserve_in_usd:'1000'},relationships:{base_token:{data:{id:`bsc_${token}`}},quote_token:{data:{id:`bsc_${quote}`}},dex:{data:{id:'pancakeswap_v2'}}}}],included:[{id:`bsc_${token}`,type:'token',attributes:{address:token,name:'Token',symbol:'TOK',decimals:6}},{id:`bsc_${quote}`,type:'token',attributes:{address:quote,symbol:'WBNB'}}]};}
describe('Public BSC terminal market adapter',()=>{
  it('maps only BSC Pancake v2/v3 pools without inventing holder counts, market cap or risk',()=>{
    const rows=normalizeBscPools(document(),'almost');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({chain_id:56,market_column:'almost',address:token,price_usd:0.25,holders_known:false,market_cap_usd:null,risk:null,bonding_progress:null,decimals:6});
  });
  it('rejects cross-chain resource IDs, Infinity and malformed contract identities',()=>{
    for(const bad of ['chain','dex','address']) {
      const input=document();
      if(bad==='chain')input.data![0]!.id=`eth_${pool}`;
      if(bad==='dex')input.data![0]!.relationships!.dex!.data!.id='pancakeswap-infinity-clmm';
      if(bad==='address')input.included![0]!.attributes!.address='not-an-address';
      expect(normalizeBscPools(input,'new')).toEqual([]);
    }
  });
  it('does not assume 18 decimals when provider metadata is missing',()=>{
    const input=document();delete input.included![0]!.attributes!.decimals;
    expect(normalizeBscPools(input,'new')[0]?.decimals).toBeNull();
  });
  it('deduplicates tokens across categories and records partial source failure',async()=>{
    const fetcher=vi.fn(async(url:unknown)=>String(url).includes('trending_pools')?new Response('rate limited',{status:429}):Response.json(document()));
    const result=await getPublicBscMarket(fetcher);
    expect(result.tokens).toHaveLength(1);expect(result.partial).toBe(true);
    expect(result.provenance).toBe('third-party-indicative');
    expect(fetcher.mock.calls.every(([url])=>String(url).includes('/networks/bsc/'))).toBe(true);
  });
  it('fails instead of returning Robinhood/sample rows if every source fails',async()=>{
    await expect(getPublicBscMarket(async()=>new Response('',{status:503}))).rejects.toThrow('unavailable');
  });
  it('returns only the requested token on detail lookup and rejects arbitrary addresses before fetching',async()=>{
    const fetcher=vi.fn(async()=>Response.json(document()));
    expect((await getPublicBscToken(token,fetcher))?.token.address).toBe(token);
    expect(await getPublicBscToken(quote,fetcher)).toBeNull();
    fetcher.mockClear();
    expect(await getPublicBscToken('../../legacy',fetcher)).toBeNull();expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses the scoped pool for charts, orders candles and rejects inconsistent price bars',async()=>{
    const fetcher=vi.fn(async(url:unknown)=>String(url).includes('/ohlcv/')?Response.json({data:{attributes:{ohlcv_list:[
      [120,2,4,1,3,50], [60,1,2,0.5,1.5,25], [180,2,1,0.5,3,50],
    ]}}}):Response.json(document()));
    const candles=await getPublicBscCandles(token,'5m',fetcher);
    expect(candles.map(c=>c.time)).toEqual([60,120]);
    expect(String(fetcher.mock.calls[1]![0])).toContain(`/networks/bsc/pools/${pool}/ohlcv/minute?aggregate=5`);
    fetcher.mockClear();
    await expect(getPublicBscCandles(token,'1s',fetcher)).rejects.toThrow('Unsupported');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
