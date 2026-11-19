CREATE TABLE chain_v2.flap_wallet_facts (
 chain_id integer NOT NULL CHECK(chain_id=56),address text NOT NULL,
 is_contract boolean,code_block bigint,code_checked_at timestamptz,
 first_funder text,funded_at timestamptz,funding_status text CHECK(funding_status IN ('known','unknown','unsupported')),
 funding_checked_at timestamptz,PRIMARY KEY(chain_id,address)
);
CREATE TABLE chain_v2.flap_safety_snapshots (
 chain_id integer NOT NULL CHECK(chain_id=56),address text NOT NULL,
 block bigint NOT NULL,block_hash text NOT NULL,data jsonb NOT NULL,
 computed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(chain_id,address)
);
