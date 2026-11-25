import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
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

/** Dev server reached by address instead of localhost (see lib/dev-origin.ts). */
const devHost = (() => {
  try {
    return process.env.DEV_ALLOWED_ORIGIN ? new URL(process.env.DEV_ALLOWED_ORIGIN).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  ...(process.env.CLASHR_WEB_RUNTIME === 'node' ? {
    experimental: {
      cpus: 1,
      webpackBuildWorker: true,
      webpackMemoryOptimizations: true,
      parallelServerCompiles: false,
      parallelServerBuildTraces: false,
    },
  } : {}),
  ...(devHost ? { allowedDevOrigins: [devHost] } : {}),
  transpilePackages: ['@clashr/agents', '@clashr/core', '@clashr/trade'],
  images: { unoptimized: true },
  async redirects() {
    return [{ source: '/og-rushr.jpg', destination: '/og-clashr-legacy.jpg', permanent: true }];
  },
  turbopack: {
    // Keep monorepo dependency resolution stable after checkout moves or lockfile removal.
    root: fileURLToPath(new URL('../../', import.meta.url)),
    resolveAlias: Object.fromEntries(UNUSED_PRIVY_PEERS.map((p) => [p, './lib/empty-module.ts'])),
  },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(UNUSED_PRIVY_PEERS.map((p) => [p, false])) };
    return config;
  },
};

export default nextConfig;

// Native VPS builds must not boot the Cloudflare dev proxy. Worker workflows
// retain their existing bindings and build behavior.
if (process.env.CLASHR_WEB_RUNTIME !== 'node' && process.env.VERCEL !== '1') initOpenNextCloudflareForDev();
