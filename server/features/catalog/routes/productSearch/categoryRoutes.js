const { loadActiveOffers, decorateProductWithOffers } = require('../../../offers/offerEngine');

const registerProductCategoryRoutes = (deps) => {
  const { app, dbAllAsync, normalizeProductRecord } = deps;

  app.get('/api/products/category/:category', async (req, res) => {
    try {
      const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
      const [rows, activeOffers] = await Promise.all([
        dbAllAsync(
          `SELECT * FROM products WHERE category = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'} ORDER BY created_at DESC`,
          [req.params.category]
        ),
        loadActiveOffers(dbAllAsync),
      ]);
      return res.json(
        rows.map((row) =>
          decorateProductWithOffers(normalizeProductRecord(row), activeOffers, {
            offersArePrepared: true,
          })
        )
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductCategoryRoutes };
