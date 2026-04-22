const { loadActiveOffers, decorateProductWithOffers } = require('../../../offers/offerEngine');

const registerProductSuggestRoutes = (deps) => {
  const { app, dbAllAsync, normalizeSearchText, clampInt, normalizeProductRecord } = deps;

  app.get('/api/products/suggest', async (req, res) => {
    try {
      const query = normalizeSearchText(req.query?.q || req.query?.query || '', 80);
      if (!query || query.length < 2) return res.json({ items: [] });
      const limit = clampInt(req.query?.limit, 8, 1, 12);

      const like = `%${query.toLowerCase()}%`;
      const prefix = `${query.toLowerCase()}%`;
      const rows = await dbAllAsync(
        `SELECT id, name, brand, content, uom, price, mrp, image, stock, category
         FROM products
         WHERE COALESCE(is_active, 1) = 1
           AND (
             LOWER(name) LIKE ?
             OR LOWER(brand) LIKE ?
             OR LOWER(category) LIKE ?
             OR LOWER(subcategory) LIKE ?
           )
         ORDER BY
           CASE
             WHEN LOWER(name) LIKE ? THEN 0
             WHEN LOWER(brand) LIKE ? THEN 1
             ELSE 2
           END,
           LOWER(name) ASC,
           id DESC
         LIMIT ?`,
        [like, like, like, like, prefix, prefix, limit]
      );

      const activeOffers = await loadActiveOffers(dbAllAsync);
      const items = (Array.isArray(rows) ? rows : []).map((row) => {
        const normalized = decorateProductWithOffers(normalizeProductRecord(row), activeOffers, {
          offersArePrepared: true,
        });
        return {
          id: Number(normalized.id || 0),
          name: String(normalized.name || '').trim() || 'Product',
          brand: String(normalized.brand || '').trim(),
          size: String(normalized.content || normalized.uom || '').trim(),
          price: Number(normalized.price || 0),
          mrp: Number(normalized.mrp || 0),
          image: String(normalized.image || '').trim(),
          category: String(normalized.category || '').trim(),
          stock: Number(normalized.stock || 0),
          offer_display: normalized.offer_display || null,
          active_offer_labels: Array.isArray(normalized.active_offer_labels)
            ? normalized.active_offer_labels
            : [],
        };
      });

      return res.json({ items });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to fetch suggestions' });
    }
  });
};

module.exports = { registerProductSuggestRoutes };
