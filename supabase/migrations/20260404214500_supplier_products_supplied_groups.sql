-- Add supplier-owned supplied product group text and backfill safe one-to-one cases.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS products_supplied TEXT;

UPDATE suppliers s
SET
  products_supplied = NULLIF(BTRIM(d.products_supplied), ''),
  updated_at = CURRENT_TIMESTAMP
FROM distributors d
WHERE d.id = s.distributor_id
  AND s.distributor_id IN (
    SELECT distributor_id
    FROM suppliers
    GROUP BY distributor_id
    HAVING COUNT(*) = 1
  )
  AND COALESCE(NULLIF(BTRIM(s.products_supplied), ''), '') = ''
  AND COALESCE(NULLIF(BTRIM(d.products_supplied), ''), '') <> '';
