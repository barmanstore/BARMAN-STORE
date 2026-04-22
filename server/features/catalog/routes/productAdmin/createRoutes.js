const registerProductCreateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    findProductConflictAsync,
    resolveOrCreateCategoryHierarchyAsync,
  } = deps;

  app.post('/api/products', requireAdmin, async (req, res) => {
    try {
      const body = normalizeProductInput(req.body || {});
      const errors = validateProductPayload(body);
      if (errors.length)
        return res.status(400).json({ error: 'Validation failed', details: errors });
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
            conflict: duplicate,
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
      return res
        .status(201)
        .json(
          normalizeProductRecord(
            await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [result.lastInsertRowid])
          )
        );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductCreateRoutes };
