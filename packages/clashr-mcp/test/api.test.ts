import { describe, expect, it } from 'vitest';
import { createApi } from '../src/api.ts';
import { loadConfig } from '../src/config.ts';

describe('Clashr chain header migration', () => {
  it.each([
    { 'x-clashr-chain-id': '56' },
    { 'x-rushr-chain-id': '56' },
    { 'x-clashr-chain-id': '56', 'x-rushr-chain-id': '56' },
  ] as Record<string, string>[])('accepts verified current or previous APIs: %j', async (headers) => {
    const api = createApi(loadConfig({}), () => undefined, async () => Response.json({ ok: true }, { headers }));
    expect(await api('/health')).toEqual({ ok: true });
  });
  it.each([
    {},
    { 'x-clashr-chain-id': '4663' },
    { 'x-clashr-chain-id': '4663', 'x-rushr-chain-id': '56' },
    { 'x-clashr-chain-id': '56', 'x-rushr-chain-id': '4663' },
  ] as Record<string, string>[])('refuses missing, foreign or conflicting chain identity: %j', async (headers) => {
    const api = createApi(loadConfig({}), () => undefined, async () => Response.json({}, { headers }));
    await expect(api('/health')).rejects.toMatchObject({ code: 'wrong_api_chain' });
  });
});
