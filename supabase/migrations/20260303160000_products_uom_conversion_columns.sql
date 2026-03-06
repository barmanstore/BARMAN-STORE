ALTER TABLE products
  ADD COLUMN IF NOT EXISTS base_unit TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS uom_type TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(12,6);

UPDATE products
SET
  base_unit = COALESCE(NULLIF(TRIM(base_unit), ''), NULLIF(TRIM(uom), ''), 'pcs'),
  uom_type = CASE
    WHEN LOWER(TRIM(COALESCE(uom_type, ''))) IN ('selling', 'purchasing', 'both')
      THEN LOWER(TRIM(uom_type))
    ELSE 'selling'
  END,
  conversion_factor = CASE
    WHEN conversion_factor IS NULL OR conversion_factor <= 0 THEN 1
    ELSE conversion_factor
  END;

ALTER TABLE products
  ALTER COLUMN base_unit SET NOT NULL,
  ALTER COLUMN base_unit SET DEFAULT 'pcs',
  ALTER COLUMN uom_type SET NOT NULL,
  ALTER COLUMN uom_type SET DEFAULT 'selling',
  ALTER COLUMN conversion_factor SET NOT NULL,
  ALTER COLUMN conversion_factor SET DEFAULT 1;
