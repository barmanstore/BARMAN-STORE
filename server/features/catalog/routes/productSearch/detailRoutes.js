const {
  loadActiveOffers,
  decorateProductWithOffers,
} = require('../../../offers/offerEngine');

const registerProductDetailRoutes = (deps) => {
  const {
    app,
    dbAllAsync,
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
      const activeOffers = await loadActiveOffers(dbAllAsync);
      return res.json(decorateProductWithOffers(normalizeProductRecord(product), activeOffers, { offersArePrepared: true }));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductDetailRoutes };
