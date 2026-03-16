const registerSupplierInsightsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
  } = deps;

  app.get('/api/products/:id(\\d+)/suppliers', requireAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id || 0);
      if (!productId) return res.status(400).json({ error: 'Invalid product id' });

      const rows = await dbAllAsync(
        `SELECT
           sp.distributor_id,
           d.name as distributor_name,
           sp.is_available,
           sp.lead_time_days,
           sp.min_order_qty,
           sp.last_known_unit_cost_incl_tax,
           sp.availability_note,
           sp.last_updated_at,
           MAX(pch.transaction_ts) as last_purchase_at
         FROM supplier_products sp
         LEFT JOIN distributors d ON d.id = sp.distributor_id
         LEFT JOIN product_cost_history pch
           ON pch.product_id = sp.product_id
          AND pch.distributor_id = sp.distributor_id
         WHERE sp.product_id = ?
         GROUP BY
           sp.distributor_id,
           d.name,
           sp.is_available,
           sp.lead_time_days,
           sp.min_order_qty,
           sp.last_known_unit_cost_incl_tax,
           sp.availability_note,
           sp.last_updated_at
         ORDER BY sp.is_available DESC, sp.last_known_unit_cost_incl_tax ASC NULLS LAST`,
        [productId]
      );

      const payload = (rows || []).map((row) => ({
        distributor_id: Number(row.distributor_id || 0),
        distributor_name: row.distributor_name || null,
        is_available: row.is_available ?? null,
        lead_time_days: row.lead_time_days ?? null,
        min_order_qty: row.min_order_qty ?? null,
        last_known_unit_cost_incl_tax: row.last_known_unit_cost_incl_tax ?? null,
        availability_note: row.availability_note ?? null,
        last_updated_at: row.last_updated_at ?? null,
        last_purchase_at: row.last_purchase_at ?? null,
      }));

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerSupplierInsightsRoutes };
