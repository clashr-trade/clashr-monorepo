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
- `@rushr/trade/bsc`: independent on-chain direct WBNB v2/v3 quote/build, pool identity and deployment
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
