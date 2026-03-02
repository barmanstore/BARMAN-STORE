ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS order_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_order_id
  ON bills (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bills_order_id_created
  ON bills (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;
