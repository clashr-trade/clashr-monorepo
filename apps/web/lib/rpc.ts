'use client';

import { fallback, http, type Transport } from 'viem';
import { getNetwork, LEGACY_CHAIN_ID } from '@rushr/core/chain/networks';
import {PRODUCT_CHAIN_ID} from './product';

/**
 * Browser RPC transport: our Alchemy proxy first (app/api/rpc), then Robinhood Chain's public RPC if the proxy
 * errors, rate-limits or refuses a method (e.g. eth_getLogs). Explicit chain IDs select their own
 * endpoint and cache; omitted IDs preserve Robinhood. Same-origin, so it works on rushr.trade,
 * app.rushr.trade and local previews alike.
 */
const transports = new Map<string, Transport>();
export function rpcTransport(chainId: number = PRODUCT_CHAIN_ID): Transport {
  const network = getNetwork(chainId);
  const origin = typeof window === 'undefined' ? null : window.location.origin;
  const key = `${chainId}:${origin ?? 'server'}`;
  const cached = transports.get(key);
  if (cached) return cached;
  const proxy = origin ? `${origin}/api/rpc?chainId=${chainId}` : null;
  const pub = http(network.publicRpc, { batch: true });
  const transport = proxy ? fallback([http(proxy, { batch: { batchSize: 20 }, timeout: 10_000, retryCount: 0 }), pub]) : pub;
  transports.set(key, transport);
  return transport;
}
