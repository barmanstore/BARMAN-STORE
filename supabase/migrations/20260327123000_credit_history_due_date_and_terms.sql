ALTER TABLE credit_history
ADD COLUMN IF NOT EXISTS due_date DATE;

UPDATE credit_history
SET transaction_ts = COALESCE(transaction_ts, created_at)
WHERE transaction_ts IS NULL;

UPDATE credit_history
SET due_date = COALESCE(due_date, transaction_date, transaction_ts::date, created_at::date)
WHERE due_date IS NULL;

ALTER TABLE credit_history
ALTER COLUMN transaction_ts SET NOT NULL;

ALTER TABLE credit_history
ALTER COLUMN due_date SET NOT NULL;

ALTER TABLE customer_payment_score_snapshots
ADD COLUMN IF NOT EXISTS unapplied_credit NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE customer_credit_profiles
ADD COLUMN IF NOT EXISTS credit_terms_days INTEGER NOT NULL DEFAULT 0;
