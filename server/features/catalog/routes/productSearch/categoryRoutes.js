const registerProductCategoryRoutes = (deps) => {
  const {
    app,
    dbAllAsync,
    normalizeProductRecord,
  } = deps;

  app.get('/api/products/category/:category', async (req, res) => {
    try {
      const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
      const rows = await dbAllAsync(
        `SELECT * FROM products WHERE category = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'} ORDER BY created_at DESC`,
        [req.params.category]
      );
      return res.json(rows.map(normalizeProductRecord));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductCategoryRoutes };
