const registerCategoryRoutes = (deps) => {
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

app.get('/api/categories', async (req, res) => {
  try {
    const includeAll = String(req.query?.scope || '').trim().toLowerCase() === 'all';
    let rows = await listCategoryRowsWithCountsAsync();
    if (!includeAll) {
      rows = rows.filter((row) => row.parent_id == null);
    }
    return res.json(rows);
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/tree', async (_, res) => {
  try {
    const rows = await listCategoryRowsWithCountsAsync();
    return res.json(buildCategoryTree(rows));
  } catch (error) {
    if (isCategoryNameUniqueViolation(error)) {
      return res.status(409).json({ error: 'A sibling category with this name already exists in the target parent' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/:id(\\d+)', async (req, res) => {
  try {
    const category = await getCategoryByIdAsync(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    return res.json(category);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/:id(\\d+)/products', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const category = await getCategoryByIdAsync(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = await dbAllAsync(
      `SELECT *
       FROM products
       WHERE category_id = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'}
       ORDER BY name ASC, id DESC`,
      [categoryId]
    );
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const name = normalizeCategoryName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const icon = normalizeCategoryIcon(req.body?.icon);
    const image = normalizeCategoryImage(req.body?.image);
    const imageWidth = toNullableImageDimension(req.body?.image_width ?? req.body?.imageWidth);
    const imageHeight = toNullableImageDimension(req.body?.image_height ?? req.body?.imageHeight);

    let parentId = null;
    if (hasOwn(req.body, 'parent_id')) {
      const rawParent = req.body?.parent_id;
      if (rawParent !== null && rawParent !== '') {
        parentId = toNullablePositiveInt(rawParent);
        if (!parentId) return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
      }
    }

    if (parentId) {
      const parent = await getCategoryByIdAsync(parentId);
      if (!parent) return res.status(404).json({ error: 'Parent category not found' });
    }

    const duplicate = await findCategoryByNameAndParentAsync({ name, parentId });
    if (duplicate) return res.status(409).json({ error: 'Category name already exists' });

    const result = await dbRunAsync(
      `INSERT INTO categories (name, description, icon, image, image_width, image_height, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        req.body?.description == null ? null : (String(req.body.description).trim() || null),
        icon,
        image,
        image ? imageWidth : null,
        image ? imageHeight : null,
        parentId,
      ]
    );
    return res.status(201).json(await getCategoryByIdAsync(result.lastInsertRowid));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const current = await getCategoryByIdAsync(categoryId);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const nextName = hasOwn(req.body, 'name')
      ? normalizeCategoryName(req.body?.name)
      : normalizeCategoryName(current.name);
    if (!nextName) return res.status(400).json({ error: 'Category name is required' });

    let nextParentId = current.parent_id == null ? null : Number(current.parent_id);
    if (hasOwn(req.body, 'parent_id')) {
      const rawParent = req.body?.parent_id;
      if (rawParent === null || rawParent === '') {
        nextParentId = null;
      } else {
        nextParentId = toNullablePositiveInt(rawParent);
        if (!nextParentId) return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
      }
    }
    if (nextParentId === categoryId) {
      return res.status(400).json({ error: 'A category cannot be its own parent' });
    }

    if (nextParentId) {
      const parent = await getCategoryByIdAsync(nextParentId);
      if (!parent) return res.status(404).json({ error: 'Parent category not found' });
      const allRows = await dbAllAsync(`SELECT id, parent_id FROM categories`);
      if (detectParentCycle(allRows, categoryId, nextParentId)) {
        return res.status(400).json({ error: 'Cannot move category inside its own subtree' });
      }
    }

    const duplicate = await findCategoryByNameAndParentAsync({
      name: nextName,
      parentId: nextParentId,
      excludeId: categoryId,
    });
    if (duplicate) return res.status(409).json({ error: 'Category name already exists' });

    const nextDescription = hasOwn(req.body, 'description')
      ? (req.body?.description == null ? null : (String(req.body.description).trim() || null))
      : current.description;
    const nextIcon = hasOwn(req.body, 'icon')
      ? normalizeCategoryIcon(req.body?.icon)
      : normalizeCategoryIcon(current.icon);
    const nextImage = hasOwn(req.body, 'image')
      ? normalizeCategoryImage(req.body?.image)
      : normalizeCategoryImage(current.image);
    const nextImageWidthInput = hasOwn(req.body, 'image_width') || hasOwn(req.body, 'imageWidth')
      ? req.body?.image_width ?? req.body?.imageWidth
      : current.image_width;
    const nextImageHeightInput = hasOwn(req.body, 'image_height') || hasOwn(req.body, 'imageHeight')
      ? req.body?.image_height ?? req.body?.imageHeight
      : current.image_height;
    const nextImageWidth = nextImage ? toNullableImageDimension(nextImageWidthInput) : null;
    const nextImageHeight = nextImage ? toNullableImageDimension(nextImageHeightInput) : null;

    await dbRunAsync(
      `UPDATE categories
       SET name = ?, description = ?, icon = ?, image = ?, image_width = ?, image_height = ?, parent_id = ?
       WHERE id = ?`,
      [nextName, nextDescription, nextIcon, nextImage, nextImageWidth, nextImageHeight, nextParentId, categoryId]
    );
    return res.json(await getCategoryByIdAsync(categoryId));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories/:id(\\d+)/move', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const current = await getCategoryByIdAsync(categoryId);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const rawParent = req.body?.parent_id;
    let nextParentId = null;
    if (rawParent !== null && rawParent !== '') {
      nextParentId = toNullablePositiveInt(rawParent);
      if (!nextParentId) return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
    }
    if (nextParentId === categoryId) return res.status(400).json({ error: 'A category cannot be its own parent' });
    if (nextParentId) {
      const parent = await getCategoryByIdAsync(nextParentId);
      if (!parent) return res.status(404).json({ error: 'Parent category not found' });
    }
    const allRows = await dbAllAsync(`SELECT id, parent_id FROM categories`);
    if (detectParentCycle(allRows, categoryId, nextParentId)) {
      return res.status(400).json({ error: 'Cannot move category inside its own subtree' });
    }
    if (!isSameParent(current.parent_id, nextParentId)) {
      const duplicate = await findCategoryByNameAndParentAsync({
        name: current.name,
        parentId: nextParentId,
        excludeId: categoryId,
      });
      if (duplicate) {
        return res.status(409).json({ error: 'A sibling category with this name already exists in the target parent' });
      }
    }

    await dbRunAsync(`UPDATE categories SET parent_id = ? WHERE id = ?`, [nextParentId, categoryId]);
    return res.json(await getCategoryByIdAsync(categoryId));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const categoryId = toNullablePositiveInt(req.params.id);
    if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
    const current = await getCategoryByIdAsync(categoryId);
    if (!current) return res.status(404).json({ error: 'Category not found' });

    const childrenCount = Number((await dbGetAsync(`SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?`, [categoryId]))?.count || 0);
    const directProductsCount = Number((await dbGetAsync(`SELECT COUNT(*) AS count FROM products WHERE category_id = ?`, [categoryId]))?.count || 0);
    const legacyProductsCount = Number((await dbGetAsync(
      `SELECT COUNT(*) AS count
       FROM products
       WHERE category_id IS NULL
         AND (lower(category) = lower(?) OR lower(COALESCE(subcategory, '')) = lower(?))`,
      [current.name, current.name]
    ))?.count || 0);

    if (childrenCount > 0 || directProductsCount > 0 || legacyProductsCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete category with child categories or linked products',
        details: {
          children: childrenCount,
          direct_products: directProductsCount,
          legacy_products: legacyProductsCount,
        },
      });
    }

    await dbRunAsync(`DELETE FROM categories WHERE id = ?`, [categoryId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  });
};

module.exports = { registerCategoryRoutes };

