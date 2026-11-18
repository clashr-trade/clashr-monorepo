# Independent BNB product: local runbook

This product uses a dedicated chain-56 database. Do not point it at the Robinhood database or the
`chain_v2` mirror. The original deployment remains available when BNB product mode is absent.

## Initialize and run

1. Set `BNB_PRODUCT_ADMIN_URL` to an owned PostgreSQL admin connection and `BNB_PRODUCT_DATABASE`
   to a new `rushr_bnb_*` database name. Run
   `pnpm --filter @rushr/trade exec tsx ../../packages/db/scripts/bootstrap-bnb-product.ts`.
   The script refuses an existing database. It applies the original base schema through migration
   0011 and the dedicated product migrations, without the legacy mirror triggers.
2. Set `DATABASE_URL` to that new database. Set `PRODUCT_ORIGIN` to the web origin and, optionally,
   `BSC_RPC_URL` to an owned historical-capable BSC provider. Run
   `pnpm --filter @rushr/trade exec tsx watch ../../apps/indexer/scripts/product-dev.ts`.
   This development server listens only on `127.0.0.1:8790`; it is not a production worker deployment.
3. Configure the web app with `NEXT_PUBLIC_PRODUCT_CHAIN_ID=56` and
   `PRODUCT_API_URL=http://127.0.0.1:8790`. Use the existing BSC signing opt-in only after rehearsal.
   An optional `NEXT_PUBLIC_BSC_PRIVY_APP_ID` must belong to an owned BSC-configured app.
   Restart the web server after changing public environment variables.
4. Open `/trenches`, `/feed`, `/agents`, `/leaderboard` and `/rush`. The web proxy rejects a Rushr
   public API origin and requires the independent backend's chain-56 response header.
5. To apply the user-authorized Robinhood event template **to this dedicated BNB database**, run
   `pnpm --filter @rushr/trade exec tsx ../../apps/indexer/scripts/configure-product-event.ts`.
   This upserts `product_events.rush` and replaces an existing event configuration. It does not copy
   standings, fund a treasury or distribute prizes. Review the source template before rerunning.

Current local template: Nov 18–23, 2026, 00:00 UTC; Caller $300, Gainer $300, Trader $400;
minimum buy $20; minimum liquidity $5,000. Team/treasury exclusions must be configured for an owned
production event. The public `/api/product/v1/events/rush` response exposes the effective settings.

## Upgrade, verification and rollback

The bootstrap script is for fresh databases only. For an existing dedicated product database, back
it up, verify `product_config.chain_id=56`, inspect applied tables/columns, and apply only missing
`packages/db/product/*.sql` migrations in order. These SQL files are not idempotent; an automatic
versioned product migration runner is still required before production rollout. Never run the global
0012 mirror migration against the BNB product database.

Use disposable PostgreSQL databases with `TEST_PG_ADMIN_URL` for product integration tests. Keep
production credentials out of tests. Contract mock/fuzz tests use `FOUNDRY_PROFILE=bnb`; they do not
prove live protocol compatibility or constitute a contract audit.

To roll back local activation, stop the independent product server and restore the prior web
environment settings, then restart the web server. Preserve the dedicated database and receipt
journal for reconciliation. Do not merge its financial history into Robinhood records. Disabling the
web signing flag prevents new UI submissions but cannot cancel transactions already broadcast.

Full production parity remains incomplete; the current limitations and activation gates are listed
in [the migration status](bsc-migration-status.md).
