ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS unit_price_before_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_incl_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total_incl_tax NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE purchase_order_items
SET unit_price_before_discount = COALESCE(NULLIF(unit_price_before_discount, 0), unit_price, rate, 0),
    tax_rate = COALESCE(NULLIF(tax_rate, 0), gst_rate, 0),
    unit_tax_amount = CASE
      WHEN quantity <> 0 THEN COALESCE(NULLIF(unit_tax_amount, 0), COALESCE(tax_amount, 0) / quantity)
      ELSE COALESCE(unit_tax_amount, 0)
    END,
    unit_cost_incl_tax = CASE
      WHEN quantity <> 0 THEN COALESCE(NULLIF(unit_cost_incl_tax, 0), COALESCE(line_total, total, 0) / quantity)
      ELSE COALESCE(unit_cost_incl_tax, 0)
    END,
    line_total_incl_tax = COALESCE(NULLIF(line_total_incl_tax, 0), line_total, total, 0),
    unit_discount_amount = CASE
      WHEN quantity = 0 THEN COALESCE(unit_discount_amount, 0)
      WHEN discount_type = 'percent' AND COALESCE(discount_value, 0) > 0
        THEN COALESCE(
          NULLIF(unit_discount_amount, 0),
          ((COALESCE(taxable_value, 0) / NULLIF(1 - (discount_value / 100.0), 0)) - COALESCE(taxable_value, 0)) / quantity
        )
      WHEN discount_type = 'fixed' AND COALESCE(discount_value, 0) > 0
        THEN COALESCE(NULLIF(unit_discount_amount, 0), discount_value / quantity)
      ELSE COALESCE(unit_discount_amount, 0)
    END;

CREATE TABLE IF NOT EXISTS supplier_products (
  id BIGSERIAL PRIMARY KEY,
  distributor_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  last_known_unit_cost_incl_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_order_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  lead_time_days INTEGER,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  availability_note TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_unique
  ON supplier_products (distributor_id, product_id);

CREATE INDEX IF NOT EXISTS idx_supplier_products_product
  ON supplier_products (product_id);

CREATE INDEX IF NOT EXISTS idx_supplier_products_distributor
  ON supplier_products (distributor_id);

CREATE TABLE IF NOT EXISTS product_cost_history (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  distributor_id BIGINT NOT NULL,
  po_id BIGINT,
  po_item_id BIGINT,
  unit_cost_incl_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  transaction_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_cost_history_product
  ON product_cost_history (product_id, transaction_ts DESC);

CREATE INDEX IF NOT EXISTS idx_product_cost_history_distributor
  ON product_cost_history (distributor_id, transaction_ts DESC);

CREATE INDEX IF NOT EXISTS idx_product_cost_history_po
  ON product_cost_history (po_id);

CREATE TABLE IF NOT EXISTS product_insights_daily (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  date_key DATE NOT NULL,
  avg_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  qty_purchased NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_lead_time INTEGER,
  last_po_date DATE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_insights_daily_unique
  ON product_insights_daily (product_id, date_key);

CREATE INDEX IF NOT EXISTS idx_product_insights_daily_date
  ON product_insights_daily (date_key DESC);

INSERT INTO product_cost_history (
  product_id,
  distributor_id,
  po_id,
  po_item_id,
  unit_cost_incl_tax,
  tax_rate,
  discount_amount,
  transaction_ts
)
SELECT
  poi.product_id,
  po.distributor_id,
  poi.order_id,
  poi.id,
  CASE
    WHEN COALESCE(poi.quantity, 0) <> 0
      THEN COALESCE(poi.line_total_incl_tax, poi.line_total, poi.total, 0) / poi.quantity
    ELSE 0
  END,
  COALESCE(poi.tax_rate, poi.gst_rate, 0),
  COALESCE(poi.unit_discount_amount, 0),
  COALESCE(
    po.planned_order_date::timestamptz,
    po.expected_delivery::timestamptz,
    po.created_at,
    CURRENT_TIMESTAMP
  )
FROM purchase_order_items poi
INNER JOIN purchase_orders po ON po.id = poi.order_id
LEFT JOIN product_cost_history pch ON pch.po_item_id = poi.id
WHERE poi.product_id IS NOT NULL
  AND pch.id IS NULL;

INSERT INTO supplier_products (distributor_id, product_id, last_known_unit_cost_incl_tax, last_updated_at)
SELECT
  po.distributor_id,
  poi.product_id,
  MAX(
    CASE
      WHEN COALESCE(poi.quantity, 0) <> 0
        THEN COALESCE(poi.line_total_incl_tax, poi.line_total, poi.total, 0) / poi.quantity
      ELSE 0
    END
  ) AS last_known_unit_cost_incl_tax,
  MAX(COALESCE(po.created_at, CURRENT_TIMESTAMP)) AS last_updated_at
FROM purchase_order_items poi
INNER JOIN purchase_orders po ON po.id = poi.order_id
WHERE poi.product_id IS NOT NULL
GROUP BY po.distributor_id, poi.product_id
ON CONFLICT (distributor_id, product_id)
DO UPDATE SET
  last_known_unit_cost_incl_tax = EXCLUDED.last_known_unit_cost_incl_tax,
  last_updated_at = EXCLUDED.last_updated_at;
