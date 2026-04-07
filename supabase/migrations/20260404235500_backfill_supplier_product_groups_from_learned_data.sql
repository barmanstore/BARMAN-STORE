-- Ensure supplier-owned product groups exist and backfill them from supplier-specific learned data.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS products_supplied TEXT;

WITH manual_names AS (
  SELECT
    s.id AS supplier_id,
    NULLIF(BTRIM(part), '') AS product_name
  FROM suppliers s
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(s.products_supplied, ''), E'[\\n,;|]+') AS part
),
registry_names AS (
  SELECT
    sp.supplier_id,
    NULLIF(BTRIM(p.name), '') AS product_name
  FROM supplier_products sp
  INNER JOIN products p
    ON p.id = sp.product_id
  WHERE sp.supplier_id IS NOT NULL
),
history_names AS (
  SELECT
    po.supplier_id,
    NULLIF(BTRIM(COALESCE(p.name, poi.product_name)), '') AS product_name
  FROM purchase_orders po
  INNER JOIN purchase_order_items poi
    ON poi.order_id = po.id
  LEFT JOIN products p
    ON p.id = poi.product_id
  WHERE po.supplier_id IS NOT NULL
),
merged_names AS (
  SELECT supplier_id, product_name FROM manual_names
  UNION ALL
  SELECT supplier_id, product_name FROM registry_names
  UNION ALL
  SELECT supplier_id, product_name FROM history_names
),
deduped_names AS (
  SELECT
    supplier_id,
    LOWER(product_name) AS product_key,
    MIN(product_name) AS product_name
  FROM merged_names
  WHERE supplier_id IS NOT NULL
    AND product_name IS NOT NULL
  GROUP BY supplier_id, LOWER(product_name)
),
aggregated_names AS (
  SELECT
    supplier_id,
    STRING_AGG(product_name, ', ' ORDER BY LOWER(product_name), product_name) AS products_supplied
  FROM deduped_names
  GROUP BY supplier_id
)
UPDATE suppliers s
SET
  products_supplied = NULLIF(a.products_supplied, ''),
  updated_at = CURRENT_TIMESTAMP
FROM aggregated_names a
WHERE s.id = a.supplier_id
  AND COALESCE(NULLIF(BTRIM(s.products_supplied), ''), '') IS DISTINCT FROM COALESCE(NULLIF(BTRIM(a.products_supplied), ''), '');
