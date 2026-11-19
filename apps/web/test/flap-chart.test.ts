import {it,expect,vi,afterEach} from 'vitest';
import {getFlapCandles} from '../lib/flap-market';
const address='0x1111111111111111111111111111111111111111';
afterEach(()=>vi.unstubAllGlobals());
it('builds real OHLC candles from the indexed priced trade history',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({chainId:56,trades:[{time:1795110000,priceUsd:1,usd:3},{time:1795110010,priceUsd:2,usd:5},{time:1795110061,priceUsd:1.5,usd:4}]})));
 const bars=await getFlapCandles(address,'1m');expect(bars).toHaveLength(2);expect(bars[0]).toMatchObject({open:1,close:2,high:2,low:1,volume:8});
});
it('does not fabricate candles when a quote/USD conversion is unknown',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({chainId:56,trades:[{time:1795110000,priceUsd:null,usd:null}]})));
 expect(await getFlapCandles(address,'1m')).toEqual([]);
});
it('orders same-timestamp trades by canonical block and log position for OHLC',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({chainId:56,trades:[
  {time:1795110000,block:'100',logIndex:5,priceUsd:3,usd:2},
  {time:1795110000,block:'100',logIndex:1,priceUsd:1,usd:4},
  {time:1795110000,block:'100',logIndex:3,priceUsd:2,usd:3},
 ]})));
 expect((await getFlapCandles(address,'1m'))[0]).toMatchObject({open:1,close:3,high:3,low:1,volume:9});
});
