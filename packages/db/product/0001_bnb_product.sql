-- Dedicated BNB product database only. Never apply to a Robinhood or mirrored migration database.
CREATE TABLE product_config (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), chain_id integer NOT NULL CHECK(chain_id=56));
INSERT INTO product_config(chain_id) VALUES(56);
ALTER TABLE members DROP CONSTRAINT members_human_privy_check;
ALTER TABLE members ADD CONSTRAINT members_human_identity_check CHECK(kind='agent' OR privy_did IS NOT NULL OR wallet ~ '^0x[0-9a-f]{40}$');
CREATE TABLE wallet_nonces(nonce text PRIMARY KEY,address text NOT NULL,message text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE INDEX wallet_nonces_address_idx ON wallet_nonces(address,expires_at);
CREATE TABLE wallet_sessions(token_hash text PRIMARY KEY,address text NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX wallet_sessions_expiry_idx ON wallet_sessions(expires_at);
CREATE TABLE product_events(id text PRIMARY KEY,config jsonb NOT NULL);
CREATE TABLE verified_bnb_trades(tx_hash text PRIMARY KEY,account text NOT NULL,token text NOT NULL,side text NOT NULL,
  block_number bigint NOT NULL,block_hash text NOT NULL,token_amount numeric(78,0) NOT NULL,native_amount numeric(78,0) NOT NULL,
  gas_wei numeric(78,0) NOT NULL,finalized boolean NOT NULL,quote jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
-- No copied seasons, prizes, members, calls or financial history.
