-- BSC ingestion is independent from legacy outbox/projections; finalized-only.
CREATE TABLE chain_v2.market_cursors (
 chain_id integer PRIMARY KEY CHECK(chain_id=56),
 config_hash text NOT NULL,
 start_block bigint NOT NULL CHECK(start_block>0),
 block bigint,
 block_hash text,
 observed_finalized bigint,
 checked_at timestamptz,
 halt_reason text,
 CHECK((block IS NULL)=(block_hash IS NULL))
);
CREATE TABLE chain_v2.market_jobs (
 chain_id integer NOT NULL CHECK(chain_id=56),
 version integer NOT NULL CHECK(version=2),
 config_hash text NOT NULL,
 job_id text NOT NULL,
 continue_indexing boolean NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chain_id,config_hash,job_id)
);
CREATE INDEX market_jobs_completed_idx ON chain_v2.market_jobs(completed_at);
CREATE TABLE chain_v2.market_blocks (
 chain_id integer NOT NULL CHECK(chain_id=56),
 number bigint NOT NULL,
 hash text NOT NULL CHECK(hash ~ '^0x[0-9a-f]{64}$'),
 parent_hash text NOT NULL CHECK(parent_hash ~ '^0x[0-9a-f]{64}$'),
 time timestamptz NOT NULL,
 finality text NOT NULL CHECK(finality='finalized'),
 PRIMARY KEY(chain_id,number),
 UNIQUE(chain_id,hash),
 UNIQUE(chain_id,number,hash)
);
CREATE TABLE chain_v2.market_logs (
 chain_id integer NOT NULL CHECK(chain_id=56),
 tx text NOT NULL,
 log_index integer NOT NULL CHECK(log_index>=0),
 block bigint NOT NULL,
 block_hash text NOT NULL,
 address text NOT NULL,
 topics jsonb NOT NULL,
 data text NOT NULL,
 PRIMARY KEY(chain_id,tx,log_index),
 FOREIGN KEY(chain_id,block,block_hash) REFERENCES chain_v2.market_blocks(chain_id,number,hash)
);
CREATE INDEX market_logs_block_idx ON chain_v2.market_logs(chain_id,block);
CREATE TABLE chain_v2.pancake_pools (
 chain_id integer NOT NULL CHECK(chain_id=56),
 address text NOT NULL,
 token0 text NOT NULL,
 token1 text NOT NULL,
 dex text NOT NULL CHECK(dex IN ('v2','v3')),
 factory text NOT NULL,
 fee integer,
 tick_spacing integer,
 created_block bigint NOT NULL,
 PRIMARY KEY(chain_id,address),
 FOREIGN KEY(chain_id,created_block) REFERENCES chain_v2.market_blocks(chain_id,number)
);
-- A factory event proves pool creation, not token deployer attribution.
ALTER TABLE chain_v2.tokens ALTER COLUMN deployer DROP NOT NULL;
CREATE TABLE chain_v2.market_swaps (
 chain_id integer NOT NULL CHECK(chain_id=56),
 tx text NOT NULL,
 log_index integer NOT NULL,
 pool text NOT NULL,
 token text NOT NULL,
 quote text NOT NULL,
 side text NOT NULL CHECK(side IN ('buy','sell')),
 token_amount numeric(78,0) NOT NULL,
 quote_amount numeric(78,0) NOT NULL,
 sender text NOT NULL,
 recipient text NOT NULL,
 -- A swap event does not prove wallet attribution. Do not feed legacy PnL.
 trader text CHECK(trader IS NULL),
 native_execution_price numeric,
 PRIMARY KEY(chain_id,tx,log_index),
 FOREIGN KEY(chain_id,tx,log_index) REFERENCES chain_v2.market_logs(chain_id,tx,log_index),
 FOREIGN KEY(chain_id,pool) REFERENCES chain_v2.pancake_pools(chain_id,address)
);
CREATE INDEX market_swaps_token_idx ON chain_v2.market_swaps(chain_id,token);
