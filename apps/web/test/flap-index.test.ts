import {describe,it,expect} from 'vitest';
import {normalizeIndexedFlap} from '../lib/flap-market';
const row={chainId:56,coin:{address:'0x1111111111111111111111111111111111111111',name:'Token',symbol:'TOK'},createdAt:'2026-11-19T00:00:00Z',decimals:18,progress:75,listed:false,quoteToken:'0x0000000000000000000000000000000000000000',tax:{buyTaxBps:'100',sellTaxBps:'200'},priceNative:0.01};
describe('Flap finalized feed',()=>{
 it('allows unknown launch dates only for verified almost/migrated states',()=>{
  expect(normalizeIndexedFlap([{...row,createdAt:null}])[0]).toMatchObject({market_column:'almost',created_at:''});
  expect(normalizeIndexedFlap([{...row,createdAt:null,progress:10}])).toEqual([]);
 });
 it('maps progress and native price without inventing USD, holders or safety',()=>{
  expect(normalizeIndexedFlap([row])[0]).toMatchObject({launchpad:'flap',market_column:'almost',bonding_progress:.75,price_native:.01,price_usd:null,holders_known:false,risk:null,buy_tax_pct:1,sell_tax_pct:2});
 });
 it('rejects wrong chains/unknown decimals and separates graduation',()=>{
  expect(normalizeIndexedFlap([{...row,chainId:4663},{...row,decimals:null}])).toEqual([]);
  expect(normalizeIndexedFlap([{...row,listed:true}])[0]?.market_column).toBe('migrated');
 });
 it('preserves measured safety zeros and unknown funding fields',()=>{
  expect(normalizeIndexedFlap([{...row,safety:{top10Pct:3,devPct:0,sniperCount:0,snipersPct:0,insidersPct:null,freshWalletsPct:null}}])[0]).toMatchObject({top10_pct:3,dev_pct:0,snipers_pct:0,insiders_pct:null,fresh_pct:null,signals:{sniperCount:0}});
 });
 it('derives migrated market caps from DEX price and on-chain supply, preserving liquidity and volume',()=>{
  expect(normalizeIndexedFlap([{...row,listed:true,priceUsd:.002,totalSupply:'1000000000000000000000',liquidityUsd:20000,volume24hUsd:1500,priceSource:'dexscreener-indicative'}])[0]).toMatchObject({market_column:'migrated',market_cap_usd:2,liquidity_usd:20000,volume_24h_usd:1500,price_source:'dexscreener-indicative'});
 });
});
