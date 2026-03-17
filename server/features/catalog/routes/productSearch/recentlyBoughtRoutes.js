const registerRecentlyBoughtRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbAllAsync,
    normalizeProductRecord,
    clampInt,
  } = deps;

  app.get('/api/products/recently-bought', requireAuth, async (req, res) => {
    try {
      const userId = Number(req.authUser?.id || 0);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const limit = clampInt(req.query?.limit, 12, 1, 40);
      const rows = await dbAllAsync(
        `SELECT
           oi.product_id,
           MAX(o.created_at) AS last_bought_at,
           COUNT(DISTINCT o.id) AS total_orders,
           COALESCE(SUM(oi.quantity), 0) AS total_qty,
           p.*
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         INNER JOIN products p ON p.id = oi.product_id
         WHERE o.user_id = ?
           AND oi.product_id IS NOT NULL
           AND COALESCE(oi.is_manual, 0) = 0
           AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'rejected')
         GROUP BY oi.product_id, p.id
         ORDER BY MAX(o.created_at) DESC
         LIMIT ?`,
        [userId, limit]
      );
      const payload = rows.map((row) => ({
        product_id: Number(row.product_id || 0),
        last_bought_at: row.last_bought_at,
        total_orders: Number(row.total_orders || 0),
        total_qty: Number(row.total_qty || 0),
        product: normalizeProductRecord(row),
      }));
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to fetch recently bought products' });
    }
  });
};

module.exports = { registerRecentlyBoughtRoutes };
