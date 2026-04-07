-- Add supplier child entity under distributors and link supplier products + purchase orders.

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  distributor_id BIGINT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  alt_phone TEXT,
  schedule_type TEXT NOT NULL DEFAULT 'irregular',
  schedule_day TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_distributor
  ON suppliers (distributor_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers (distributor_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_primary_per_distributor
  ON suppliers (distributor_id)
  WHERE is_primary = TRUE;

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT;

INSERT INTO suppliers (
  distributor_id,
  name,
  phone,
  schedule_type,
  schedule_day,
  is_active,
  is_primary
)
SELECT
  d.id,
  COALESCE(NULLIF(TRIM(d.salesman_name), ''), d.name),
  NULLIF(TRIM(d.contacts), ''),
  CASE
    WHEN LOWER(COALESCE(d.order_day, d.visit_day, d.delivery_day, '')) IN ('daily', 'everyday', 'regular') THEN 'daily'
    WHEN LOWER(COALESCE(d.order_day, d.visit_day, d.delivery_day, '')) IN ('irregular', 'varies', 'none', '') THEN 'irregular'
    ELSE 'weekly'
  END,
  CASE
    WHEN LOWER(COALESCE(d.order_day, d.visit_day, d.delivery_day, '')) IN ('daily', 'everyday', 'regular', 'irregular', 'varies', 'none', '') THEN NULL
    ELSE INITCAP(TRIM(COALESCE(d.order_day, d.visit_day, d.delivery_day)))
  END,
  CASE
    WHEN LOWER(COALESCE(d.status, 'active')) = 'active' THEN TRUE
    ELSE FALSE
  END,
  TRUE
FROM distributors d
WHERE NOT EXISTS (
  SELECT 1
  FROM suppliers s
  WHERE s.distributor_id = d.id
    AND s.is_primary = TRUE
);

UPDATE supplier_products sp
SET supplier_id = s.id
FROM suppliers s
WHERE sp.distributor_id = s.distributor_id
  AND s.is_primary = TRUE
  AND sp.supplier_id IS NULL;

DELETE FROM supplier_products sp
WHERE sp.supplier_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM distributors d
    WHERE d.id = sp.distributor_id
  );

UPDATE purchase_orders po
SET supplier_id = s.id
FROM suppliers s
WHERE po.distributor_id = s.distributor_id
  AND s.is_primary = TRUE
  AND po.supplier_id IS NULL;

ALTER TABLE supplier_products
  ALTER COLUMN supplier_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_products_supplier_fk'
  ) THEN
    ALTER TABLE supplier_products
      ADD CONSTRAINT supplier_products_supplier_fk
      FOREIGN KEY (supplier_id)
      REFERENCES suppliers(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_supplier_fk'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_supplier_fk
      FOREIGN KEY (supplier_id)
      REFERENCES suppliers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_supplier_products_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_unique
  ON supplier_products (supplier_id, product_id);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier
  ON supplier_products (supplier_id);

ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
