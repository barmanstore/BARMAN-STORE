const registerPurchaseReturnsDeleteRoutes = (deps) => {
  const { app, requireAdmin, dbRunAsync } = deps;

  app.delete('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
    try {
      await dbRunAsync('DELETE FROM purchase_return_items WHERE return_id = ?', [req.params.id]);
      await dbRunAsync('DELETE FROM purchase_returns WHERE id = ?', [req.params.id]);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseReturnsDeleteRoutes };
