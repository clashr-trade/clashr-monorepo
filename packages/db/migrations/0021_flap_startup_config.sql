-- Additive, immutable startup metadata; no cursor reset or replay.
CREATE TABLE IF NOT EXISTS chain_v2.flap_startup_configs (
 chain_id integer NOT NULL CHECK(chain_id=56),
 mode text NOT NULL CHECK(mode IN ('history','live')),
 config_hash text NOT NULL,
 configuration jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chain_id,mode)
);
