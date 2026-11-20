import { describe, expect, it } from 'vitest';
import { storageKey, TRADE_EVENT, BNB_SESSION_COOKIE } from '../lib/brand-compat';

describe('Clashr source names preserve existing browser data and tabs', () => {
  it('reads the existing activity, settings and session namespaces', () => {
    const saved = new Map([
      ['rushr.settings.v2', '{"quickBuyUsd":50}'],
      ['rushr.bsc.activity.0x123', '[{"hash":"existing"}]'],
      ['rushr.session.bnb.v1', 'existing-session-hint'],
    ]);
    expect(saved.get(storageKey('settings.v2'))).toContain('50');
    expect(saved.get(storageKey('bsc.activity.0x123'))).toContain('existing');
    expect(saved.get(storageKey('session.bnb.v1'))).toBe('existing-session-hint');
    expect(BNB_SESSION_COOKIE).toBe('rushr_bnb_session');
  });
  it('delivers renamed source events to listeners from an existing tab', () => {
    const target = new EventTarget();
    let refreshes = 0;
    target.addEventListener('rushr:trade', () => refreshes++);
    target.dispatchEvent(new Event(TRADE_EVENT));
    expect(refreshes).toBe(1);
  });
});
