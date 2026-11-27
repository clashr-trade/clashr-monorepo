import {it,expect} from 'vitest';
import {migratedDisplayQuotes,reserveDisplay} from '../src/product/flap-dex-pricing';
const token='0x'+'aa'.repeat(20),pool='0x'+'bb'.repeat(20);
it('uses only the matching BNB PancakeSwap pool and ignores a stale Flap pair',async()=>{
 const pair={chainId:'bsc',dexId:'pancakeswap',baseToken:{address:token},pairAddress:pool,priceUsd:'0.002',liquidity:{usd:20000},volume:{h24:1500}};
 const result=await migratedDisplayQuotes([{token,pool}],async()=>Response.json([
  {...pair,chainId:'ethereum',priceUsd:'99'}, {...pair,dexId:'flapsh',priceUsd:'99'},
  {...pair,pairAddress:'0x'+'cc'.repeat(20),priceUsd:'99'},pair,
 ]));
 expect(result.get(token)).toMatchObject({priceUsd:.002,liquidityUsd:20000,volume24hUsd:1500,pool,source:'dexscreener-indicative'});
});
it('keeps unavailable migrated prices unknown',async()=>{
 expect((await migratedDisplayQuotes([{token,pool}],async()=>new Response('',{status:429}))).size).toBe(0);
});
it('converts V2 reserve prices using both actual token decimals',()=>{
 expect(reserveDisplay(1000n*10n**18n,2n*10n**6n,18,6,1)).toEqual({priceUsd:.002,liquidityUsd:4});
 expect(reserveDisplay(0n,1n,18,6,1)).toBeNull();expect(reserveDisplay(1n,1n,18,6,NaN)).toBeNull();
});
