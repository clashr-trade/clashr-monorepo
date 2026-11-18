-- Additive successor storage. Legacy tables and conflict targets are unchanged.
-- This schema is managed by reviewed SQL migrations, not drizzle-kit generation.
CREATE SCHEMA chain_v2;
--> statement-breakpoint
CREATE TABLE chain_v2.legacy_tables (
  table_name text PRIMARY KEY,
  key_columns text[] NOT NULL
);
INSERT INTO chain_v2.legacy_tables VALUES
 ('tokens', ARRAY['address']), ('pools', ARRAY['id']),
 ('swaps', ARRAY['tx','log_index']), ('transfers', ARRAY['tx','log_index']),
 ('positions', ARRAY['wallet','token']), ('balances', ARRAY['token','wallet']),
 ('holder_backfill', ARRAY['token','wallet']), ('wallets', ARRAY['address']),
 ('wallet_pnl', ARRAY['wallet']), ('candles', ARRAY['token','interval','bucket']),
 ('signals', ARRAY['token']), ('deployer_stats', ARRAY['deployer']),
 ('indexer_state', ARRAY['key']), ('trades_ledger', ARRAY['id']);
--> statement-breakpoint
DO $$
DECLARE t record; keys text;
BEGIN
  FOR t IN SELECT * FROM chain_v2.legacy_tables LOOP
    -- Copy fields/defaults/checks, deliberately excluding legacy unique indexes.
    EXECUTE format('CREATE TABLE chain_v2.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', t.table_name, t.table_name);
    IF t.table_name <> 'trades_ledger' THEN
      EXECUTE format('ALTER TABLE chain_v2.%I ADD COLUMN chain_id integer NOT NULL', t.table_name);
    END IF;
    EXECUTE format('ALTER TABLE chain_v2.%I ADD CONSTRAINT supported_chain CHECK (chain_id IN (4663,56,97))', t.table_name);
    SELECT string_agg(format('%I', k), ',') INTO keys FROM unnest(t.key_columns) k;
    IF t.table_name = 'pools' THEN keys := 'dex,' || keys; END IF;
    EXECUTE format('ALTER TABLE chain_v2.%I ADD PRIMARY KEY (chain_id,%s)', t.table_name, keys);
  END LOOP;
END $$;
ALTER TABLE chain_v2.tokens RENAME COLUMN price_eth TO price_native;
CREATE UNIQUE INDEX ledger_chain_tx_idx ON chain_v2.trades_ledger(chain_id, tx_hash);
CREATE INDEX tokens_chain_status_created_idx ON chain_v2.tokens(chain_id,status,created_at DESC,address);
CREATE INDEX tokens_chain_created_idx ON chain_v2.tokens(chain_id,created_at DESC,address);
CREATE INDEX pools_chain_token_idx ON chain_v2.pools(chain_id,token);
CREATE INDEX swaps_chain_token_block_idx ON chain_v2.swaps(chain_id,token,block DESC,log_index DESC);
CREATE INDEX transfers_chain_token_block_idx ON chain_v2.transfers(chain_id,token,block);
CREATE INDEX balances_chain_wallet_idx ON chain_v2.balances(chain_id,wallet);
CREATE INDEX ledger_chain_trader_ts_idx ON chain_v2.trades_ledger(chain_id,trader,ts DESC);
--> statement-breakpoint
-- No snapshot copy in a schema migration: batches can be resumed separately.
CREATE TABLE chain_v2.legacy_changes (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL REFERENCES chain_v2.legacy_tables(table_name),
  row_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chain_v2.backfill_progress (
  table_name text PRIMARY KEY REFERENCES chain_v2.legacy_tables(table_name),
  last_key jsonb,
  complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION chain_v2.capture_legacy_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE keys text[]; old_key jsonb; new_key jsonb;
BEGIN
  SELECT key_columns INTO STRICT keys FROM chain_v2.legacy_tables WHERE table_name = TG_TABLE_NAME;
  IF TG_OP <> 'INSERT' THEN
    SELECT jsonb_object_agg(k, to_jsonb(OLD)->k) INTO old_key FROM unnest(keys) k;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT jsonb_object_agg(k, to_jsonb(NEW)->k) INTO new_key FROM unnest(keys) k;
  END IF;
  IF old_key IS NOT NULL AND old_key IS DISTINCT FROM new_key THEN
    INSERT INTO chain_v2.legacy_changes(table_name,row_key) VALUES(TG_TABLE_NAME,old_key);
  END IF;
  IF new_key IS NOT NULL THEN
    INSERT INTO chain_v2.legacy_changes(table_name,row_key) VALUES(TG_TABLE_NAME,new_key);
  END IF;
  RETURN NULL;
END $$;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT table_name FROM chain_v2.legacy_tables LOOP
    EXECUTE format('CREATE TRIGGER chain_v2_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION chain_v2.capture_legacy_change()', t.table_name);
  END LOOP;
END $$;
--> statement-breakpoint
-- Legacy position rebuilds use TRUNCATE, which does not fire row triggers.
-- Clear only the Robinhood projection and restart its snapshot transactionally.
CREATE FUNCTION chain_v2.capture_legacy_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM chain_v2.legacy_tables WHERE table_name=TG_TABLE_NAME;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown legacy table'; END IF;
  EXECUTE format('DELETE FROM chain_v2.%I WHERE chain_id=4663',TG_TABLE_NAME);
  INSERT INTO chain_v2.backfill_progress(table_name,last_key,complete)
    VALUES(TG_TABLE_NAME,NULL,false)
    ON CONFLICT(table_name) DO UPDATE SET last_key=NULL,complete=false,updated_at=now();
  RETURN NULL;
END $$;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT table_name FROM chain_v2.legacy_tables LOOP
    EXECUTE format('CREATE TRIGGER chain_v2_truncate AFTER TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION chain_v2.capture_legacy_truncate()',t.table_name);
  END LOOP;
END $$;
--> statement-breakpoint
-- Re-read current source state, rather than replaying stale event payloads.
-- A single migration worker holds the advisory lock while backfilling/draining.
CREATE FUNCTION chain_v2.sync_legacy_row(source_table text, row_key jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE keys text[]; predicate text; target_predicate text; payload jsonb;
BEGIN
  SELECT key_columns INTO STRICT keys FROM chain_v2.legacy_tables WHERE table_name = source_table;
  SELECT string_agg(format('s.%I = (jsonb_populate_record(NULL::public.%I,$1)).%I', k, source_table, k), ' AND '),
         string_agg(format('%I = (jsonb_populate_record(NULL::public.%I,$1)).%I', k, source_table, k), ' AND ')
    INTO predicate, target_predicate FROM unnest(keys) k;
  EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE %s', source_table, predicate) INTO payload USING row_key;
  -- Remove the old pool identity too if its protocol changes.
  EXECUTE format('DELETE FROM chain_v2.%I WHERE chain_id=4663 AND %s', source_table, target_predicate) USING row_key;
  IF payload IS NULL THEN RETURN; END IF;
  IF source_table = 'trades_ledger' AND (payload->>'chain_id')::integer <> 4663 THEN
    RAISE EXCEPTION 'Legacy trade ledger contains an unexpected chain';
  END IF;
  payload := payload || jsonb_build_object('chain_id',4663);
  IF source_table = 'tokens' THEN
    payload := (payload - 'price_eth') || jsonb_build_object('price_native',payload->'price_eth');
  END IF;
  EXECUTE format('INSERT INTO chain_v2.%I SELECT (jsonb_populate_record(NULL::chain_v2.%I,$1)).*',source_table,source_table) USING payload;
END $$;
