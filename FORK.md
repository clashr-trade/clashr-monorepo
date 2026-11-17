# Rushr local fork

This checkout starts from https://github.com/rushr-dev/platform at
`d0b9f4ca8fb309fdfc88bda086f25f733bf5093b`. The upstream source, artwork,
license, and notices are retained. It is a local clone with preview changes;
no fork has been created in your GitHub account.

## Run the live-data preview

From this directory in PowerShell:

```powershell
./scripts/preview.ps1
```

Open http://127.0.0.1:3000 for the landing page or
http://127.0.0.1:3000/trenches for the terminal. Stop the server with Ctrl+C.
Use `./scripts/preview.ps1 -Port 3001` if port 3000 is occupied.

The launcher uses the workspace-local Node 22 and pnpm installations if present,
otherwise your installed pnpm. The project requires Node >=22.23.4 and pins
22.23.5 in `.nvmrc`. With nvm-windows, run `nvm install 22.23.5` then
`nvm use 22.23.5`. On another machine, install Node 22.23.5 and pnpm
11.10.0, run `pnpm install --frozen-lockfile`, then use the launcher. On macOS or
Linux, copy `apps/web/.env.preview.example` to `apps/web/.env.local` and run
`pnpm --filter @rushr/web dev:preview`.

The preview uses Turbopack. Privy's main entry imports Solana clients through
x402 and wallet funding even for an Ethereum-only application. Upstream's
Solana-to-empty-module aliases removed required named exports (`AccountRole`),
while its lockfile paired Kit 8 program clients with Kit 5.5.1. The fork removes
those Solana aliases and pins compatible Kit 5.5.1, sysvars 5.5.1, system 0.10.0,
token 0.9.0 and memo 0.10.0 packages. Run
`pnpm --filter @rushr/web test:dependencies` to check that dependency graph.
The same regression tests run with the root workspace `pnpm test` command.
`.gitattributes` keeps text files on LF to avoid Windows checkout differences
in generated documentation and its fixture tests.

## What the preview provides

- Original landing page, illustrations, typography, responsive layout, and navigation.
- Original trenches UI, filters and sorting, token search and token detail pages.
- Market data, charts, holders, signals, public profiles, feed, agents, and
  leaderboard read from Rushr's public API. Availability and freshness depend
  on that upstream service; no private data or database is copied.
- Original backend and trade implementation in source, available for an independent
  deployment after configuring your own infrastructure.

The local environment leaves Privy unconfigured and swaps disabled. No sign-in,
social writes, or wallet transactions are enabled. A terminal notice identifies
the independent preview. Feedback remains a local draft and cannot be submitted
to the upstream service while preview mode is enabled.

Marketing copy, legal text, community links, treasury addresses, and agent
instructions still describe upstream Rushr. Review and replace those before
operating this as your own product. The original artwork is bundled under
`apps/web/public/art`; token icons are fetched through the existing image proxy.

## Independent operation

Follow the upstream README and docs before enabling account or trading features:

1. Provision your own Postgres database and apply `packages/db` migrations.
2. Configure the indexer's RPC and database, Cloudflare Durable Objects, queues,
   R2 bucket, scheduled jobs, and member feature flags.
3. Create your own Privy application, register its allowed origins, and configure
   its app ID and server secret. Do not reuse the upstream application's identity.
4. Point `NEXT_PUBLIC_API_URL` at your indexer. Configure web origins, SIWE domain,
   middleware host routing, canonical/share URLs, and the RPC proxy origin list
   for your own domains; the upstream defaults contain `rushr.trade`.
5. Review chain, router, treasury, referral, fee, and transaction confirmation
   settings. Verify trade simulation and signing against your intended environment
   before setting `NEXT_PUBLIC_SWAP_ENABLED=1`.
6. Replace production resource identifiers and domain routes in both Wrangler
   configurations. They currently refer to upstream resources. Configure your own
   cache and secrets. Do not deploy those defaults unchanged.
7. Disable preview mode only after the independent services are configured and
   verified. Preserve the AGPL-3.0 license and provide corresponding source as
   required by its terms when operating a modified network service.

No infrastructure has been provisioned and no production deployment has been made.
Keep secrets in ignored environment files or the deployment secret store.

## Checks

Use `pnpm typecheck` and `pnpm test` with Node and pnpm on PATH.
Database/RPC integration tests require their documented configuration.
The MCP tests contain Unix `0600` file-mode assertions that fail on native
Windows; use a Unix environment to validate those permissions. This is separate
from the browser preview.

Validated locally on 2026-11-17:

- Workspace TypeScript checks passed.
- Core: 53 tests passed. Agents: 20 passed, 3 skipped. Trade: 103 passed,
  10 skipped. Indexer: 38 passed, 87 skipped. MCP: 123 passed, 2 failed on the
  Unix file-mode assertions described above. The full test command remains red.
- Landing, trenches, feed, agents, and leaderboard returned HTTP 200.
- Chrome verified the landing artwork, live trenches, keyword filtering,
  global token search, token chart, holders tab, and populated public feed.
- Git whitespace checks passed. Production build/deployment and authenticated
  account, social-write, and transaction flows have not been verified.
- After fixing Solana dependency resolution: Turbopack compiled `/trenches` and
  returned HTTP 200, the original `localhost:3000/trenches` browser page rendered
  live tokens, web TypeScript checks passed, and all 3 wallet dependency regression
  tests passed.
- Avatar hydration now uses fixed SVG gradient coordinates and an integer SVG
  rotation, avoiding different server/browser trigonometric rounding. All 5 web
  tests pass, including runtime-rounding regression coverage across every
  address-derived angle. Web TypeScript checks pass. The live server rendered
  60 deterministic avatar gradients, and the populated browser terminal showed
  no hydration issue indicator after a fresh page load.
