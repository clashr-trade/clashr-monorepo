ALTER TABLE product_config ADD COLUMN halted boolean NOT NULL DEFAULT false;
ALTER TABLE verified_bnb_trades ADD COLUMN approvals jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE verified_bnb_trades ADD COLUMN eligible boolean NOT NULL DEFAULT false;
