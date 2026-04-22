ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_status TEXT NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS purchase_order_payments (
  id BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL,
  distributor_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT,
  reference TEXT,
  notes TEXT,
  transaction_date DATE,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_payments_po_id
  ON purchase_order_payments (purchase_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_order_payments_distributor_id
  ON purchase_order_payments (distributor_id, created_at DESC);

UPDATE purchase_orders
SET po_status = CASE
  WHEN LOWER(COALESCE(status, '')) IN ('confirmed', 'shipped', 'received') THEN 'processed'
  WHEN LOWER(COALESCE(status, '')) = 'cancelled' THEN 'cancelled'
  ELSE 'registered'
END
WHERE po_status IS NULL OR TRIM(po_status) = '';

UPDATE purchase_orders
SET paid_amount = 0
WHERE paid_amount IS NULL OR paid_amount < 0;

UPDATE purchase_orders
SET balance_due = GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(paid_amount, 0));

UPDATE purchase_orders
SET payment_status = CASE
  WHEN COALESCE(total_amount, total, 0) <= 0 THEN 'unpaid'
  WHEN COALESCE(paid_amount, 0) <= 0 THEN 'unpaid'
  WHEN COALESCE(paid_amount, 0) >= COALESCE(total_amount, total, 0) THEN 'paid'
  ELSE 'part_paid'
END
WHERE payment_status IS NULL OR TRIM(payment_status) = '';

UPDATE purchase_orders
SET processed_at = COALESCE(processed_at, updated_at, created_at)
WHERE po_status = 'processed';
