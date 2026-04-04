ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS row_source TEXT NOT NULL DEFAULT 'manual';

UPDATE purchase_order_items
SET row_source = CASE
  WHEN LOWER(COALESCE(row_source, 'manual')) = 'supplier' THEN 'supplier'
  ELSE 'manual'
END;
