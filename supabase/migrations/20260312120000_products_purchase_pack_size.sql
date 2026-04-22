ALTER TABLE products
  ADD COLUMN IF NOT EXISTS purchase_pack_size NUMERIC(12,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_purchase_pack_size_positive'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_purchase_pack_size_positive
      CHECK (purchase_pack_size IS NULL OR purchase_pack_size > 0);
  END IF;
END $$;
