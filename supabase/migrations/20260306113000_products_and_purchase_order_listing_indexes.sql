CREATE INDEX IF NOT EXISTS idx_products_active_created_at
  ON products (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_category_created_at
  ON products (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_stock_created_at
  ON products (stock, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON purchase_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_distributor_created_at
  ON purchase_orders (distributor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_created_at
  ON purchase_orders (po_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_created_at
  ON purchase_orders (payment_status, created_at DESC);
