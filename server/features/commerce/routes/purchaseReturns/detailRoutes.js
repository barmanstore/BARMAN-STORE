const registerPurchaseReturnsDetailRoutes = (deps) => {
  const { app, requireAdmin, dbAllAsync, dbGetAsync } = deps;

  app.get('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
    try {
      const row = await dbGetAsync('SELECT * FROM purchase_returns WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Purchase return not found' });
      return res.json({ ...row, items: await dbAllAsync('SELECT * FROM purchase_return_items WHERE return_id = ?', [row.id]) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseReturnsDetailRoutes };
