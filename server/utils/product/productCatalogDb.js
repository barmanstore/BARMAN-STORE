const createProductCatalogDb = ({
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  SQL_INSERT_IGNORE_CATEGORY,
  normalizeTextKey,
  normalizeMoneyValue,
  toPositiveIntOrNull,
}) => {
  const findProductConflictAsync = async (payload, { excludeId = null } = {}) => {
    const sku = normalizeTextKey(payload?.sku);
    if (sku) {
      const bySku = excludeId
        ? await dbGetAsync(`SELECT * FROM products WHERE lower(sku) = ? AND id != ?`, [sku, excludeId])
        : await dbGetAsync(`SELECT * FROM products WHERE lower(sku) = ?`, [sku]);
      if (bySku) {
        return {
          severity: 'error',
          message: `SKU already exists (product: ${bySku.name || bySku.id})`,
        };
      }
    }

    const barcode = normalizeTextKey(payload?.barcode);
    if (barcode) {
      const byBarcode = excludeId
        ? await dbGetAsync(`SELECT * FROM products WHERE lower(barcode) = ? AND id != ?`, [barcode, excludeId])
        : await dbGetAsync(`SELECT * FROM products WHERE lower(barcode) = ?`, [barcode]);
      if (byBarcode) {
        return {
          severity: 'error',
          message: `Barcode already exists (product: ${byBarcode.name || byBarcode.id})`,
        };
      }
    }

    const nameKey = normalizeTextKey(payload?.name);
    const brandKey = normalizeTextKey(payload?.brand);
    const subBrandKey = normalizeTextKey(payload?.sub_brand);
    const contentKey = normalizeTextKey(payload?.content);
    const colorKey = normalizeTextKey(payload?.color);
    if (!nameKey) return null;

    const byNameBrand = excludeId
      ? await dbAllAsync(
        `SELECT * FROM products
         WHERE lower(name) = ?
           AND lower(COALESCE(brand, '')) = ?
           AND lower(COALESCE(sub_brand, '')) = ?
           AND lower(COALESCE(content, '')) = ?
           AND lower(COALESCE(color, '')) = ?
           AND id != ?`,
        [nameKey, brandKey, subBrandKey, contentKey, colorKey, excludeId]
      )
      : await dbAllAsync(
        `SELECT * FROM products
         WHERE lower(name) = ?
           AND lower(COALESCE(brand, '')) = ?
           AND lower(COALESCE(sub_brand, '')) = ?
           AND lower(COALESCE(content, '')) = ?
           AND lower(COALESCE(color, '')) = ?`,
        [nameKey, brandKey, subBrandKey, contentKey, colorKey]
      );

    if (!byNameBrand || byNameBrand.length === 0) return null;
    const price = normalizeMoneyValue(payload?.price);
    const mrp = normalizeMoneyValue(payload?.mrp);
    if (price === null || mrp === null) {
      return {
        severity: 'confirm',
        message: `Possible duplicate product exists (${byNameBrand[0].name || byNameBrand[0].id})`,
      };
    }

    const sameContentDifferentPrice = byNameBrand.find((row) =>
      normalizeMoneyValue(row.price) !== price || normalizeMoneyValue(row.mrp) !== mrp
    );
    if (sameContentDifferentPrice) {
      return {
        severity: 'confirm',
        message: `Same product with different pricing exists (${sameContentDifferentPrice.name || sameContentDifferentPrice.id})`,
      };
    }

    const matchingVariantRows = byNameBrand.filter((row) => (
      normalizeMoneyValue(row.price) === price && normalizeMoneyValue(row.mrp) === mrp
    ));
    const exact = matchingVariantRows.find((row) => normalizeTextKey(row.sku) === sku);
    if (exact) {
      return {
        severity: 'confirm',
        message: `Exact product variant already exists (${exact.name || exact.id})`,
      };
    }
    const firstMatch = matchingVariantRows[0] || byNameBrand[0];
    return {
      severity: 'confirm',
      message: `Similar product variant exists (${firstMatch?.name || firstMatch?.id})`,
    };
  };

  const findExistingProductForImportAsync = async (row) => {
    const id = toPositiveIntOrNull(row.id);
    if (id) {
      const byId = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [id]);
      if (byId) return byId;
    }
    const sku = String(row.sku || '').trim();
    if (sku) {
      const bySku = await dbGetAsync(`SELECT * FROM products WHERE lower(sku) = ?`, [sku.toLowerCase()]);
      if (bySku) return bySku;
    }
    const barcode = String(row.barcode || '').trim();
    if (barcode) {
      const byBarcode = await dbGetAsync(`SELECT * FROM products WHERE lower(barcode) = ?`, [barcode.toLowerCase()]);
      if (byBarcode) return byBarcode;
    }
    return null;
  };

  const resolveOrCreateCategoryNameAsync = async (inputCategory) => {
    const requested = String(inputCategory || '').trim() || 'Groceries';
    const existing = await dbGetAsync(
      `SELECT name
       FROM categories
       WHERE parent_id IS NULL
         AND lower(name) = lower(?)`,
      [requested]
    );
    if (existing?.name) return existing.name;
    await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [requested, 'Product category']);
    return requested;
  };

  return {
    findProductConflictAsync,
    findExistingProductForImportAsync,
    resolveOrCreateCategoryNameAsync,
  };
};

module.exports = { createProductCatalogDb };
