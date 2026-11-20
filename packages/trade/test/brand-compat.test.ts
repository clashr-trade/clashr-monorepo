import { describe, expect, it } from 'vitest';
import { resolveConfig, LEGACY_ROBINHOOD_TREASURY, RUSHR_TREASURY } from '../src/config';
import { buildSignerPolicy, defaultCaps } from '../src/policy';
import { assertOneClickAllowed } from '../src/signer';
import { clashrLegacyRouterAbi, buildClashrLegacyRouterSwap } from '../src/clashr-router';
import { rushrRouterAbi, buildRushrRouterSwap } from '@clashr/trade/rushr-router';

const router = '0x1111111111111111111111111111111111111111' as const;
const other = '0x2222222222222222222222222222222222222222' as const;

describe('Clashr SDK source rename compatibility', () => {
  it('keeps the old module subpath and exports bound to the same implementation', () => {
    expect(rushrRouterAbi).toBe(clashrLegacyRouterAbi);
    expect(buildRushrRouterSwap).toBe(buildClashrLegacyRouterSwap);
    expect(RUSHR_TREASURY).toBe(LEGACY_ROBINHOOD_TREASURY);
  });
  it('normalizes old config names without relaxing audit requirements', () => {
    const previous = resolveConfig({ rushrRouter: router, rushrRouterAudited: true });
    const current = resolveConfig({ clashrLegacyRouter: router, clashrLegacyRouterAudited: true });
    expect(previous).toEqual(current);
    expect(previous).toMatchObject({ clashrLegacyRouter: router, rushrRouter: router });
    expect(() => assertOneClickAllowed(previous)).not.toThrow();
    expect(() => assertOneClickAllowed(resolveConfig({ rushrRouter: router }))).toThrow(/audited/);
  });
  it('refuses contradictory aliases instead of choosing a signing target or audit flag silently', () => {
    expect(() => resolveConfig({ rushrRouter: router, clashrLegacyRouter: other })).toThrow(/Conflicting/);
    expect(() => resolveConfig({ rushrRouterAudited: true, clashrLegacyRouterAudited: false })).toThrow(/Conflicting/);
  });
  it('keeps existing Privy policy names, rules, chain and targets identical', () => {
    const base = { wallet: other, purpose: 'quick-trade', caps: defaultCaps(1000), dailyAggregationId: 'existing' };
    expect(buildSignerPolicy({ ...base, rushrRouter: router }))
      .toEqual(buildSignerPolicy({ ...base, clashrLegacyRouter: router }));
    expect(() => buildSignerPolicy({ ...base, rushrRouter: router, clashrLegacyRouter: other })).toThrow(/Conflicting/);
  });
});
