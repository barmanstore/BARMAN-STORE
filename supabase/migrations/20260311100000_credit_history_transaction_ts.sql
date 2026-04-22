ALTER TABLE credit_history
ADD COLUMN IF NOT EXISTS transaction_ts TIMESTAMPTZ;

UPDATE credit_history
SET transaction_ts = COALESCE(
  transaction_ts,
  CASE
    WHEN transaction_date IS NOT NULL THEN
      (transaction_date::timestamp + (created_at AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC'
    ELSE created_at
  END
)
WHERE transaction_ts IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_history_user_transaction_ts
  ON credit_history (user_id, transaction_ts DESC, id DESC);
