ALTER TABLE chain_v2.flap_tokens ADD COLUMN metadata_json jsonb;
ALTER TABLE chain_v2.flap_tokens ADD COLUMN metadata_checked_at timestamptz;
