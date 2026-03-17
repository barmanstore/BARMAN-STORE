const registerProductDetailRoutes = (deps) => {
  const {
    app,
    dbGetAsync,
    normalizeProductRecord,
  } = deps;

  app.get('/api/products/:id(\\d+)', async (req, res) => {
    try {
      const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
      const product = await dbGetAsync(
        `SELECT * FROM products WHERE id = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'}`,
        [req.params.id]
      );
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.json(normalizeProductRecord(product));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductDetailRoutes };
