ALTER TABLE chain_v2.flap_holder_watches ADD COLUMN IF NOT EXISTS safety_attempted_at timestamptz;
CREATE TABLE IF NOT EXISTS chain_v2.flap_launch_coverage (
 chain_id integer NOT NULL CHECK (chain_id=56),
 address text NOT NULL,
 through_block bigint NOT NULL,
 block_hash text NOT NULL,
 PRIMARY KEY(chain_id,address)
);
