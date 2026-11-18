import {describe,it,expect,vi} from 'vitest';
import {normalizeFourMemeRows,getFourMemeMarket} from '../lib/fourmeme-market';
const row={networkCode:0,tokenAddress:'0x'+'1'.repeat(40),name:'Fixture',shortName:'FIX',symbol:'BNB',status:'PUBLISH',progress:'0.6',createDate:'1794926870000',cap:'100',price:'0.0000001',hold:12,day1Vol:'1234',img:'/market/fixture.png'};
describe('BNB launchpad lifecycle and quote currency',()=>{
  it('classifies real lifecycle state and converts quote-denominated cap/price without changing USD volume',()=>{
    const [token]=normalizeFourMemeRows([row],600);
    expect(token).toMatchObject({market_column:'almost',status:'bonding',bonding_progress:0.6,market_cap_usd:60000,volume_24h_usd:1234,holders:12,image_url:'https://static.four.meme/market/fixture.png'});
    expect(normalizeFourMemeRows([{...row,status:'TRADE',progress:'1'}],600)[0]?.market_column).toBe('migrated');
    expect(normalizeFourMemeRows([{...row,progress:'0.2'}],600)[0]?.market_column).toBe('new');
    expect(normalizeFourMemeRows([{...row,symbol:'USDT'}],null)[0]?.market_cap_usd).toBe(100);
    expect(normalizeFourMemeRows([row],null)[0]?.market_cap_usd).toBeNull();
  });
  it('rejects wrong networks, invalid lifecycle values and malformed addresses',()=>{
    expect(normalizeFourMemeRows([{...row,networkCode:1},{...row,progress:'99'},{...row,tokenAddress:'bad'},{...row,status:'UNKNOWN'}],600)).toEqual([]);
  });
  it('fetches independent lifecycle rankings and identifies partial failures',async()=>{
    const fetcher=vi.fn(async(url,init)=>{
      if(String(url).includes('dexscreener'))return Response.json({pairs:[]});
      const type=JSON.parse(String(init?.body)).type;
      if(type==='DEX')return new Response(null,{status:503});
      return Response.json({code:0,data:[row]});
    }) as typeof fetch;
    const market=await getFourMemeMarket(fetcher);expect(market).toMatchObject({chainId:56,source:'fourmeme',partial:true});expect(market.tokens).toHaveLength(1);
  });
});
