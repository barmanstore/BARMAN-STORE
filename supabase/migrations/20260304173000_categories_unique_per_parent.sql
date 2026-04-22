DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'categories_name_key'
  ) THEN
    ALTER TABLE categories
      DROP CONSTRAINT categories_name_key;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(parent_id, 0), LOWER(name)
      ORDER BY id
    ) AS rn
  FROM categories
)
UPDATE categories c
SET name = CONCAT(c.name, ' #', c.id)
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_parent_name_ci
  ON categories ((COALESCE(parent_id, 0)), LOWER(name));
