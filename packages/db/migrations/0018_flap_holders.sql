CREATE TABLE chain_v2.flap_holder_watches(
 chain_id integer NOT NULL CHECK(chain_id=56),address text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),block bigint,block_hash text,complete boolean NOT NULL DEFAULT false,
 checked_at timestamptz,PRIMARY KEY(chain_id,address)
);
CREATE TABLE chain_v2.flap_balances(
 chain_id integer NOT NULL CHECK(chain_id=56),token text NOT NULL,wallet text NOT NULL,amount numeric(78,0) NOT NULL,
 PRIMARY KEY(chain_id,token,wallet)
);
