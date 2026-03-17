const registerPurchaseReturnsUpdateRoutes = (deps) => {
  const { app, requireAdmin, dbGetAsync, dbRunAsync } = deps;

  app.put('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync('SELECT * FROM purchase_returns WHERE id = ?', [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Purchase return not found' });
      const b = req.body || {};
      await dbRunAsync(
        'UPDATE purchase_returns SET reason=?, return_type=?, reference_po=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?',
        [b.reason ?? cur.reason, b.return_type ?? cur.return_type, b.reference_po ?? cur.reference_po, req.params.id]
      );
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseReturnsUpdateRoutes };
