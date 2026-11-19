-- Active tokens may be discovered from verified trades before their launch is backfilled.
-- Preserve unknown launch facts rather than inventing a date or creator.
ALTER TABLE chain_v2.flap_tokens ALTER COLUMN created_block DROP NOT NULL;
ALTER TABLE chain_v2.flap_tokens ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE chain_v2.flap_tokens ALTER COLUMN creator DROP NOT NULL;
ALTER TABLE chain_v2.flap_tokens ALTER COLUMN metadata_cid DROP NOT NULL;
