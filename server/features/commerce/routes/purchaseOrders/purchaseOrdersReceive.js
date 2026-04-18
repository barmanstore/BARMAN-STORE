const { applyReceivedItems } = require('./receive/receiveItems');
const { finalizePurchaseOrderReceive } = require('./receive/receiveFinalize');

const registerPurchaseOrdersReceiveRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbTxAsync,
    buildPurchaseTransactionTimestamp,
    canPoReceiveInventory,
    derivePurchaseNextAction,
    getPurchaseOrderLifecycleStatus,
    logAdminAuditAsync,
    recordPurchaseOrderStatusHistoryAsync,
    upsertSupplierProductsAsync,
  } = deps;

  app.post('/api/purchase-orders/:id/receive', requireAdmin, async (req, res) => {
    try {
      const order = await dbGetAsync('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
      const poStatus = getPurchaseOrderLifecycleStatus(order);
      if (!canPoReceiveInventory(poStatus)) {
        return res
          .status(400)
          .json({ error: 'Only confirmed purchase orders can receive inventory' });
      }
      const b = req.body || {};
      const items = Array.isArray(b.items) ? b.items : [];
      const shouldApplyStockOnReceive = Number(order.stock_applied_on_confirm || 0) !== 1;
      let nextLifecycleStatus = poStatus;
      let nextAction = derivePurchaseNextAction(order);
      let supplierUpdates = [];
      const historyTransactionTs = buildPurchaseTransactionTimestamp(
        order.planned_order_date ||
          order.expected_delivery ||
          order.created_at ||
          new Date().toISOString(),
        new Date()
      );

      await dbTxAsync(async () => {
        const receiveItemsResult = await applyReceivedItems(deps, {
          req,
          order,
          items,
          shouldApplyStockOnReceive,
          historyTransactionTs,
        });
        supplierUpdates = receiveItemsResult.supplierUpdates;

        const finalizeResult = await finalizePurchaseOrderReceive(deps, {
          req,
          order,
          poStatus,
          nextAction,
        });
        nextLifecycleStatus = finalizeResult.nextLifecycleStatus;
        nextAction = finalizeResult.nextAction;
      });

      if (supplierUpdates.length) {
        await upsertSupplierProductsAsync(order.distributor_id, supplierUpdates, {
          supplierId: order.supplier_id || null,
        });
      }
      await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
        fromStatus: poStatus,
        toStatus: nextLifecycleStatus,
        note: 'Inventory received against purchase order',
        billNumber: b.invoice_number || order.invoice_number || order.bill_number || null,
        paymentStatus: order.payment_status,
        balanceDue: Number(order.balance_due || 0),
        createdBy: b.received_by || null,
      });
      await logAdminAuditAsync(req, {
        action: 'purchase_order.receive',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          items_count: items.length,
          applied_stock_on_receive: shouldApplyStockOnReceive,
        },
      });
      return res.json({ success: true, po_status: nextLifecycleStatus, next_action: nextAction });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersReceiveRoutes };
