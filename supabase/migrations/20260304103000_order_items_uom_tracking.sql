ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS uom TEXT;

UPDATE order_items oi
SET uom = COALESCE(NULLIF(BTRIM(oi.uom), ''), NULLIF(BTRIM(p.uom), ''), 'pcs')
FROM products p
WHERE COALESCE(oi.product_id, 0) > 0
  AND oi.product_id = p.id;

UPDATE order_items
SET uom = COALESCE(NULLIF(BTRIM(uom), ''), 'pcs');

ALTER TABLE order_items
  ALTER COLUMN uom SET DEFAULT 'pcs',
  ALTER COLUMN uom SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_uom
  ON order_items(order_id, uom);
