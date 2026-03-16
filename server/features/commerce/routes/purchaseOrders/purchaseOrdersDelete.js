const registerPurchaseOrdersDeleteRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    logAdminAuditAsync,
  } = deps;

  app.delete('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
    try {
      const existing = await dbGetAsync(`SELECT id, po_status, status FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
      if (!isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(existing))) {
        return res.status(400).json({ error: 'Only prepared, sent, or revised purchase orders can be deleted' });
      }
      await dbRunAsync(`DELETE FROM purchase_order_payments WHERE purchase_order_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM product_cost_history WHERE po_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM purchase_orders WHERE id = ?`, [req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'purchase_order.delete',
        entityType: 'purchase_order',
        entityId: req.params.id,
      });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersDeleteRoutes };
