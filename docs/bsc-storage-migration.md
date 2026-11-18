# Chain storage migration runbook

Scope: additive market/accounting storage and initial read API; not a BSC trading launch.
Use a restored, isolated database first. `chain_v2` is managed by reviewed SQL migrations;
`packages/db/src/schema.ts` still describes legacy tables. Do not use schema push or generate a
replacement migration that drops the SQL-managed successor schema.

## 1. Prepare and expand

1. Record the application revision, migration journal, database backup and restore point. Verify the
   database is the intended rehearsal target. Use Node >=22.23.4 and the workspace pnpm version.
2. Inspect migration `0012_chain_storage.sql`. It adds tables, indexes, trigger functions and triggers
   to 14 legacy tables. Trigger installation takes table locks; measure lock duration under representative
   writes and apply with an operational lock/statement timeout during an appropriate deployment window.
   Do not run it against production without that measurement and a tested restore.
3. Set `DATABASE_URL` in the local process environment through your secret manager. From `packages/db`,
   use the installed migration runner (`pnpm exec drizzle-kit migrate`). It reads the migration journal
   and preserves applied migration tracking. Do not execute the raw SQL repeatedly or bypass the journal.
4. Keep `CHAIN_V2_READS` unset. Old routes and writers remain authoritative for 4663. Reserve all
   `chain_v2` writes for the mirror worker until a separate chain writer is explicitly implemented.

Capture stores keys, not full row snapshots, in the same transaction as a legacy change. A worker
re-reads current source state. Source-table TRUNCATE clears only the 4663 projection and restarts that
table's snapshot. BSC rows are not cleared. Public legacy table DDL changes need corresponding successor
schema/projection review before deployment; do not change legacy column layouts independently.

## 2. Backfill and follow changes

From the repository root, with the same explicit `DATABASE_URL`:

```powershell
node packages/db/scripts/migrate-chain-data.mjs
```

Each transaction handles at most 200 source rows or pending changes. Each process stops after 100
batches. Exit 0 means idle at that instant; 2 means the bounded run exhausted and should be resumed;
3 means another worker holds the transaction advisory lock. Other failures exit nonzero and preserve
unacknowledged work. Monitor failures and schedule subsequent invocations; this is not a deployed daemon.

Backfills use typed primary-key pagination. The advisory lock admits one mirror batch at a time.
Pending changes are deleted only after successful synchronization in the same transaction. There is
no high-watermark based on sequence IDs: sequence allocation order differs from commit order.
Only the mirror may write successor 4663 rows. Never add reverse synchronization.

Monitor queue row count/oldest age, batch throughput/duration, failures, source write latency, deadlocks,
database disk/WAL growth and replication lag. Alert thresholds need production load measurements.
No periodic-worker deployment or metrics exporter is included in this stage.

## 3. Reconcile and enable rehearsal reads

1. Pause all legacy writers, including pollers, queued consumers, hydration, accounting and rebuilds.
   Wait for their open transactions to finish. Drain until idle; keep writers paused for verification.
2. Run the full audit:

   ```powershell
   node packages/db/scripts/migrate-chain-data.mjs --verify
   ```

   Exit 0 requires every backfill complete, no pending changes, and zero missing/extra full rows for
   every table. Values are compared as JSONB with explicit 4663/native-price projection, rather than
   floating-point application hashes. Other chains are excluded. Equal counts with changed values fail.
   The audit is a full scan in one repeatable-read snapshot; measure its cost on a large restored copy.
   This is a snapshot audit, not a write fence: a subsequent source commit can invalidate the result.
3. Confirm source native amounts, balances, positions, candles and ledger totals against the captured
   snapshot. Inspect any ambiguous legacy ledger chain; the worker rejects it instead of relabelling it.
4. In the rehearsal worker environment, enable `CHAIN_V2_READS=1`. Available routes:
   `/v2/chains/4663/tokens`, `/v2/chains/4663/tokens/:address`,
   `/v2/chains/4663/tokens/:address/pools`, and `/v2/chains/:chainId/capabilities`.
   List filters are `limit=1..100` and optional `status=new|bonding|migrated|spot`.
   Amounts retain database precision; native prices are `price_native`.
5. Missing configuration or readiness returns 503. For 4663, all manifest backfills must be complete.
   After writers resume, reads are eventually consistent with mirror progress; backfill completion does
   not promise zero outbox lag. Keep the worker running and monitor lag.
6. After migration `0013`, BSC reads require the separate ingester's fresh, caught-up, non-halted
   canonical cursor. The old `indexer_state.market_ready` flag is ignored. Chain 97 has no ingester
   and remains unavailable. See [BSC indexing](bsc-indexing.md) for its restricted coverage and staging gates.
   Capability discovery reports configuration only; it does not attest database freshness.

Acceptance for this stage: all tables reconcile at a quiescent snapshot; repeat/restart produces the
same projection; colliding addresses/hashes/pools stay separate; late commits and deletes are retained;
old API regression tests pass; no BSC trade or WebSocket feature is enabled.

## 4. Rollback and later handoff

Disable `CHAIN_V2_READS` and stop the mirror. Legacy readers/writers continue using the original tables.
Keep capture triggers while resumption is planned and monitor outbox growth. If trigger overhead itself
is unacceptable, remove capture only through a reviewed rollback migration; writes during any capture
gap require a fresh snapshot/reconciliation, never blind continuation from old progress.

Keep successor data and migration journal intact for diagnosis. Do not drop `chain_v2`, disable triggers
or repoint writers as an automatic rollback. Restoring a database backup follows the separate verified
restore procedure and its data-loss window. No old writer is cut over in this stage.

Migration `0013` adds canonical finality and versioned jobs for the bounded BSC ingestion path.
Chain-bound social references, wallet configuration, accounting and real-time topics remain separate
work. Later writer handoff and old-schema retirement remain the gated stages in `refactor_plan.md`;
this runbook does not authorize production execution.
