# Dependency compatibility patches

## ox 0.14.67 native Node worker import

Privy/x402 imports viem's chain catalog, which references ox Tempo utilities even when Clashr trades BNB only. ox dynamically imports node:worker_threads through a computed identifier. Webpack tries to build a dependency context and emits a critical-dependency warning.

The version-pinned pnpm patch marks only that import with webpackIgnore, leaving native dynamic import resolution to the runtime. It retains the original worker module name, worker creation, browser worker implementation and all wallet/chain exports. No global warning filters, SDK stubs or disabled checks are used. The TypeScript source and published ESM file carry the same change; CommonJS behavior is unchanged.

The patch applies automatically through pnpm-workspace.yaml and pnpm-lock.yaml on frozen installs. Remove it when an upstream ox release handles computed native imports compatibly, then rerun the production build and wallet dependency tests.
