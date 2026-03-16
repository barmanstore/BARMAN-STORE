const { handlePurchaseOrderConfirm } = require('./purchaseOrdersConfirm');
const { handlePurchaseOrderCancel } = require('./purchaseOrdersCancel');
const { handlePurchaseOrderClose } = require('./purchaseOrdersClose');

const registerPurchaseOrdersStatusRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    normalizePoLifecycleStatus,
    getPurchaseOrderLifecycleStatus,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_CLOSED,
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_PART_PAID,
  } = deps;

  app.put('/api/purchase-orders/:id/status', requireAdmin, async (req, res) => {
    try {
      const status = req.body?.status;
      const billNumberRaw = req.body?.bill_number ?? req.body?.invoice_number;
      const billNumber = billNumberRaw === undefined || billNumberRaw === null ? null : String(billNumberRaw).trim();
      if (!status) return res.status(400).json({ error: 'status is required' });
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
      const currentPoStatus = getPurchaseOrderLifecycleStatus(order);
      const normalizedRequestedPoStatus = normalizePoLifecycleStatus(status, currentPoStatus);
      const requestedStatusRaw = String(status || '').trim().toLowerCase();
      const isConfirmRequest = normalizedRequestedPoStatus === PO_LIFECYCLE_CONFIRMED
        || normalizedRequestedPoStatus === PO_LIFECYCLE_PART_PAID
        || normalizedRequestedPoStatus === PO_LIFECYCLE_FULLY_PAID
        || requestedStatusRaw === 'processed';

      if (isConfirmRequest) {
        return handlePurchaseOrderConfirm(deps, {
          req,
          res,
          order,
          currentPoStatus,
          billNumber,
        });
      }

      if (normalizedRequestedPoStatus === PO_LIFECYCLE_CANCELLED) {
        return handlePurchaseOrderCancel(deps, {
          req,
          res,
          order,
          currentPoStatus,
          billNumber,
        });
      }

      if (normalizedRequestedPoStatus === PO_LIFECYCLE_CLOSED) {
        return handlePurchaseOrderClose(deps, {
          req,
          res,
          order,
          currentPoStatus,
        });
      }

      return res.status(400).json({ error: 'Unsupported purchase order status transition' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersStatusRoutes };
