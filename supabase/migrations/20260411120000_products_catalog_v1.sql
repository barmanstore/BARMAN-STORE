CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_text TEXT;

CREATE OR REPLACE FUNCTION products_sync_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text := LOWER(
    TRIM(
      CONCAT_WS(
        ' ',
        NULLIF(COALESCE(NEW.name, ''), ''),
        NULLIF(COALESCE(NEW.description, ''), ''),
        NULLIF(COALESCE(NEW.brand, ''), ''),
        NULLIF(COALESCE(NEW.sub_brand, ''), ''),
        NULLIF(COALESCE(NEW.content, ''), ''),
        NULLIF(COALESCE(NEW.color, ''), ''),
        NULLIF(COALESCE(NEW.category, ''), ''),
        NULLIF(COALESCE(NEW.subcategory, ''), ''),
        NULLIF(COALESCE(NEW.sku, ''), ''),
        NULLIF(COALESCE(NEW.barcode, ''), '')
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_text_sync ON products;
CREATE TRIGGER products_search_text_sync
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION products_sync_search_text();

UPDATE products
SET search_text = LOWER(
  TRIM(
    CONCAT_WS(
      ' ',
      NULLIF(COALESCE(name, ''), ''),
      NULLIF(COALESCE(description, ''), ''),
      NULLIF(COALESCE(brand, ''), ''),
      NULLIF(COALESCE(sub_brand, ''), ''),
      NULLIF(COALESCE(content, ''), ''),
      NULLIF(COALESCE(color, ''), ''),
      NULLIF(COALESCE(category, ''), ''),
      NULLIF(COALESCE(subcategory, ''), ''),
      NULLIF(COALESCE(sku, ''), ''),
      NULLIF(COALESCE(barcode, ''), '')
    )
  )
)
WHERE search_text IS NULL OR search_text = '';

CREATE INDEX IF NOT EXISTS idx_products_search_text_trgm
  ON products USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_list_created_at_id
  ON products (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_name_id
  ON products (LOWER(name), id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_brand_path_id
  ON products (
    LOWER(
      TRIM(
        COALESCE(brand, '')
        || CASE
          WHEN COALESCE(sub_brand, '') = '' THEN ''
          ELSE ' -> ' || COALESCE(sub_brand, '')
        END
      )
    ),
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_products_list_category_path_id
  ON products (
    LOWER(
      TRIM(
        COALESCE(category, '')
        || CASE
          WHEN COALESCE(subcategory, '') = '' THEN ''
          ELSE ' -> ' || COALESCE(subcategory, '')
        END
      )
    ),
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_products_list_price_id
  ON products (price, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_mrp_id
  ON products (mrp, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_stock_id
  ON products (stock, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_sku_id
  ON products (LOWER(sku), id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_barcode_id
  ON products (LOWER(barcode), id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_is_active_id
  ON products (is_active, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_default_discount_id
  ON products (default_discount, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_list_purchase_pack_size_id
  ON products (purchase_pack_size, id DESC);
