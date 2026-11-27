CREATE TABLE IF NOT EXISTS chain_v2.flap_live_handoffs (
 id bigserial PRIMARY KEY,
 previous_start bigint NOT NULL,
 previous_block bigint NOT NULL,
 previous_hash text NOT NULL,
 next_start bigint NOT NULL,
 configuration jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
