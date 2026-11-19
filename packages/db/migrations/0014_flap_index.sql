CREATE TABLE chain_v2.flap_tokens (
 chain_id integer NOT NULL CHECK(chain_id=56), address text NOT NULL,
 created_block bigint NOT NULL, created_at timestamptz NOT NULL,
 creator text NOT NULL, metadata_cid text NOT NULL, name text NOT NULL, symbol text NOT NULL,
 decimals integer CHECK(decimals BETWEEN 0 AND 36), total_supply numeric(78,0),
 state jsonb, state_block bigint, PRIMARY KEY(chain_id,address)
);
CREATE TABLE chain_v2.flap_events (
 chain_id integer NOT NULL CHECK(chain_id=56), tx text NOT NULL, log_index integer NOT NULL,
 block bigint NOT NULL, block_hash text NOT NULL, time timestamptz NOT NULL,
 event text NOT NULL, token text NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(chain_id,tx,log_index)
);
CREATE INDEX flap_events_token_time ON chain_v2.flap_events(chain_id,token,block DESC,log_index DESC);
