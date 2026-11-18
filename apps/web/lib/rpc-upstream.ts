import { getNetwork, LEGACY_CHAIN_ID, type SupportedChainId } from '@rushr/core/chain/networks';
import { BSC_PUBLIC_RPC } from '@rushr/core/chain/bsc-rpc';

export interface RpcEnvironment {
  RPC_URL?: string;
  BSC_RPC_URL?: string;
  BSC_TESTNET_RPC_URL?: string;
}

export function requestedRpcChain(url: string): SupportedChainId {
  const values = new URL(url).searchParams.getAll('chainId');
  if (!values.length) return LEGACY_CHAIN_ID;
  if (values.length !== 1 || !/^(4663|56|97)$/.test(values[0]!)) throw new Error('Unsupported chain');
  return getNetwork(Number(values[0])).id;
}

export function rpcUpstream(env: RpcEnvironment, chainId: SupportedChainId): string | undefined {
  return chainId === 56 ? env.BSC_RPC_URL || BSC_PUBLIC_RPC : chainId === 97 ? env.BSC_TESTNET_RPC_URL : env.RPC_URL;
}

// At most one entry per supported network. Deduplicate concurrent probes and expire
// successful verification so a changed provider cannot stay trusted indefinitely.
const verified = new Map<number, { url: string; expires: number; check: Promise<void> }>();
export function verifyRpcChain(url: string, chainId: SupportedChainId): Promise<void> {
  const cached = verified.get(chainId);
  if (cached?.url === url && cached.expires > Date.now()) return cached.check;
  const check = (async () => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (!response.ok || body.error || typeof body.result !== 'string' || !/^0x[0-9a-f]+$/i.test(body.result) || BigInt(body.result) !== BigInt(chainId)) {
      throw new Error('RPC chain verification failed');
    }
  })();
  const entry = { url, expires: Date.now() + 60_000, check };
  verified.set(chainId, entry);
  void check.catch(() => { if (verified.get(chainId) === entry) verified.delete(chainId); });
  return check;
}
