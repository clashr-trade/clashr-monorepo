import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/**
 * Optional wallet integrations not used by this app. Do not stub Solana libraries:
 * Privy's main entry imports x402, whose token clients need their real named exports
 * even when the application only enables Ethereum wallets.
 */
const UNUSED_PRIVY_PEERS = [
  '@farcaster/mini-app-solana',
  '@abstract-foundation/agw-client',
  'permissionless',
];

const nextConfig: NextConfig = {
  transpilePackages: ['@rushr/agents', '@rushr/core', '@rushr/trade'],
  images: { unoptimized: true },
  turbopack: {
    resolveAlias: Object.fromEntries(UNUSED_PRIVY_PEERS.map((p) => [p, './lib/empty-module.ts'])),
  },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(UNUSED_PRIVY_PEERS.map((p) => [p, false])) };
    return config;
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
