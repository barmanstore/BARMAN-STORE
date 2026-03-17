const registerPurchaseReturnsListRoutes = (deps) => {
  const { app, requireAdmin, dbAllAsync } = deps;

  app.get('/api/purchase-returns', requireAdmin, async (req, res) => {
    try {
      let sql = `
        SELECT pr.*, d.name as distributor_name
        FROM purchase_returns pr
        LEFT JOIN distributors d ON d.id = pr.distributor_id
        WHERE 1=1
      `;
      const params = [];
      if (req.query.distributor_id) {
        sql += ' AND pr.distributor_id = ?';
        params.push(req.query.distributor_id);
      }
      sql += ' ORDER BY pr.created_at DESC';
      const baseRows = await dbAllAsync(sql, params);
      const rows = await Promise.all(
        baseRows.map(async (row) => ({
          ...row,
          items: await dbAllAsync('SELECT * FROM purchase_return_items WHERE return_id = ?', [row.id])
        }))
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseReturnsListRoutes };
