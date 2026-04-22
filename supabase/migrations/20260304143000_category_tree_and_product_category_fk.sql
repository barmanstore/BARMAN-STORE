ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id
  ON categories(parent_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'categories_parent_id_fkey'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_parent_id_fkey
      FOREIGN KEY (parent_id)
      REFERENCES categories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products(category_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_category_id_fkey'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES categories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO categories (name, description)
SELECT DISTINCT BTRIM(p.category), CONCAT(BTRIM(p.category), ' products')
FROM products p
WHERE p.category IS NOT NULL
  AND BTRIM(p.category) <> ''
ON CONFLICT (name) DO NOTHING;

WITH category_pairs AS (
  SELECT DISTINCT
    BTRIM(p.category) AS parent_name,
    BTRIM(p.subcategory) AS child_name
  FROM products p
  WHERE p.category IS NOT NULL
    AND BTRIM(p.category) <> ''
    AND p.subcategory IS NOT NULL
    AND BTRIM(p.subcategory) <> ''
)
INSERT INTO categories (name, description, parent_id)
SELECT cp.child_name, CONCAT(cp.child_name, ' products'), parent.id
FROM category_pairs cp
INNER JOIN categories parent
  ON LOWER(parent.name) = LOWER(cp.parent_name)
ON CONFLICT (name) DO UPDATE
SET parent_id = EXCLUDED.parent_id;

UPDATE products p
SET category_id = (
  SELECT COALESCE(
    (
      SELECT child.id
      FROM categories parent
      INNER JOIN categories child ON child.parent_id = parent.id
      WHERE LOWER(parent.name) = LOWER(BTRIM(COALESCE(p.category, '')))
        AND LOWER(child.name) = LOWER(BTRIM(COALESCE(p.subcategory, '')))
      LIMIT 1
    ),
    (
      SELECT parent.id
      FROM categories parent
      WHERE LOWER(parent.name) = LOWER(BTRIM(COALESCE(p.category, '')))
      LIMIT 1
    )
  )
)
WHERE BTRIM(COALESCE(p.category, '')) <> '';
