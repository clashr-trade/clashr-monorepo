# BSC migration implementation status

## Current BNB-only product stage — 2026-11-18

The user subsequently requested the original product UI and functionality on BNB, superseding the
earlier preview-only and spot-only presentation choices documented below. Production remains unchanged.
Local `NEXT_PUBLIC_PRODUCT_CHAIN_ID=56` uses the original canonical navigation and social screens with
an independent chain-56 product database/API. `/bsc` aliases redirect to canonical product routes.

- Trenches now displays genuine Four.meme New pairs / Almost bonded / Migrated lifecycle data.
  Spot pools are not relabelled as bonding curves. Public metadata is indicative; canonical receipt
  prices are preserved when metadata refreshes. Columns have bounded, equal-height scrolling.
- Feed, member onboarding, agent registration, leaderboard and Rush use the independent BNB API.
  Wallet sign-in uses chain/domain-bound SIWE sessions; an owned BSC Privy app is optional.
  Robinhood profiles, social records and performance are not copied into this product database.
- At the user's explicit request, the local BNB Rush configuration copies the Robinhood template:
  **2026-11-18 00:00 UTC through 2026-11-23 00:00 UTC**, Caller **$300**, Gainer **$300**,
  Trader **$400**; minimum buy **$20**, minimum liquidity **$5,000**. Standings remain BNB-only.
  This configuration does not fund or distribute prizes. Production must configure its own event,
  exclusions and treasury; no production event was changed.
- PancakeSwap execution supports direct v2/v3 routes and verified v2 routes through USDT. Quotes bind
  every pool and route; receipts must prove every hop. Finalized BNB trade reporting uses historical
  BNB/USD oracle data and durable receipt recovery in the dedicated product backend.
- A separate Four.meme router candidate compiles and passes local mock/fuzz tests. It is **not
  deployed or wired into the signing SDK/UI**. Browsing launchpad tokens does not imply executable
  bonding-curve trading. Mainnet-fork verification, bytecode/deployment verification and end-to-end
  adapter integration remain required before activation.

Remaining production work includes owned backend/database/storage deployment, media-upload transport,
BNB agent documentation/MCP compatibility, canonical creator/funder attribution for competition
eligibility, periodic auditing of already-projected finalized receipts, and funded-wallet rehearsal.
No transaction or contract deployment was broadcast by the agent. Do not describe this stage as full
production parity. See [BNB product runbook](bnb-product.md).

Verified this stage: workspace typechecking; 160 indexer tests against disposable PostgreSQL databases;
42 web tests; 128 trade tests (10 existing live tests
skipped); 10 router tests including 256 fuzz cases. Isolated browser checks passed canonical desktop
and mobile navigation, genuine lifecycle rows, bounded columns, buy-review opening and the copied
Rush configuration, with no Robinhood API/RPC reads or runtime errors.

## Earlier migration stages (historical)

### Token workspace parity — 2026-11-18

The BNB token route now shares the original header, chart controls, calls sidebar and table tabs
instead of using the separate preview layout. Desktop uses the original three-column workspace;
mobile has a Buy/Sell sheet. The BNB execution panel adds indicative USD budgets, presets, percentage
sells and balance-aware Max while retaining exact quotes, simulation and individual wallet approval.
No transaction was signed or sent during implementation.

Public Four.meme fills and reported holder balances populate the trade, holder and derived trader
views. On-chain decimals/supply enable market-cap charts. Curves use candles aggregated from the
recent trade sample; these are not full launch-to-date histories. Pancake pool activity comes from
GeckoTerminal with direction determined from token addresses. Snapshot reads are shared/cached for
15 seconds; chart/table state and unknown safety fields retain their original behavior.

Funding relationships, complete early-buyer history and creator launch history are still incomplete.
Curve signing remains disabled pending its audited/deployed adapter. Restoring those controls does
not claim those data or execution dependencies are complete.

Verified: 55 web tests, web typechecking, and isolated-browser checks using a real BNB token (100
trades, 55 candles and 10 reported holders observed). Calls collapse, USD presets, holder/trader tabs,
bubble distribution and mobile trading sheet passed, with no Robinhood reads, runtime errors or
horizontal overflow. Counts are observations and vary with the source.

The original scope was PancakeSwap v2/v3 spot first, with launchpad curves and Infinity deferred.
The descriptions below record that earlier separate-preview implementation.

## Implemented

- Immutable network registry for 4663, 56 and 97; chain-qualified asset keys.
- Legacy exports, transport defaults and API routes retain Robinhood semantics.
- RPC transports cached by chain/origin; explicit chain selection, separate provider secrets,
  provider chain verification and deduplicated checks with a 60-second expiry.
- BSC proxy broadcast disabled; legacy execution rejects explicitly configured BSC clients.
- Migration `0012_chain_storage.sql`: additive `chain_v2` successor tables for 14 market/accounting
  tables. Keys include chain; pool keys also include protocol (`dex`). Native token prices use
  `price_native`; legacy `price_eth` remains unchanged. No destructive rewrite of old tables.
- Transactional change capture, including key changes, deletes and legacy TRUNCATE rebuilds.
  Bounded, resumable keyset backfill and single-worker outbox draining. Earlier sequence IDs
  committed later are retained; failed batches do not acknowledge their changes.
- Full-row reconciliation in one repeatable-read snapshot, including prices, balances, positions,
  candles, PnL and ledger rows. Unexpected legacy ledger chain IDs fail closed.
- Opt-in `/v2/chains/:chainId` token/list/pool reads and capability discovery. Unready BSC data
  returns 503; no legacy fallback, BSC hydration, trading or WebSocket capability is advertised.
- Real PostgreSQL regression coverage for collisions, restarts, drift, update/delete/TRUNCATE,
  out-of-order commits, transactional rollback and API isolation.
- Migration `0013_finalized_markets.sql`: BSC canonical headers/raw logs, verified Pancake pools,
  pool execution facts, per-chain cursor and completed-job ledger. Legacy projections stay separate.
- Independent disabled BSC staging worker/queue configuration. Explicit start/epoch/provider resources,
  chain/version/config-scoped jobs, atomic idempotency and recoverable continuation intent.
- Finalized-only ingestion with contiguous ancestry and boundary checks. A changed stored finalized
  hash persists a halt; unfinalized state is never projected and is not silently rewound.
- Allowlisted mainnet PancakeSwap v2/v3 factory discovery with pinned membership verification,
  WBNB-pair swap decoding and exact BNB execution ratios. Real pinned token decimals/supply only;
  missing metadata stays unavailable. No inferred token deployer or wallet trader.
- BSC reads require fresh, caught-up, non-halted cursor state; manual readiness flags are ignored.
  Responses include coverage; finalized pool execution history is available via the v2 swaps endpoint.
- `@clashr/trade/bsc`: independent on-chain direct WBNB v2/v3 quote/build, pool identity and deployment
  verification, block/account/route/expiry binding, marginal pool-impact cap, exact/reset approvals,
  stateful wallet-delta simulation, BNB gas budgets and user-confirmed EOA execution.
- Native v3 refund/unwrap handling; no Universal Router/Robinhood command reuse. Platform/referral fees
  are explicitly zero until a separate verified BNB fee path is selected.
- Receipt/canonical-block verification, actual token/native fill and gas accounting, including failed
  transactions. Wallet-local pending-receipt recovery does not replay sends or invent USD/PnL.
- BNB token-page wallet connection, network switching, quote/simulation review and separate signing
  flag. BSC pages now receive the terminal host/nonce CSP policy with dynamic per-request rendering.

## Rollout state

Schema/data migration and BSC ingestion rehearsed only in disposable local PostgreSQL 18 databases
with ABI-encoded RPC fixtures. No live-provider or real-block replay was performed.
No production database, external infrastructure, deployed contract or on-chain transaction changed.
The new read API defaults off (`CHAIN_V2_READS` must explicitly equal `1`).
The new BSC worker defaults off, with no cron/route enabled. Legacy UI/feed, auth, jobs and trading
adapters retain Robinhood semantics. `/bsc` now reuses the original three-column Trenches UI, cards,
filters, sorting, hover-pause and mobile controls with chain-scoped preferences and no legacy socket.
Real public PancakeSwap v2/v3 BSC data, prices, volume, liquidity, contract lookup and token charts come
from GeckoTerminal with explicit indicative/third-party provenance. Public data never authorizes execution
or substitutes for canonical financial accounting. The columns are New pairs / Trending / Established;
no spot pool is relabelled as a verified bonding curve or launchpad migration.

The gated canonical preview moved to `/bsc/indexed` and still requires `BSC_INDEXER_URL`.
`/bsc/agents` shows the user-approved shared public agent profiles, alphabetically, without presenting
Robinhood PnL/trade counts as BNB results. Full profile links lead to clearly labelled legacy history.
The BSC token page now mounts a separate external-wallet spot panel; legacy Privy auth is not mounted.
All five terminal sections now have BNB-scoped desktop/mobile navigation. Network switching preserves
the selected section; token contracts never carry across chains. `/bsc/feed`, `/bsc/leaderboard` and
`/bsc/rush` explicitly show unavailable capability states, as requested, without using legacy social,
ranking or event data. These routes are navigation parity, not implemented BNB social/event backends.
The separate canonical preview remains accessible through the secondary Indexer status link.
Quote/simulation previews do not enable signing. `NEXT_PUBLIC_BSC_SWAP_ENABLED` defaults off and the
global preview guard continues protecting shared API writes. BSC signing was subsequently enabled
locally at the user's request on 2026-11-17, independently of that guard. No wallet signatures were
requested by the agent and no transactions were broadcast. Shared performance/accounting backends are not implied
by the wallet-local receipt history.

Steps 3-4 of `refactor_plan.md` are **partial**: successor market storage and initial read API are
implemented. Social references, chain-bound wallet configuration, ledger attribution beyond legacy
copying, versioned sockets and mutations remain to be implemented. Finality and scoped jobs are
implemented for the separate BSC path, not retrofitted onto historical Robinhood facts.
Step 5 has a bounded WBNB discovery/ingestion implementation, not full-chain discovery, verified
current/USD pricing, wallet accounting or a production-ready BSC terminal feed.

See [storage migration runbook](bsc-storage-migration.md) for rehearsal, verification and rollback.
See [BSC indexing runbook](bsc-indexing.md) for finality/job semantics, scope limits and staging gates.
See [BSC spot execution runbook](bsc-spot-trading.md) for adapters, fee policy, wallet limits and rollout.

Validation on 2026-11-17: workspace typechecking passed; all 134 indexer tests passed against isolated
PostgreSQL with `--no-file-parallelism --testTimeout=30000`. Default five-second timing timed out in
the existing rate-limit test, which makes over 70 sequential requests. After batching outbox SQL,
the 9 migration/API tests passed again. The Node backfill and `--verify` CLI also passed a fresh-database
smoke test. Production-scale lock, latency and storage measurements have not been performed.

Finality/indexing-stage validation (2026-11-17): all 153 indexer tests passed against isolated PostgreSQL
using the same serial/30-second settings. After adding response coverage and halted-read assertions,
the 28 BSC/storage tests passed again. Workspace typechecking passed; final indexer typechecking,
all 56 core tests and the separate BSC Wrangler dry-run bundle passed. No live RPC, queue provisioning,
cloud deployment or real-block replay was performed. The disposable PostgreSQL server was stopped.

Frontend validation: 22 web tests and web typechecking passed. An isolated headless Chrome verified
the live public BSC terminal (27-29 token cards observed), real token candlesticks/pools, and 13 shared
public agents. No legacy market WebSocket subscriptions, page overflow at desktop/mobile widths,
Robinhood PnL labels on the BNB directory, or runtime exceptions were observed. Counts are observations,
not fixed inventory. Header contract search and unchanged Robinhood Trenches navigation also passed.
Public-market reads share in-flight requests and bounded caches; partial pool refresh is labelled.
No sample rows were inserted. The independent canonical preview remains disconnected
until a ready BSC API origin is configured.

Spot-stage validation (2026-11-17): 126 trade tests passed (10 pre-existing live tests skipped), 28 web
tests and 56 core tests passed. Workspace typechecking passed. Read-only BSC mainnet probes verified
router/quoter deployment bindings and quotes from v2 plus all four v3 tiers. Unsigned v2/v3 buy
simulations on existing funded-EOA state passed actual wallet-delta/gas checks, with no funding override.
An isolated browser provider that cannot sign/send verified live quote/simulation UI, disabled signing,
mobile layout, account/network invalidation and nonce CSP; zero sends/runtime/CSP failures observed.
Real funded-wallet signing and post-broadcast reconciliation remain rehearsal gates, not claimed tests.

Navigation-stage validation (2026-11-17): 35 web tests and web typechecking passed. An isolated browser
verified all five tabs and active states at 390/768/1024/1440px, mobile tab clicks, BNB/Robinhood
round-trip switching that preserves Feed, and reachable BNB markets/Agents. BNB unavailable-service
pages made no legacy feed, ranking or event reads; no runtime errors or horizontal overflow observed.

## Next dependencies

1. Benchmark trigger overhead, schema locks, disk growth and backfill on a production-sized restored
   copy; rehearse restore/writer handoff. Audit the full legacy ledger for ambiguous chain provenance.
2. Rehearse the BSC adapter against independently captured real blocks/receipts and a historical
   provider. Measure catch-up, lock/resource budgets and storage growth; add discovery seeding/sharding
   and retention before expanding beyond its bounded WBNB window.
3. Complete chain-bound references, versioned sockets and canonical financial accounting. Add
   liquidity-validated current pricing and independently verified BNB/USD provenance; execution ratios
   are not spot oracles. No legacy ETH/USD or router-level sender is reused as BSC accounting truth.
4. Rehearse real user-confirmed wallet signing and receipt recovery before enabling BSC execution.
   Extend beyond direct WBNB/EOA routes deliberately. Select/audit any platform-fee collection path;
   complete SIWE/member attribution, delegated/smart-wallet support and durable financial projections.

Provider credentials, treasury/guardian addresses, owned domains and independently verified venue
deployments remain prerequisites for production execution.

Rollback: disable `CHAIN_V2_READS`, stop the mirror worker and keep legacy readers/writers on 4663.
Retain change capture if migration will resume; monitor queue growth. BSC secrets can remain unset.
No legacy identities or native amount units have been rewritten.


## CLASHR identity and competition landing ? 2026-11-19

- Replaced the landing with a BNB gold/charcoal human-versus-agent arena, original comic assets, responsive layout, reduced-motion animations and a real chain-56 leaderboard preview with human/agent filters.
- Added the CLASHR wordmark, angular C/lightning mark and token coin; canonical domain is clashr.trade. Internal package/env/storage identifiers retain compatibility.
- Rewrote the whitepaper and BNB agent docs around competing, following and comparing humans and agents. Archived the historical Robinhood references. BNB skill.md/llms.txt now serve the CLASHR guide; the legacy MCP remains pending migration.
- BNB token status explicitly has no published contract or launch economics. Historical RUSHR addresses and burns are not presented as CLASHR facts. No DNS, production deploy or token deployment was performed.
- Verified workspace typecheck, 55 web tests, 11 agent-core tests and generated-document parity. Local desktop/mobile browser checks: no runtime exceptions or horizontal overflow, loaded artwork, filter empty states, mobile menu/Escape, reduced motion, canonical URL and no GitHub links. Whitepaper, agent-docs, skill.md, llms.txt, token status, icon and OG image returned HTTP 200.
- Artwork source, served assets and final built-in imagegen prompts: docs/clashr-asset-prompts.md.


## Contest presentation ? 2026-11-19

- Renamed public Rush navigation to Contest and added /contest, with legacy /rush and chain-scoped aliases retained through redirects. Internal event API and section identifiers remain compatible.
- Replaced the inherited artwork with original black-and-white anime human-versus-agent trading rivals, responsive desktop/mobile layouts and localized copy.
- Contest is explicitly coming soon. The historical local template no longer appears as a live, funded contest; this page makes no event API requests and displays no countdown or prize amounts. Backend historical records and configuration were not changed.
- Artwork source, served path and final built-in imagegen prompt are documented in docs/clashr-contest.md.

## Finalized Flap safety snapshots - 2026-11-19

- Added migration 0019 and a separate bounded safety worker using Rushr's snapshot and signal maths. Concentration excludes BSC protocol pools, burns and contracts; creator holdings, sniper count/share, funding-linked bundles, insiders and fresh-wallet metrics carry explicit coverage requirements.
- Fixed the initial funding probe incompatibility by using an explicit finalized block number instead of the `finalized` tag for the transfer-history method. The configured local provider returned real funding records. Unsupported/missing history remains unknown and is retried with backoff.
- The API serves fresh cached snapshots and holder tags without adding RPC work to feed requests. The UI displays safety checkpoint/time and no longer computes Top 10 from raw protocol reserve balances. No honeypot, explorer verification, renunciation or overall risk pass is invented.
- Applied the additive migration only to the dedicated local Flap index database and started its worker. Production deployment/scheduling remains unchanged. Setup, budgets, coverage limits and rollback are in docs/flap-safety.md.
- Verified RSA and a new live launch using real finalized data. Browser check retained priced candles and rendered safety fields without runtime exceptions. Both typechecks passed; 40 targeted indexer tests and all 70 web tests passed. No funded transactions were sent.

## Feed-wide safety queue and holder catch-up - 2026-11-19

- Fixed a coverage gap: only detail-page tokens were previously enrolled. Feed reads now automatically enrol returned tokens, preserve detail priority, throttle writes and expose safety coverage states.
- Replaced serial per-token log backfills with shared contiguous scans plus a fast sparse-token path. Transfer-history API responses discover addresses only; actual amounts come from pinned on-chain balanceOf calls and must sum exactly to totalSupply before publication. Missing candidates, RPC failures, noncanonical checkpoints or failed accounting never become measured zeroes.
- Added fair retry cooldowns so an unavailable, actively viewed launch cannot monopolize the queue. Free RPC log scans are paced and back off on throttling. Migration 0020 was applied only to the local index database.
- Verified the exact reported GTA6 token with populated concentration, creator holdings, one sniper, 0.8% sniper buys and a 5.2% bundle. Isolated browser checks showed measured safety chips on 17 of 60 feed tokens during catch-up, working coverage labels, a populated GTA6 grid, no horizontal overflow and no runtime errors. Coverage continues to change as the worker catches up; unsupported/incomplete fields remain unknown.
- Both typechecks, 40 targeted indexer tests and all 70 web tests passed. Production deployment remains unchanged.

## ERC20-quoted Flap curve trading - 2026-11-19

- Removed the blanket ERC20-quote rejection. Native buys use Portal's internal conversion only when enabled; direct quote-asset buys use exact/reset approvals, and sells receive the curve's actual quote token.
- Quotes bind payment/output addresses, quote decimals, symbol and native-conversion capability. Build/simulation rechecks settlement and measures native, traded-token and quote-token wallet deltas. Receipt accounting never treats ERC20 Portal event amounts as BNB. Native-hop receipts retain an unknown actual native spend and show the reviewed maximum; direct quote settlement uses wallet Transfer logs.
- Updated terminal and quick-buy payment selection, raw asset inputs, USD conversion, balances, receive amounts and compatible local activity storage. Input/gas checks still block unfunded wallets; Flap ranking ingestion remains separate.
- Verified the reported Golden Kitty token with real native-hop quoting and stateful simulation. Read-only browser tests passed native and GMEB buy quotes plus GMEB sell presentation, without a send/sign capability. No funded transaction was broadcast. Full SDK tests: 150 passed, 10 skipped; web tests: 71 passed.

## Original landing and Clash presentation - 2026-11-19

- Restored the original centered cream landing hero and classical forum artwork with the CLASHR wordmark, gold logo/banner and BNB Chain attribution. Restored the classical automaton illustration in the follow-trader section. The remaining landing content and token anchor remain in place.
- Renamed Contest navigation to Clash at /clash and /bsc/clash. Rush and Contest aliases redirect to those routes. The page reuses the original Rush layout and /art/rush.jpg background with Clash wording and existing BNB event data; schedules/prizes were not changed.
- Added server-loaded initial event data and a stable initial countdown timestamp; client refreshes retain the original event API contract. Restarted only the stalled local Next development server during verification.
- Verified desktop/mobile landing layouts, original event sections, background loading, active Clash navigation and Contest redirect in an isolated browser. No horizontal overflow or runtime exceptions; web typecheck and all 71 web tests passed. No deployment was performed.

## Clashr MCP first local milestone - 2026-11-19

- Added separate `packages/clashr-mcp` (`@clashr/mcp` 0.1.0), preserving the legacy Robinhood package. Node stdio tools support local wallet creation, verified SIWE registration/key recovery, status, finalized Flap markets, token safety, feed, 30d-default leaderboard, direct Flap/PancakeSwap quotes and real-balance dry-run simulation. No transaction signer or buy/sell/broadcast tools are exposed.
- Uses isolated chain-56 state, API-origin-bound keys, chain/domain/nonce/purpose/expiry validation, input/slippage caps and expiring session quote IDs. Reuses the existing SDK for contract/route verification, exact approvals, minimum output and ERC20 Flap settlement. Unknown safety remains unknown.
- Verified 13 MCP tests, one actual-product registration/restart/key-recovery test in a throwaway database, and 45 adapter tests. MCP/indexer typechecks, build and npm package-content dry run passed. Real stdio checks passed local API reads, mainnet Flap quote/build/simulation and a PancakeSwap quote. A public trader address was used; no mainnet registration, signature or broadcast occurred. Unsupported/gated launches still correctly refuse quotes.
- Setup: `packages/clashr-mcp/README.md`. No npm publication, plugin-wrapper installation, production deployment or running product database change. Public plugin packaging is the next milestone.

## Claude Code / Codex plugin wrapper

- Added `plugins/clashr` with portable and Claude-compatible manifests, branded PNG assets derived from the existing Clashr SVG, a scoped skill, local setup reference and a secret-safe launcher. No lifecycle hooks, auto-registration or registry fallback.
- `pnpm --filter @clashr/mcp build:plugin` emits the standalone `dist/clashr-plugin-marketplace` with both client catalogs, fully bundled runtime, file hashes, versioned `.tgz` and checksum. The source-file allowlist excludes project dependencies, secrets and wallet/config state. Existing Rushr plugin/catalogs are preserved.
- The launcher reads the dedicated local `~/.clashr/mcp.env` or explicit config path, accepts only supported settings and forces dry-run after parsing. Wallet state remains outside client caches. Portable `${PLUGIN_ROOT}` and Claude `${CLAUDE_PLUGIN_ROOT}` paths handle relocation and spaces.
- Passed MCP typecheck, all 16 MCP/wrapper tests, official portable plugin/MCP schema validation and skill validation. Archive extraction tests launch both client definitions with no checkout dependencies. Native Codex marketplace install, catalog and MCP registry discovery passed in a disposable home; user client configuration was unchanged. Claude CLI is unavailable, so native Claude install/validation remains a user-side check; its manifest and actual launcher are tested.
- Real read-only stdio checks through the bundled launcher passed local BNB API status/markets/feed/leaderboard/safety and mainnet Flap/PancakeSwap quotes. No mainnet registration, signature or broadcast. Installation instructions: `plugins/clashr/README.md`. No npm/public-directory publication or production deployment.
