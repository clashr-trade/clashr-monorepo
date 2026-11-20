# Flap BNB finalized feed

## Column completeness

The market query reserves 50 slots independently for new, almost-bonded, and migrated tokens. It must not select the newest 150 launches globally before categorization: doing so hides older qualifying curves and migrations.

Migration `0016_flap_active_discovery` allows unknown launch facts. `flap-enrich-active.ts --follow` checks finalized Portal states for tokens already observed in verified trades but absent from the initial launch window. Only status-4 migrated tokens or status-1 curves with at least 50% progress are imported this way. Unknown creation dates, creators and metadata CIDs stay null; they are never represented as fresh launches. A later actual launch backfill fills these facts without overwriting newer state.

Run the active discovery process with the same ignored local environment file as the indexer. Per-column SQL selection is tested against a real database containing more than 150 newer launches, older qualifying tokens, and tokens with unknown creation dates.

## Low-latency delivery corrections

Live following uses a separate advisory lock from historical replay. Local executions have unique validated identities, so successful jobs within the same scheduled minute no longer suppress subsequent polls. Queue-driven jobs retain their deterministic minute/step identities. Parallel RPC reads are followed by ordered database updates to prevent conflicting row-lock order between lanes. Backfill yields between batches and exits once caught up.

BNB market responses use `Cache-Control: no-store`, with only a one-second shared server memo. Visible Trenches pages poll every two seconds with an overlapping-request guard. Browser verification observed successive requests at approximately 2.00-second intervals. These changes remove artificial delivery delays; finalized-block confirmation time and provider latency still apply.

## Live-follow recovery

Migration `0015_flap_live_cursor` gives live following its own checkpoint. Configure `BSC_LIVE_START_BLOCK` once and run `flap-local.ts --follow --live` alongside historical `flap-local.ts --follow`. Both use finalized ancestry verification and a shared transaction lock. Event writes deduplicate by chain/transaction/log index and reject conflicting payloads; older backfill state cannot overwrite a newer state block.

The worker counts only indexed tokens against the state-read budget, reuses immutable metadata, reads state with bounded parallelism, and reduces block batch size on budget exhaustion. Transient failures retry without advancing the cursor; integrity failures still require reconciliation. API responses expose `indexedBlock`, `lagBlocks`, and `stale`; a checkpoint older than 60 seconds or more than 100 blocks behind is visibly stale. Browser polling is every 15 seconds.

This fixes the observed busy-range crash that left the API serving an hour-old successful snapshot. Verification included separate live/history cursor tests against PostgreSQL and a browser check showing current token links, the polling interval, and no stale banner when caught up.

## Local activation verified, 19 November 2026

The local index runs in `rushr_bnb_flap_local` on PostgreSQL port 55432. The existing product database stays separate. `BSC_INDEX_DATABASE_URL` tells the product API where to read Flap projections; the worker uses the same URL. Connection settings and the supplied Alchemy key are in ignored `apps/web/.env.local`, never in this document.

Alchemy's current plan limits log ranges to ten blocks. The RPC adapter splits larger batches into bounded ten-block requests. Portal state and event payloads use PostgreSQL JSON parameters to avoid double-encoded strings.

The initial backfill begins 2,000 blocks before the finalized head observed at setup. It is a recent discovery window, not a complete historical catalog. Tokens created before that window are not assigned invented launch records. Empty Almost bonded/Migrated columns are valid until qualifying indexed launches reach those states.

Start the API and worker from the repository root with Node's `--env-file=apps/web/.env.local` option and the installed tsx CLI. API entrypoint: `apps/indexer/scripts/product-dev.ts`. Worker entrypoint: `apps/indexer/scripts/flap-local.ts --follow`. Start the web app normally. These are local services, not a production deployment.

Verified: the product and web market endpoints returned HTTP 200 with finalized-onchain Flap records; an isolated browser rendered token links without the unavailable banner. The selected ingestion tests passed with real disposable PostgreSQL databases.

CLASHR reads its own product API `/flap/market`, backed by BNB Portal events. It does not call Flap's website API for discovery. Source reference: https://docs.flap.sh/en/flap/v2/developers/bonding-curve/build-an-indexer

Apply database migrations through `0014_flap_index` to the dedicated BNB database. Configure `BSC_RPC_URL`, `DATABASE_URL`, an explicit `BSC_START_BLOCK`, and `BSC_INDEX_EPOCH`. Set `BSC_INDEX_ENABLED=1` and `BSC_INDEX_SOURCE=flap` on the separate BSC worker. Schedule its existing authenticated tick/queue flow. For local rehearsal run `pnpm --filter @clashr/indexer exec tsx scripts/flap-local.ts` with those environment variables, then run the product API with the same database and point `PRODUCT_API_URL` at it.

The source switch changes the configuration hash. An existing Pancake cursor must NOT be silently reused: use a fresh dedicated database or an explicitly reviewed cursor reset/replay. Start from a reviewed Portal deployment block to cover all launches; a recent start only discovers launches after that point. History before the chosen start is not invented.

The worker persists launches, metadata CIDs, trades, migrations, CL pool IDs and pinned Portal states. It uses finalized ancestry checks, atomic projection/cursor commits, job deduplication, and halts on finalized hash conflicts. At most 20 touched tokens per batch; reduce batch size on budget failures. API prices are native/quote-denominated; USD conversion, holder balances, metadata image retrieval, Pool Launch, and post-graduation DEX activity enrichment remain separate work. No USD values or safety claims are manufactured. Curve trading still requires its execution adapter; indexing does not enable signing.

Rollback: stop the Flap worker first; restore the earlier application source if required. Preserve indexed tables/checkpoints for investigation. Never change source on the same cursor without replay review. No production deployment or contract transaction is part of this change.
