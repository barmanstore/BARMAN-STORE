ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS line_subtotal NUMERIC(12,2);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS offer_discount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS manual_discount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS offer_label TEXT;

UPDATE order_items
SET line_subtotal = COALESCE(line_subtotal, total);

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS line_subtotal NUMERIC(12,2);

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS offer_discount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS manual_discount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS offer_label TEXT;

UPDATE bill_items
SET line_subtotal = COALESCE(line_subtotal, amount + discount);

CREATE INDEX IF NOT EXISTS idx_order_items_order_offer_label
  ON order_items(order_id, offer_label);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill_offer_label
  ON bill_items(bill_id, offer_label);
