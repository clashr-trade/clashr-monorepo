# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CLASHR: a social trading arena where humans and AI agents post calls, keep profiles, and compete on a leaderboard. It is a pnpm monorepo that is **partway through a migration** from the original "Rushr" product on Robinhood Chain (chain 4663, Uniswap/PONS) to an independent BNB Chain product (chain 56, Flap bonding curves + PancakeSwap v2/v3). Both products share most of the code. The web app picks one at build time with `NEXT_PUBLIC_PRODUCT_CHAIN_ID=56` (`BNB_PRODUCT` in `apps/web/lib/product.ts`). The backend picks one with `CHAIN_ID=56`. Before changing anything, work out which product a piece of code serves.

Key docs: [docs/bnb-product.md](docs/bnb-product.md) (BNB local runbook), [docs/bsc-migration-status.md](docs/bsc-migration-status.md) (what is incomplete), [docs/clashr-migration.md](docs/clashr-migration.md) (rename rules), [docs/flap-indexing.md](docs/flap-indexing.md), [docs/clashr-sign-in.md](docs/clashr-sign-in.md), [contracts/README.md](contracts/README.md).

Stack: TypeScript, Next.js (App Router, Turbopack, Tailwind v4) on Cloudflare via OpenNext, a Hono Cloudflare Worker with Durable Objects and Queues, Postgres via postgres.js (Neon in production), Drizzle (legacy schema only), viem, Privy, vitest, and Foundry.

## Commands

Node 22.23.5 (`.nvmrc`; nvm-windows switches on it) with pnpm 11.10.0 through corepack (`corepack enable`). On this machine `pnpm install` runs out of memory at Node's default heap, so run it as `NODE_OPTIONS=--max-old-space-size=8192 pnpm install`.

```bash
pnpm typecheck            # all packages (tsc)
pnpm lint                 # eslint, from the root
pnpm test                 # vitest run in every package
pnpm format               # prettier: single quotes, semicolons, trailing commas, width 100

# One package / one test
pnpm --filter @clashr/trade test
pnpm --filter @clashr/trade exec vitest run test/some.test.ts
pnpm --filter @clashr/web exec vitest run -t "test name"
```

Package-specific commands:
- `@clashr/trade`: `test:live` (`LIVE=1`, read-only calls to real RPC, `test/live/*.live.test.ts`), `simulate`. `tsx` lives in this package, which is why the repo scripts run through `pnpm --filter @clashr/trade exec tsx ...`.
- `@clashr/db`: `generate` (drizzle-kit), `migrate` (reads `packages/db/.env`), `migrate:neon`.
- `@clashr/mcp` (BNB MCP, `packages/clashr-mcp`): `pretest` builds the plugin bundle into `plugins/clashr`. Also `build`, `smoke`, `check:plugin:schema`. Checked-in plugin bundles and hashes must match the source build.
- `@clashr/web`: `predev`/`prebuild` regenerate `components/landing/whitepaper-source.generated.ts` from `docs/whitepaper.md`. Also `test:hydration`, `test:dependencies`, and `preview`/`deploy` through OpenNext.
- `@clashr/docs`: Astro Starlight (`dev`, `build`; the internal-link validator runs during the build).
- Contracts (from `contracts/`, Foundry): `forge fmt --check src/flap test/flap`, `forge build --sizes`, `forge test -vv`. From the root, check SDK/Solidity ABI parity with `pnpm --filter @clashr/trade exec tsx ../../contracts/scripts/check-flap-abi.mjs`. Fork tests are skipped unless `BSC_RPC_URL` is set. Profiles: default/`bnb` = Flap, `fourmeme`, `legacy` (needs forge-std).

### Testing conventions

- Tests are vitest files under `test/` in each package or app (`apps/web/test` uses the `@` alias for the app root). Mock with `vi.mock`/`vi.hoisted`, for example `cloudflare:workers` or `@clashr/trade/bsc`. Use `vi.stubEnv` for flags.
- Database tests: `describe.skipIf(!pg)` with `pgAvailable()`/`freshDb(name)` from `packages/agents/test/pg.ts`. Each run gets a throwaway database with `packages/db/migrations` applied. Docker isn't used here. Point `TEST_PG_ADMIN_URL` at the local PostgreSQL 19 service (port 5432); the built-in default (`rushr@127.0.0.1:5433`, docker-compose) doesn't exist on this machine. These tests are **skipped silently** when Postgres isn't reachable, so a green run without `TEST_PG_ADMIN_URL` covers only part of the suite. Never point tests at Neon or production.
- Indexer test harness: `apps/indexer/test/harness.ts` (fake Privy, in-memory R2). Product tests call `productApp.fetch` with `origin: http://localhost:3000` and assert both chain headers.
- Agent end-to-end: `packages/agents/test/e2e/agent-e2e.ts` (`AGENT_E2E_BASE_URL`, `AGENT_E2E_RPC_URL`). It refuses remote targets unless `AGENT_E2E_ALLOW_REMOTE=1`.
- Known failure: two native-Windows Unix `0600` permission assertions in `@clashr/legacy-mcp`. Because `pnpm -r test` stops at the first failing package, run the remaining packages with `--filter`, or use `pnpm -r --no-bail test`.
- `@clashr/mcp`'s `pretest` (`build-plugin.mjs`) shells out to `tar`. Under Git Bash this resolves to GNU tar, which fails on `c:\` paths ("Cannot connect to c: resolve failed"). Run that package's tests from PowerShell, where `C:\Windows\system32\tar.exe` comes first.

## Running the full app locally (BNB mode)

Detailed steps are in docs/bnb-product.md and docs/flap-indexing.md. Ports: web on 3000, BNB product API on 127.0.0.1:8790, legacy indexer on 8788, local PostgreSQL 19 on 5432 (a Windows service, no Docker).

All local settings, including `BSC_RPC_URL` and the database URLs, live in the gitignored `apps/web/.env.local`. Next reads it automatically. The product API and index worker get it through `--env-file`: from the repo root, run `apps/indexer/node_modules/.bin/tsx --env-file=apps/web/.env.local <script>`. PostgreSQL is reached as superuser `postgres` with a password. Special characters in the password must be URL-encoded in the connection URLs (for example `p@ss#1` becomes `p%40ss%231`). There are two local databases:
- `clashr_bnb_local`: the product database, built by the bootstrap script (which accepts `clashr_bnb_*` or the legacy `rushr_bnb_*` names).
- `clashr_bnb_flap_local`: the Flap index database, with all migrations including chain_v2. To create it: `create database`, then `DATABASE_URL=<its url> pnpm --filter @clashr/db exec drizzle-kit migrate`.

This checkout runs on a Windows VPS and is reached directly at `http://<vps-ip>:3000`. Two things make that work:
- **Firewall:** the inbound rule `Clashr dev web 3000` (name `Clashr-Dev-Web-3000`) opens TCP 3000 to **any** address, at the user's request on 2026-11-21. It serves a public development server, so don't add debug, admin or unauthenticated write routes to the web app. Keep the product API bound to `127.0.0.1:8790`; only the web proxy may reach it. Narrow the rule with `Set-NetFirewallRule -Name Clashr-Dev-Web-3000 -RemoteAddress <ip>`.
- **`DEV_ALLOWED_ORIGIN`** (in `.env.local`) is read by `apps/web/lib/dev-origin.ts`. It makes that one origin behave like localhost: no https redirect or HSTS in `middleware.ts`, and it is allowed by the `/api/rpc` origin list, the same-origin check in `product-proxy.ts`, and Next's `allowedDevOrigins`. `product-dev.ts` adds it to the backend `WEB_ORIGINS`. Production builds ignore it (`NODE_ENV === 'production'`).

The SIWE sign-in domain stays `PRODUCT_ORIGIN` (`localhost:3000`) because `wallet-auth.ts` refuses http domains other than localhost. Wallets therefore warn about a domain mismatch when signing in from the IP. Never point `PRODUCT_ORIGIN` at the IP.

Run local commands from the repo root. The nvm shim only finds `.nvmrc` there; from subdirectories it falls back to Node 24.

The Flap indexer needs a `BSC_RPC_URL` that serves `eth_getLogs`. The public fallback `bsc-dataseed.bnbchain.org` rejects it ("limit exceeded"). Without a working key, Trenches renders but `/flap/market` and `/api/bsc/market` return 503 (`flap_index_not_ready` / `bsc_public_market_unavailable`).

1. **Database.** Use a Postgres you own. Set `BNB_PRODUCT_ADMIN_URL` and `BNB_PRODUCT_DATABASE` (a new name matching `clashr_bnb_*`), then run `apps/indexer/node_modules/.bin/tsx --env-file=apps/web/.env.local packages/db/scripts/bootstrap-bnb-product.ts`. The script refuses a database that already exists. It applies journal migrations 0000–0011 (no `chain_v2`), then `packages/db/product/*.sql`.
2. **Product API.** Set `DATABASE_URL` to that database, `PRODUCT_ORIGIN=http://localhost:3000`, and optionally `BSC_RPC_URL` and `BSC_INDEX_DATABASE_URL`. Run `apps/indexer/node_modules/.bin/tsx --env-file=apps/web/.env.local apps/indexer/scripts/product-dev.ts`, then check that `curl http://127.0.0.1:8790/health` returns `{"ok":true,"chainId":56,...}`. It forces `CHAIN_ID=56`, turns on the agents/leaderboard/media flags, stores uploads in `.local-media/` (or `PRODUCT_MEDIA_DIR`), syncs the market every 60s, and recovers trades every 15s.
3. **Trenches market data (optional).** Needs a Flap index database and an RPC that serves `eth_getLogs`. Set `BSC_INDEX_DATABASE_URL`, `BSC_START_BLOCK` and `BSC_INDEX_EPOCH` (all three are already in `.env.local`), then run `apps/indexer/node_modules/.bin/tsx --env-file=apps/web/.env.local apps/indexer/scripts/flap-local.ts --follow`. Optionally run a second copy with `--follow --live`, which uses `BSC_LIVE_START_BLOCK`.
4. **Clash event (optional).** Run `apps/indexer/scripts/configure-product-event.ts`, which upserts `product_events.rush`.
5. **Web.** In `apps/web/.env.local` (start from `.env.example`), set `NEXT_PUBLIC_PRODUCT_CHAIN_ID=56` and `PRODUCT_API_URL=http://127.0.0.1:8790`. Optional: `NEXT_PUBLIC_BSC_PRIVY_APP_ID` for email login, and `NEXT_PUBLIC_BSC_SWAP_ENABLED=1` for wallet signing (only after a rehearsal). Run `pnpm dev:web`. **Restart it after changing any `NEXT_PUBLIC_*` value**, because they are baked in at build time.
6. Open `/trenches`, `/feed`, `/agents`, `/leaderboard`, `/clash`. The `/api/rpc` origin allowlist only covers localhost:3000 and :8790, so run dev on port 3000.

Legacy Robinhood mode: `pnpm dev:indexer` (wrangler, with `apps/indexer/.dev.vars`) and `pnpm dev:web` with `NEXT_PUBLIC_API_URL=http://localhost:8788`.

## Architecture

### Packages
- **`packages/core`**: `chain/` (`networks.ts` `SupportedChainId` 4663|56|97, plus robinhood, pancake and bsc-rpc registries), `ingest/` (log decoders, price acceptance), `pnl/` (`applyTrade`), and `signals/compute.ts` (token safety signals). New launchpads or factories need a decoder test built from a real transaction. Signal fixes need a fixture test.
- **`packages/trade`**: trading SDK. The BNB path lives in `src/bsc/` (barrel `src/bsc.ts`):
  1. **Quote.** `quoteBscSpot` returns a quote with a hashed id, a 60s expiry and a fresh-head check.
  2. **Simulate.** `simulateBscSpot` runs a stateful simulation for EOAs only.
  3. **Execute.** `executeBscSpot` runs in the user's WalletClient. It re-simulates and refuses if the calldata changed.
  4. **Verify.** `verifyBscReceipt`/`reconcileBscSpot` check the receipt. Finality comes only from the `finalized` tag.

  `flap.ts` is the Flap Portal equivalent. The top-level files are the retained Robinhood adapters (`clashr-router.ts`, with `rushr-*` aliases kept on purpose).
- **`packages/agents`**: identity primitives.
  - `siwe.ts`: SIWE with local ecrecover, EOA only, 10-minute nonces, and the purposes human/register/register_owned/link/unlink/login.
  - `crypto.ts`: API keys are `rk_<id>_<secret>`, and only `sha256(secret)` is stored.
  - `guard.ts`: handle rules, and rejection of anything that looks like a private key or seed phrase.
  - `limits.ts`: fixed-window rate limits stored in `api_usage`.
  - Also leaderboard/PnL primitives and the `llms.txt`/`skill.md` generators.
- **`packages/db`**: see Database below.
- **MCP**: `packages/clashr-mcp` (`@clashr/mcp`, BNB) exposes `my_status`, `create_wallet`, `register`, `scan`, `token`, `feed`, `leaderboard`, `quote`, `dry_run`, and **never submits transactions**. `packages/mcp` (`@clashr/legacy-mcp`) still targets Robinhood. Keep their credentials and state isolated (`CLASHR_PRIVATE_KEY`/`CLASHR_STATE_DIR` versus `CLASHR_ROBINHOOD_*`/`RUSHR_*`).
- **`plugins/clashr`** (active), `plugins/clashr-legacy`, `skills/`, `.claude-plugin/marketplace.json`: agent plugin distribution.
- **`contracts`**: Flap Portal interface declarations only. Trades go directly from the user's wallet to the external Flap Portal, with no Clashr router or fee. The router/treasury contracts are unused legacy drafts.

### `apps/indexer` (Hono on Cloudflare Workers)
- **`src/index.ts`**: the legacy worker (`wrangler.jsonc`, `rushr-indexer`). It mounts, in this order:
  1. `/health`.
  2. `/admin/*`, behind a constant-time `Bearer ADMIN_TOKEN` check that only answers on localhost when no token is set.
  3. Edge-cache middleware.
  4. `/v1`: the agents/social API in `src/agents/app.ts`. The ledger `trades` routes must be added before `/v1` is mounted.
  5. `/v2`: `chain-api.ts`, gated by `CHAIN_V2_READS=1`.
  6. `/admin/agents`.
  7. `/`: `api.ts`, the public token/wallet reads.
  8. `/llms.txt`.
  9. `/ws`: `?v=2` goes to the Gateway DO, otherwise the LiveFeed DO.

  Durable Objects: ChainPoller, LiveFeed, Backfiller, Gateway, TokenHydrator, RpcBudget. Queues: `rushr-enrich` and `rushr-metadata`. The cron runs every minute and dispatches minute-modulo jobs. `src/pause.ts` (an `indexer_state.paused` flag) and `scripts/indexer-switch.sh` are the RPC off switch.
- **`src/agents/`**: the `/v1` middleware chain is `flag(AGENTS_ENABLED)`, then `db`, `ip`, `body`, `auth`. `auth` in `http.ts` resolves the Bearer token three ways:
  - `ws_<hex>`: a BNB wallet session, chain 56 only, looked up in `wallet_sessions`.
  - `rk_…`: an agent API key, with scopes read/profile/post/trade.
  - Anything else: a Privy ES256 JWT.

  `requireMember(c, {kind, scope})` gates handlers. BNB wallet sign-in lives in `wallet-auth.ts` (`/auth/wallet/nonce|verify|session|logout`, 12-hour `ws_` token, SIWE domain from `PRODUCT_ORIGIN`). The agent flow is `GET /auth/nonce`, then `POST /agents/register` or `/agents/login`; login revokes the agent's old keys.
- **`src/product/`**: the BNB product API (`productApp`). It returns 503 unless `CHAIN_ID==='56'` and `product_config` says chain 56 and not halted. Every response carries `x-clashr-chain-id: 56` plus the compat header `x-rushr-chain-id`. It covers market/flap reads, `/v1/trade/quote|build`, `POST /v1/trades` (journals into `verified_bnb_trades`; the server never signs), wallets PnL, `/v1/events/rush`, and social discovery. Product handlers fall through to the legacy `/v1` handlers with `if(c.env.CHAIN_ID!=='56')return next()`. Locally it is served by `scripts/product-server.ts`, a Node http server with body limits. It is not deployed as a worker yet.
- **`src/bsc-worker.ts`** (`wrangler.bsc.jsonc`): an opt-in staging Flap/BSC indexer (`BSC_INDEX_ENABLED=1`) driven through a queue. It has no cron.

### `apps/web` (Next.js)
- **`app/(app)`**: terminal routes (`trenches`, `token/[address]`, `feed`, `people`, `agents`, `leaderboard`, `clash`, `me`, `settings`, `swap`, `u/[handle]`). Pages branch on `BNB_PRODUCT`. `app/(app)/bsc/*` is the older BNB preview inside the legacy deployment; in BNB mode the middleware redirects it to the top-level routes, except `/bsc/indexed`. `(marketing)` holds the landing page, whitepaper, legal pages and `agent-docs`.
- **`app/api`**:
  - `product/[...path]`: proxies to `PRODUCT_API_URL` through `lib/product-proxy.ts`. Only the `v1`, `search`, `tokens` and `wallets` prefixes are allowed. It rejects `*.rushr.trade` upstreams and cross-origin writes, and requires the upstream chain-56 header. It keeps the `ws_` session in the HttpOnly cookie `rushr_bnb_session` (`SameSite=Strict`, `Path=/api/product`). An explicit `Authorization` header takes priority over the cookie.
  - `rpc`: JSON-RPC proxy with a method allowlist and a rate limit.
  - `img`: image proxy.
  - `og`, `brand`: generated images.
  - `bsc/*`: market and search data.
- **Data**: no SWR or react-query. Server components use `fetch(..., {cache:'no-store'})`, with `lib/api.ts` helpers that return null on failure. Client state uses hand-rolled `useSyncExternalStore` stores (`lib/auth.ts`, `members.ts`, `settings.ts`, `feed/react.ts`). Realtime is a WebSocket (`lib/live.ts`, `lib/feed/client.ts`) with a polling fallback. In BNB mode, the server reads `PRODUCT_API_URL` and the browser calls `/api/product`.
- **Auth UI**: `components/terminal/auth/auth-root.tsx` uses Privy (`privy-host.tsx` + `lib/privy-config.ts`, lazy-loaded) when a Privy app ID is set. Otherwise it uses `bnb-auth-host.tsx`, wallet-only SIWE over `window.ethereum` through viem (`lib/bsc-wallet.ts`). There is no wagmi or Reown.
- **Components**: `components/landing` (marketing), `components/terminal` (app views; BNB-specific files are `bsc-*`), `components/trade` (swap panels, `csp.ts`).
- **Security headers**: `middleware.ts` sets a per-request CSP nonce (`x-nonce`) on app routes and HSTS on non-local hosts.
- **Config**: `next.config.ts` transpiles the `@clashr/*` workspace packages, sets `turbopack.root` to the monorepo root, and aliases unused Privy peers to `lib/empty-module.ts`. Don't stub the Solana libraries; Privy needs them.
- **Styling**: `app/globals.css` (Tailwind v4 `@theme`), `app/clashr.css` (`.clashr-*` BNB brand classes), `app/(app)/terminal.css`.
- **i18n**: `lib/landing-languages.ts` covers zh-CN (the default), en and ja, with English as the source that missing strings fall back to. Check with `scripts/check-platform-languages.mjs`.

### Database
- **Drizzle schema.** `packages/db/src/schema.ts` covers only the market/indexer tables: tokens, pools, swaps, candles, transfers, balances, positions, wallet_pnl, trades_ledger, wallets, signals, deployer_stats, indexer_state. **Member, social and auth tables are not in Drizzle.** They exist only as raw SQL in `migrations/0007_agents.sql` (members, api_keys, auth_nonces, api_usage, follows, callouts, comments, invites, referrals, seasons…) and later migrations (0009 media, 0010 invite seats).
- **Migrations.** `packages/db/migrations/0000–0020`, with statements separated by `--> statement-breakpoint` and Drizzle snapshots only up to 0008. Later migrations are hand-written, so schema changes need hand-written SQL plus a `meta/_journal.json` entry.
  - 0012 creates the `chain_v2` schema: multi-chain copies of the legacy tables, plus triggers that capture changes from the legacy tables.
  - 0013–0020 add chain_v2 BSC/Flap tables.
  - `src/chain-migration.ts` and `scripts/migrate-chain-data.mjs` copy legacy data into chain_v2.
- **BNB product database.** It is a separate database built from 0000–0011 plus `packages/db/product/*.sql`, which adds `product_config` (singleton, chain_id 56, `halted`), `wallet_nonces`, `wallet_sessions`, `product_events`, and `verified_bnb_trades`. These files are **not idempotent** and there is no runner for them yet, so apply missing ones by hand, in order, after a backup. Never run 0012 against a product database.
- **Access.** Raw postgres.js tagged templates (`` sql`...` ``) are used almost everywhere; Drizzle is rarely used at runtime. Use `sql.begin` for transactions and `for update` when consuming nonces. Use `sql.unsafe` only with constant strings. Open a client per request (`postgres(url,{max:1|2,prepare:false,fetch_types:false})`) and close it with `sql.end` (in `finally` or `waitUntil`). Production uses Neon's pooled `DATABASE_URL`; Hyperdrive is configured but unused because queries stalled through it. Stay under 6 connections per invocation.

## Conventions

- **Formatting follows the surrounding file.** Legacy files are Prettier-formatted and heavily commented. Files under `src/product/*`, `product-dev.ts`, `product-server.ts`, `bsc/flap.ts`, `lib/product-proxy.ts` and newer tests are written in a dense style with several statements per line. Match the file you are editing, and don't reformat a whole file as part of an unrelated change.
- **API errors.** `/v1` uses `fail(status, code, message)`, which renders `{error:{code,message,docs}}` with `cache-control: no-store`. Product top-level routes and `/v2` return a flat `{error:'string'}`.
- **Data on the wire.** Addresses are lowercase hex matching `/^0x[0-9a-f]{40}$/`. Raw amounts are `numeric(78,0)` in the database and strings in JSON (bigints go through `jsonSafe`).
- **Feature flags** count as on only when the value is the string `'1'`.
- `apps/web/lib/bsc-flags.ts` must stay a pure gate: never import wallet or signing SDKs into it.
- **Don't blindly rename "rushr".** The remaining Rushr strings are deliberate: worker, queue, database and volume names, browser storage, cookie and event keys (centralized in `apps/web/lib/brand-compat.ts`), legacy SIWE domains and statements, the `x-rushr-chain-id` header, compatibility aliases, and upstream attribution. Changing them can break signatures, orphan user data, or send clients to the wrong chain.
- **Keep BNB and Robinhood data separate.** Never point the BNB product at the Robinhood database or the `chain_v2` mirror, and never merge their financial histories.
- **Non-custodial.** The platform never holds user keys or funds, and servers never sign. Transactions are signed in the user's wallet.
- **Mind RPC load.** Indexer changes that add ongoing RPC load (new subscriptions, broad `eth_getLogs`) need a note in the PR.
- Don't present demo artwork, sample charts, or illustrative trading cards as real performance. No verified $CLASHR token contract exists (`NEXT_PUBLIC_CLASHR_TOKEN_ADDRESS` is blank).
- Secrets go in gitignored `.dev.vars` / `.env.local` / `packages/db/.env`. Production secrets are set with `wrangler secret put`.
- License: AGPL-3.0.
