import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Clashr share metadata', () => {
  it('uses the owned BNB host, card and chain description', async () => {
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_CHAIN_ID', '56');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://clashr.example');
    const { appShare, SHARE_IMAGE } = await import('../lib/share');
    const metadata = appShare('Trenches', '/trenches');
    expect(SHARE_IMAGE.url).toBe('https://clashr.example/api/og/bnb');
    expect(metadata.description).toContain('BNB Chain');
    expect(JSON.stringify(metadata)).not.toMatch(/rushr|Robinhood/i);
  });
});
