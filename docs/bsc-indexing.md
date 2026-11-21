# BSC finalized indexing stage

The new worker is an independent, disabled staging entry point. It indexes BSC mainnet (56),
PancakeSwap v2/v3 factory creations inside an explicit block window, and subsequent swaps in the
discovered WBNB pools. It does not index all existing BSC pools. There is no discovery seed/import
for pools created before the configured start block, and no chain-wide swap-topic subscription.

## Data and finality boundary

`0013_finalized_markets.sql` adds cursor, completed-job, canonical-header, raw-log, verified-pool and
pool-swap tables under `chain_v2`. Legacy writers, cursors, Durable Objects, queues, API routes and
projections retain their existing identities. The legacy queue consumer explicitly rejects version-2
and other-chain identities before opening SQL/RPC, so BSC jobs never reach it.

Every batch verifies `eth_chainId=56`, reads `eth_getBlockByNumber("finalized",false)`, checks the
persisted cursor hash, fetches contiguous headers, validates every log against its header, and rechecks
both range boundaries before writing. Unsupported finality, stale/future heads, malformed logs,
inconsistent ancestry, wrong factories/membership and conflicting identities fail closed. There is no
fallback to `latest` or an assumed confirmation count. Providers must offer complete, unsilently-truncated
log history and historical contract calls. A single provider is trusted for canonicality/completeness;
independent provider comparison and receipt-completeness proofs are not implemented.

Unfinalized events never enter projections. A changed **stored finalized** hash commits a durable halt
without deleting history. Further jobs stop before provider work and market reads become unavailable.
This is a finality-violation response, not automatic speculative rollback. Investigate the provider and
chain, reconcile a restored copy, then perform a reviewed reset/replay. Do not clear `halt_reason` alone.

Factory emitters are allowlisted, and `getPair`/`getPool` at the pinned block must agree with each new
event. Pancake v3 uses its protocol-fee-extended Swap ABI; a payload with the plain (non-fee-extended) v3 Swap layout is not accepted.
Non-WBNB pairs are outside this release's scope. Raw factory events in the scanned range are retained,
including the non-WBNB creations that are not projected.

Verified WBNB pool metadata populates the chain-qualified pool/token read models. Token deployer is
unknown (`NULL`); token creation history is not inferred from pool creation (`launch_indexed=false`).
Token `created_block/created_at` represent first pool observation inside coverage, not token deployment.
The BSC token status is `spot`, not an inferred launchpad migration; `main_pool` remains unset.
Required decimals/supply come from pinned calls. Failed metadata stays absent and is retried on later
activity; token supply remains a snapshot at `supply_block`, not a continuously transfer-updated supply.

Swaps record pool-level sender/recipient, raw token/WBNB amounts, block hash and finality. Wallet trader
is unknown and remains NULL. These events do not feed the legacy swap, position, PnL, leaderboard or
fee-accounting paths. Simple execution ratios use exact integer arithmetic with 36 fractional decimal
places and actual token decimals (supported 0..36); subprecision ratios stay NULL. Mixed-flow v2 flash
events remain raw facts without a simple priced-swap projection. No float amount conversion is used.

`native_execution_price` is BNB per token for that execution. It is not an oracle, tax-adjusted wallet
fill or liquidity-validated current price. Token spot/native/USD prices, USD market cap/volume/liquidity,
charts, wallet attribution and financial accounting remain unavailable. Existing ETH/USD observations
are never reused for BNB. These missing capabilities are explicit in discovery and the status file.

## Jobs, concurrency and resource bounds

`{version:2,chainId:56,kind:"market-index",configHash,minute,step}` is required. A fingerprint binds chain,
factories, WBNB scope, decoder version, starting block and epoch. Provider credential rotation and batch
size changes preserve identity; changing scope/epoch/start requires a reviewed reset/replay instead of
mixing data. Stale queued fingerprints are acknowledged without touching SQL or RPC.

A per-chain transaction advisory lock admits one writer. Cursor, canonical rows, projections and
completed job identity commit atomically. Retries of a completed `(chain,config,minute,step)` perform no
provider work. Continuation intent is stored in that same transaction, so a commit followed by a failed
queue send recovers by re-sending the same child job. Its identity deduplicates duplicate delivery.
Each scheduled minute allows at most 20 steps; lag continues with the next tick. Queue ordering is not
required: each admitted job advances from the authoritative SQL cursor.

Default batch: 20 blocks; configurable 1..50. Limits: 500 tracked WBNB pools, 20 discoveries/new metadata
tokens per batch, 100 addresses per log request, 10,000 swap logs, 200 RPC calls and a 45-second RPC
work budget (10 seconds per call). Headers use four concurrent calls, metadata at most four per token;
the worker uses one SQL connection. Large event writes use bulk SQL. Exhausted budgets roll back without
cursor advancement; reduce the batch or implement verified sharding, never skip a range.

The SQL transaction remains open during bounded provider reads to fence the writer. Benchmark its
duration/lock impact before scaling. Every scanned block header and completed job is retained; retention,
storage growth, provider throughput and capacity for continuous catch-up require production-sized
measurements. These bounds intentionally limit this staging implementation, not full-chain throughput.

## Rehearsal and staging rollout

1. Restore an isolated database; apply reviewed migrations through `0013` with the journaled migration
   runner. Preserve the [legacy migration runbook](bsc-storage-migration.md) checks. No production
   migration or cloud deployment was performed by this implementation.
2. Provision a dedicated historical BSC provider. Probe chain identity, economic `finalized` support,
   historical `eth_call` at the desired start, log/address/range limits and completeness against a second
   source. The adapter was tested with ABI-encoded fixtures, not a live provider/real-block replay.
3. Select a small, known block window containing verified factory creations and swaps. Set explicit
   `BSC_START_BLOCK` (decimal, >0) and `BSC_INDEX_EPOCH` (1..64 alphanumeric/underscore/hyphen characters).
   Starts far back require independently measured backfill capacity. No implicit genesis/latest start.
4. Review `apps/indexer/wrangler.bsc.jsonc`: its worker/producer/consumer/DLQ names are staging-only.
   Provision both dedicated queues. Configure secrets `DATABASE_URL`, `BSC_RPC_URL`, `ADMIN_TOKEN` and
   the start/epoch variables. Leave the original worker config and resources alone. The new template
   has `BSC_INDEX_ENABLED=0`, no route, no cron and disabled public preview URLs.
5. After resource verification, deploy this separate staging worker using its explicit config. Enable
   `BSC_INDEX_ENABLED=1` only there. Add the intended protected staging route and use authenticated
   `POST /admin/tick`, or deliberately configure a cron. Ticks in the same minute share the same initial
   job identity. `GET /health` reports the disabled flag or stored cursor; it does not probe the chain.
6. Compare raw logs, factory membership, block hashes, pinned metadata and amounts to independently
   captured receipts/headers. Exercise duplicate delivery, queue-send failure after commit, provider
   failure, catch-up, stale configuration, restore and finalized-hash-violation drills.
7. Opt into the read API with `CHAIN_V2_READS=1` on the chosen staging API worker. It requires cursor
   equality with observed finalized head, no halt, and verification within 120 seconds. Old manual
   `indexer_state.market_ready` flags no longer enable BSC reads. Chain 97 has no ingester and remains
   unavailable. Ready responses include the indexed coverage window and finality; the window is not
   a claim of complete historical BSC discovery.
8. Query `/v2/chains/56/tokens?status=spot`, token detail/pools and
   `/v2/chains/56/tokens/:address/swaps` (latest 100 finalized pool executions). Capability discovery
   continues reporting trading/WebSockets/curves/Infinity/USD/spot-pricing/wallet-attribution disabled.

Monitor finalized head age, cursor lag, verification age, halted state, queue depth/age and DLQ count,
batch duration, RPC budget exhaustion/errors, unavailable metadata, source write latency and storage
growth. Structured batch logs and SQL cursor/job records exist; automated alerting/exporters do not.
No production rollout is justified until the real-block comparison, capacity and restore drills pass.

## Local validation

The terminal now reuses the original Trenches UI at `/bsc`, with a public GeckoTerminal BSC market
adapter and `/bsc/token/:address` charts/pools. This third-party data is explicitly indicative, never
canonical or used for wallet PnL/execution. `/bsc/agents` shows the approved shared public directory,
with no other-chain history mixed in. The independent canonical preview is at `/bsc/indexed`.
Header contract lookup, column filters/sorting, hover-pause and mobile column selection reuse the
existing terminal interactions. BSC filter/sort/chart preferences have separate keys. Unsupported
second candles and market-cap chart modes are not offered without the data needed to produce them.
Public feeds and contract lookups share bounded, short-lived caches to reduce provider requests.
Use the network selector or “Explore BNB markets” link from the legacy terminal.
Set server-side `BSC_INDEXER_URL` to
the origin of the chosen API worker (for example `http://localhost:8788`) only after the corresponding
database/ingester is ready and `CHAIN_V2_READS=1` is set there. No fallback to `NEXT_PUBLIC_API_URL`
occurs for canonical reads. Missing configuration, unready data, unknown token and unreachable source
have distinct UI states in the canonical preview; public browsing is a separate source and path.
The canonical preview shows coverage and pool executions, and keeps wallet/trading actions disabled.
The local web server serves these routes on port 3000; no cloud deployment is implied.

With an isolated PostgreSQL instance provided through `TEST_PG_ADMIN_URL`, run from the repository:

```powershell
pnpm --filter @clashr/indexer test --no-file-parallelism --testTimeout=30000
pnpm -r typecheck
pnpm --filter @clashr/core test
```

Integration tests create and drop their own databases and apply all journaled migrations. Without
PostgreSQL, database cases skip; a passing skipped run is not a migration rehearsal. The BSC test
fixtures cover both ABIs, metadata failures, fake membership, wrong chains, inconsistent/removed logs,
exact ratios, atomic write failure, a single writer, stale/duplicate jobs, commit/send-failure recovery,
finality halts, readiness expiry and legacy queue isolation. They are synthetic ABI fixtures.

The separate worker was bundled with `wrangler deploy --dry-run --config wrangler.bsc.jsonc`;
this verifies local bundling/configuration only and neither provisions queues nor tests Cloudflare delivery.

## Rollback and remaining work

Disable BSC market reads and the separate worker's indexing flag; stop its cron/producer/consumer as
appropriate. Disabled consumers retry with a delay and ultimately DLQ according to queue policy, so
pause delivery for an extended shutdown. Preserve canonical rows, cursor and job history. Legacy
indexing continues independently; no reverse synchronization is required. Do not delete jobs and blindly replay
old identities or change the epoch over existing projections.

Remaining before trading: production-grade discovery/sharding and historical replay, provider comparison,
pricing/liquidity selection and BNB/USD provenance, canonical financial accounting, chain-bound social/
wallet references, versioned real-time topics, and verified PancakeSwap quote/build/simulation/approval
adapters. No router, approval, signature, contract deployment or transaction broadcast is added here.

## Authoritative references checked 2026-11-17

- [BNB economic-finality RPC](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/bsc-api-list/)
- [PancakeSwap v2 deployments](https://developer.pancakeswap.finance/contracts/v2/addresses)
- [PancakeSwap v3 deployments](https://developer.pancakeswap.finance/contracts/v3/addresses)
- [Pancake v2 pair event interface](https://github.com/pancakeswap/pancake-swap-core/blob/master/contracts/interfaces/IPancakePair.sol)
- [Pancake v3 pool event interface](https://github.com/pancakeswap/pancake-v3-contracts/blob/main/projects/v3-core/contracts/interfaces/pool/IPancakeV3PoolEvents.sol)
- [Pancake token list / WBNB](https://github.com/pancakeswap/token-list/blob/main/src/tokens/pancakeswap-extended.json)
- [GeckoTerminal public market API](https://api.geckoterminal.com/docs/index.html)
