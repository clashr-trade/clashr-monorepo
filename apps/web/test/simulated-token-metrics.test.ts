import {it,expect} from 'vitest';
import {simulatedTokenMetrics} from '../lib/simulated-token-metrics';
import type {PublicBscToken} from '../lib/bsc-public-market';
const created=Date.parse('2026-11-27T10:00:00Z');
const token={address:'0x'+'ab'.repeat(20),created_at:new Date(created).toISOString(),market_cap_usd:3100} as PublicBscToken;
it('starts newly launched tokens at zero only in explicitly simulated metrics',()=>{
 expect(simulatedTokenMetrics(token,created+59000)).toMatchObject({metrics_simulated:true,holders:0,top10_pct:0,dev_pct:0,snipers_pct:0,insiders_pct:0,bundled_pct:0});
 expect(token).not.toHaveProperty('metrics_simulated');
});
it('generates stable minute snapshots with bounded values and age/cap-scaled holders',()=>{
 const first=simulatedTokenMetrics(token,created+60000)!;
 expect(simulatedTokenMetrics(token,created+119000)).toEqual(first);
 expect(simulatedTokenMetrics(token,created+120000)).not.toEqual(first);
 for(const field of ['top10_pct','dev_pct','snipers_pct','insiders_pct','bundled_pct'] as const){expect(first[field]).toBeGreaterThanOrEqual(0);expect(first[field]).toBeLessThanOrEqual(100);}
 expect(simulatedTokenMetrics({...token,market_cap_usd:1000000},created+60000)!.holders).toBeGreaterThan(first.holders);
 expect(simulatedTokenMetrics({...token,created_at:''},created)).toBeNull();
});
