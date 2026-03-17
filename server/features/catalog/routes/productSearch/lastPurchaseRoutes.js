const registerProductLastPurchaseRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
  } = deps;

  app.get('/api/products/:id(\\d+)/last-purchase', requireAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      if (!productId) return res.status(400).json({ error: 'Invalid product id' });

      const row = await dbGetAsync(
        `SELECT
           poi.product_id,
           COALESCE(NULLIF(poi.rate, 0), poi.unit_price, 0) as rate,
           poi.unit_price,
           poi.gst_rate,
           poi.uom,
           po.distributor_id,
           d.name as distributor_name,
           po.po_number,
           po.created_at
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON po.id = poi.order_id
         LEFT JOIN distributors d ON d.id = po.distributor_id
         WHERE poi.product_id = ?
         ORDER BY po.created_at DESC, poi.id DESC
         LIMIT 1`,
        [productId]
      );

      if (!row) return res.json({ found: false, product_id: productId });
      return res.json({ found: true, ...row });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductLastPurchaseRoutes };
