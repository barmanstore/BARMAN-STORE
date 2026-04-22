ALTER TABLE customer_payment_score_snapshots
ADD COLUMN IF NOT EXISTS model_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE customer_credit_aging_snapshots
ADD COLUMN IF NOT EXISTS model_version INTEGER NOT NULL DEFAULT 1;
