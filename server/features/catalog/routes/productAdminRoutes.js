const registerProductAdminRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    XLSX,
    toProductExportRow,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
    cleanupExpiredImportBatches,
    parseProductFileToRows,
    findExistingProductForImportAsync,
    normalizeTextKey,
    buildProductExactKey,
    crypto,
    createImportBatchChecksum,
    PRODUCT_IMPORT_BATCH_TTL_MS,
    productImportBatches,
    SQL_UPSERT_IMPORT_BATCH,
    applyProductImportBatch,
    zlib,
    clampInt,
    normalizeSearchText,
    PRODUCTS_LIST_PUBLIC_MAX_AGE_SEC,
    PRODUCTS_LIST_PUBLIC_S_MAX_AGE_SEC,
    PRODUCTS_LIST_PUBLIC_STALE_WHILE_REVALIDATE_SEC,
    PRODUCTS_LIST_COMPRESS_MIN_BYTES,
    appendVaryHeader,
    setProductsListCacheHeaders,
    sendJsonWithOptionalCompression,
    toSearchImage,
    hasOwn,
    toNullablePositiveInt,
    normalizeCategoryName,
    normalizeCategoryIcon,
    normalizeCategoryImage,
    toNullableImageDimension,
    isSameParent,
    findCategoryByNameAndParentAsync,
    splitHierarchySegments,
    isCategoryNameUniqueViolation,
    normalizeCategoryRow,
    getCategoryByIdAsync,
    ensureCategoryNodeAsync,
    resolveOrCreateCategoryHierarchyAsync,
    listCategoryRowsWithCountsAsync,
    buildCategoryTree,
    getCategoryAncestryAsync,
    detectParentCycle,
  } = deps;

app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const body = normalizeProductInput(req.body || {});
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const duplicate = await findProductConflictAsync(body);
    if (duplicate) {
      const allowIdentical = Boolean(req.body?.allow_identical);
      if (duplicate.severity === 'confirm' && allowIdentical) {
        // allowed by explicit user choice
      } else {
        return res.status(409).json({
          error: duplicate.message,
          field: duplicate.field,
          conflict_type: duplicate.conflict_type,
          conflict: duplicate
        });
      }
    }
    const categoryResolution = await resolveOrCreateCategoryHierarchyAsync({
      category: body.category || 'Groceries',
      subcategory: body.subcategory || null,
    });
    const result = await dbRunAsync(
      `INSERT INTO products
      (name, description, brand, sub_brand, content, color, price, mrp, uom, base_unit, uom_type, conversion_factor, purchase_pack_size, sku, barcode, image, stock, category, subcategory, category_id, expiry_date, default_discount, discount_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || null,
        body.brand || null,
        body.sub_brand || null,
        body.content || null,
        body.color || null,
        Number(body.price || 0),
        body.mrp != null ? Number(body.mrp) : Number(body.price || 0),
        body.uom || 'pcs',
        body.base_unit || body.uom || 'pcs',
        body.uom_type || 'selling',
        Number(body.conversion_factor || 1),
        body.purchase_pack_size ?? null,
        body.sku,
        body.barcode,
        body.image || null,
        Number(body.stock || 0),
        categoryResolution.categoryName,
        categoryResolution.subcategoryName || null,
        categoryResolution.categoryId,
        body.expiry_date || null,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
      ]
    );
    return res.status(201).json(normalizeProductRecord(await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [result.lastInsertRowid])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    const body = normalizeProductInput(req.body || {}, current);
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    if (Number(current.is_active ?? 1) !== 1) {
      body.is_active = 1;
    }
    const duplicate = await findProductConflictAsync(body, { excludeId: req.params.id });
    if (duplicate) {
      const allowIdentical = Boolean(req.body?.allow_identical);
      if (duplicate.severity === 'confirm' && allowIdentical) {
        // allowed by explicit user choice
      } else {
        return res.status(409).json({
          error: duplicate.message,
          field: duplicate.field,
          conflict_type: duplicate.conflict_type,
          conflict: duplicate
        });
      }
    }
    const categoryResolution = await resolveOrCreateCategoryHierarchyAsync({
      category: body.category || current.category || 'Groceries',
      subcategory: body.subcategory ?? current.subcategory ?? null,
    });
    await dbRunAsync(
      `UPDATE products SET
       name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, base_unit=?, uom_type=?, conversion_factor=?, purchase_pack_size=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, category_id=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
       WHERE id=?`,
      [
        body.name,
        body.description,
        body.brand,
        body.sub_brand,
        body.content,
        body.color,
        Number(body.price),
        Number(body.mrp),
        body.uom,
        body.base_unit || body.uom || 'pcs',
        body.uom_type || 'selling',
        Number(body.conversion_factor || 1),
        body.purchase_pack_size ?? null,
        body.sku,
        body.barcode,
        body.image,
        Number(body.stock),
        categoryResolution.categoryName,
        categoryResolution.subcategoryName,
        categoryResolution.categoryId,
        body.expiry_date,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
        req.params.id,
      ]
    );
    return res.json(normalizeProductRecord(await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/products/:id(\\d+)/category', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const categoryId = toNullablePositiveInt(req.body?.category_id);
    if (!categoryId) {
      return res.status(400).json({ error: 'category_id is required' });
    }

    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!current) return res.status(404).json({ error: 'Product not found' });

    const targetCategory = await getCategoryByIdAsync(categoryId);
    if (!targetCategory) return res.status(404).json({ error: 'Target category not found' });

    const ancestry = await getCategoryAncestryAsync(categoryId);
    if (!ancestry.length) {
      return res.status(400).json({ error: 'Unable to resolve target category hierarchy' });
    }

    const rootCategory = ancestry[0];
    const childPath = ancestry.slice(1).map((node) => String(node.name || '').trim()).filter(Boolean).join(' -> ');

    await dbRunAsync(
      `UPDATE products
       SET category_id = ?, category = ?, subcategory = ?
       WHERE id = ?`,
      [categoryId, rootCategory.name, childPath || null, productId]
    );

    const updated = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    await logAdminAuditAsync(req, {
      action: 'product.category_reassign',
      entityType: 'product',
      entityId: productId,
      details: {
        from_category_id: current.category_id || null,
        to_category_id: categoryId,
      },
    });
    return res.json(normalizeProductRecord(updated));
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    await dbRunAsync(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'product.deactivate',
      entityType: 'product',
      entityId: req.params.id,
      details: { name: current.name || null },
    });
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const doesTableExistAsync = async (tableName) => Boolean(
  (await dbGetAsync(
    `SELECT 1 AS ok
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ?
     LIMIT 1`,
    [tableName]
  ))?.ok
);

app.delete('/api/products/:id(\\d+)/permanent', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!current) return res.status(404).json({ error: 'Product not found' });

    const referenceChecks = [
      { table: 'order_items', sql: `SELECT COUNT(*) as count FROM order_items WHERE product_id = ?` },
      { table: 'purchase_order_items', sql: `SELECT COUNT(*) as count FROM purchase_order_items WHERE product_id = ?` },
      { table: 'purchase_return_items', sql: `SELECT COUNT(*) as count FROM purchase_return_items WHERE product_id = ?` },
      { table: 'stock_ledger', sql: `SELECT COUNT(*) as count FROM stock_ledger WHERE product_id = ?` },
      { table: 'batch_stock', sql: `SELECT COUNT(*) as count FROM batch_stock WHERE product_id = ?` },
    ];

    const blockingRefs = [];
    for (const check of referenceChecks) {
      if (!await doesTableExistAsync(check.table)) continue;
      const count = Number((await dbGetAsync(check.sql, [productId]))?.count || 0);
      if (count > 0) blockingRefs.push(`${check.table} (${count})`);
    }
    if (blockingRefs.length) {
      return res.status(409).json({
        error: `Cannot permanently delete product. Referenced in: ${blockingRefs.join(', ')}`,
        references: blockingRefs,
      });
    }

    await dbRunAsync(`DELETE FROM products WHERE id = ?`, [productId]);
    await logAdminAuditAsync(req, {
      action: 'product.permanent_delete',
      entityType: 'product',
      entityId: productId,
      details: { name: current.name || null },
    });
    return res.json({ success: true, message: 'Product permanently deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

};

module.exports = { registerProductAdminRoutes };

