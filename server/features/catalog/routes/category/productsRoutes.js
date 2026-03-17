const registerCategoryProductsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    normalizeProductRecord,
    toNullablePositiveInt,
    getCategoryByIdAsync,
  } = deps;

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
};

module.exports = { registerCategoryProductsRoutes };
