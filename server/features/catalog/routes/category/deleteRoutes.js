const registerCategoryDeleteRoutes = (deps) => {
  const { app, requireAdmin, dbGetAsync, dbRunAsync, toNullablePositiveInt, getCategoryByIdAsync } =
    deps;

  app.delete('/api/categories/:id(\\d+)', requireAdmin, async (req, res) => {
    try {
      const categoryId = toNullablePositiveInt(req.params.id);
      if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
      const current = await getCategoryByIdAsync(categoryId);
      if (!current) return res.status(404).json({ error: 'Category not found' });

      const childrenCount = Number(
        (
          await dbGetAsync('SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?', [
            categoryId,
          ])
        )?.count || 0
      );
      const directProductsCount = Number(
        (
          await dbGetAsync('SELECT COUNT(*) AS count FROM products WHERE category_id = ?', [
            categoryId,
          ])
        )?.count || 0
      );
      const legacyProductsCount = Number(
        (
          await dbGetAsync(
            `SELECT COUNT(*) AS count
         FROM products
         WHERE category_id IS NULL
           AND (lower(category) = lower(?) OR lower(COALESCE(subcategory, '')) = lower(?))`,
            [current.name, current.name]
          )
        )?.count || 0
      );

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

      await dbRunAsync('DELETE FROM categories WHERE id = ?', [categoryId]);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCategoryDeleteRoutes };
