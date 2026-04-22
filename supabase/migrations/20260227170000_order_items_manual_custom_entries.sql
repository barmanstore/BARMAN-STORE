ALTER TABLE order_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS is_manual INTEGER NOT NULL DEFAULT 0;

UPDATE order_items oi
SET product_name = COALESCE(oi.product_name, p.name, 'Item')
FROM products p
WHERE oi.product_id = p.id
  AND (oi.product_name IS NULL OR BTRIM(oi.product_name) = '');

CREATE INDEX IF NOT EXISTS idx_order_items_order_manual
  ON order_items(order_id, is_manual);
