ALTER TABLE chain_v2.flap_holder_watches ADD COLUMN detail_requested_at timestamptz;
ALTER TABLE chain_v2.flap_holder_watches ADD COLUMN attempted_at timestamptz;
ALTER TABLE chain_v2.flap_holder_watches ADD COLUMN last_error text;
