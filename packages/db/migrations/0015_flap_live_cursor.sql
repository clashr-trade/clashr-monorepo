-- Independent live and historical checkpoints; projections are shared and monotonic.
CREATE TABLE chain_v2.flap_live_cursors (LIKE chain_v2.market_cursors INCLUDING ALL);
