import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { ClashrLegacyClient, Rushr } from '../src/clashr.ts';

describe('Legacy client source rename', () => {
  it('accepts the original environment variables and prefers explicit legacy-chain Clashr settings', () => {
    expect(loadConfig({ RUSHR_MAX_TRADE_USD: '5', RUSHR_STATE_DIR: '/previous-state' }))
      .toMatchObject({ maxTradeUsd: 5, stateDir: '/previous-state' });
    expect(loadConfig({ RUSHR_MAX_TRADE_USD: '5', CLASHR_ROBINHOOD_MAX_TRADE_USD: '7' }).maxTradeUsd).toBe(7);
  });
  it('never imports the BNB Clashr private key or state directory into the legacy signer', () => {
    const config = loadConfig({ CLASHR_PRIVATE_KEY: 'bnb-key-must-not-be-used', CLASHR_STATE_DIR: '/bnb-state' });
    expect(config.privateKey).toBeUndefined();
    expect(config.stateDir).not.toBe('/bnb-state');
  });
  it('keeps the original class export as an alias', () => {
    expect(Rushr).toBe(ClashrLegacyClient);
  });
});
