import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestedRpcChain, rpcUpstream, verifyRpcChain } from '../lib/rpc-upstream';
import { BSC_PUBLIC_RPC } from '@rushr/core/chain/bsc-rpc';

afterEach(() => vi.unstubAllGlobals());

describe('chain-bound RPC', () => {
  it('preserves legacy URLs while requiring valid explicit BSC selection', () => {
    expect(requestedRpcChain('https://local/api/rpc')).toBe(4663);
    expect(requestedRpcChain('https://local/api/rpc?chainId=56')).toBe(56);
    expect(requestedRpcChain('https://local/api/rpc?chainId=97')).toBe(97);
    for (const value of ['', '1', '056', '56.0', '0x38', '56&chainId=4663']) {
      expect(() => requestedRpcChain(`https://local/api/rpc?chainId=${value}`)).toThrow();
    }
  });
  it('never falls back to a legacy secret for an unconfigured BSC network', () => {
    const env = { RPC_URL: 'https://legacy.invalid', BSC_RPC_URL: 'https://bsc.invalid' };
    expect(rpcUpstream(env, 4663)).toBe(env.RPC_URL);
    expect(rpcUpstream(env, 56)).toBe(env.BSC_RPC_URL);
    expect(rpcUpstream({RPC_URL:env.RPC_URL}, 56)).toBe(BSC_PUBLIC_RPC);
    expect(rpcUpstream({}, 56)).toBe(BSC_PUBLIC_RPC);
    expect(rpcUpstream(env, 97)).toBeUndefined();
  });
  it('rejects mismatched endpoints and retries failed verification', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ result: '0x1237' }))
      .mockResolvedValueOnce(Response.json({ result: '0x38' }));
    vi.stubGlobal('fetch', fetch);
    await expect(verifyRpcChain('https://wrong-network.invalid', 56)).rejects.toThrow();
    await expect(verifyRpcChain('https://wrong-network.invalid', 56)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent probes without trusting another chain or URL', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ result: '0x38' }));
    vi.stubGlobal('fetch', fetch);
    await Promise.all([verifyRpcChain('https://verified.invalid', 56), verifyRpcChain('https://verified.invalid', 56)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(verifyRpcChain('https://verified.invalid', 97)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    await verifyRpcChain('https://replacement.invalid', 56);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
