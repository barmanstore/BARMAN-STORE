const registerProductCategoryReassignRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeProductRecord,
    toNullablePositiveInt,
    getCategoryByIdAsync,
    getCategoryAncestryAsync,
    isCategoryNameUniqueViolation,
  } = deps;

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
      const childPath = ancestry
        .slice(1)
        .map((node) => String(node.name || '').trim())
        .filter(Boolean)
        .join(' -> ');

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
};

module.exports = { registerProductCategoryReassignRoutes };
