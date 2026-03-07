ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS icon TEXT;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image TEXT;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_width INTEGER;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_height INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_categories_image_width_range'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT chk_categories_image_width_range
      CHECK (image_width IS NULL OR image_width BETWEEN 16 AND 4096);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_categories_image_height_range'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT chk_categories_image_height_range
      CHECK (image_height IS NULL OR image_height BETWEEN 16 AND 4096);
  END IF;
END $$;
