ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS strict_due_date DATE,
  ADD COLUMN IF NOT EXISTS strict_due_note TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_strict_due_date
  ON purchase_orders (strict_due_date)
  WHERE strict_due_date IS NOT NULL;
