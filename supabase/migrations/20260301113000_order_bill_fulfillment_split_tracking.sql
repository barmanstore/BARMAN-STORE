ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS requested_qty NUMERIC(12,3);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS available_now_qty NUMERIC(12,3);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS fulfilled_qty NUMERIC(12,3) NOT NULL DEFAULT 0;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pending_qty NUMERIC(12,3);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS stock_snapshot NUMERIC(12,3);

UPDATE order_items
SET requested_qty = COALESCE(requested_qty, quantity);

UPDATE order_items
SET available_now_qty = COALESCE(available_now_qty, fulfilled_qty, 0);

UPDATE order_items
SET pending_qty = COALESCE(
  pending_qty,
  GREATEST(0, COALESCE(requested_qty, quantity) - COALESCE(available_now_qty, 0))
);

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS requested_qty NUMERIC(12,3);

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS available_now_qty NUMERIC(12,3);

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS fulfilled_qty NUMERIC(12,3) NOT NULL DEFAULT 0;

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS pending_qty NUMERIC(12,3);

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS stock_snapshot NUMERIC(12,3);

UPDATE bill_items
SET requested_qty = COALESCE(requested_qty, qty);

UPDATE bill_items
SET available_now_qty = COALESCE(available_now_qty, fulfilled_qty, requested_qty, qty, 0);

UPDATE bill_items
SET pending_qty = COALESCE(
  pending_qty,
  GREATEST(0, COALESCE(requested_qty, qty) - COALESCE(available_now_qty, 0))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_pending
  ON order_items(order_id, pending_qty);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill_pending
  ON bill_items(bill_id, pending_qty);
