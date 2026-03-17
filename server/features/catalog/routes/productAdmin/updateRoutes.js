const registerProductUpdateRoutes = (deps) => {
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
};

module.exports = { registerProductUpdateRoutes };
