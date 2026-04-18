const { validateOrderStatusRequest } = require('./orderStatus/validateRequest');
const { prepareOrderStatusUpdate } = require('./orderStatus/prepareOrder');
const { applyReceiveStatusUpdate } = require('./orderStatus/applyReceiveStatus');

const registerOrderStatusRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeOrderStatus,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    normalizeOrderPaymentStatus,
    parseOrderAddress,
    normalizeEmail,
    parsePhoneInput,
    parseBooleanEnv,
    normalizePaymentMethod,
    generateOrderNumber,
    validateCustomerProfile,
    createAppNotification,
    notifyAdmins,
    logAdminAuditAsync,
    logStockLedgerAsync,
  } = deps;

  app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
    try {
      const { reapplyPending } = validateOrderStatusRequest({
        body: req.body,
        normalizeOrderStatus,
        parseBooleanEnv,
        ORDER_STATUS_RECEIVED,
      });

      const prepared = await prepareOrderStatusUpdate({
        orderId: req.params.id,
        dbGetAsync,
        dbAllAsync,
        normalizeOrderStatus,
        ORDER_STATUS_ORDERED,
        ORDER_STATUS_RECEIVED,
        reapplyPending,
      });

      if (prepared.alreadyReceived) {
        return res.json({
          success: true,
          applied: false,
          message: 'Order is already marked as received',
        });
      }

      const createdBy = Number(req.authUser?.id || 0) || null;
      const description = req.body?.description || null;

      const result = await applyReceiveStatusUpdate({
        orderId: req.params.id,
        order: prepared.order,
        items: prepared.items,
        isInitialReceive: prepared.isInitialReceive,
        reapplyPending,
        description,
        createdBy,
        dbTxAsync,
        dbGetAsync,
        dbRunAsync,
        logStockLedgerAsync,
        normalizeOrderPaymentStatus,
        ORDER_STATUS_RECEIVED,
      });

      await logAdminAuditAsync(req, {
        action: 'order.status_update',
        entityType: 'order',
        entityId: req.params.id,
        details: {
          status: ORDER_STATUS_RECEIVED,
          applied: true,
          stock_applied: result.stockApplied,
          requested_qty: Number(result.totalRequestedQty || 0),
          fulfilled_qty: Number(result.totalFulfilledQty || 0),
          pending_qty: Number(result.totalPendingQty || 0),
        },
      });

      try {
        if (Number(prepared.order?.user_id || 0)) {
          await createAppNotification({
            userId: Number(prepared.order.user_id),
            title: 'Order received',
            message:
              Number(result.totalPendingQty || 0) > 0
                ? `Order ${prepared.order.order_number || `#${prepared.order.id}`} is received with pending quantity ${Number(result.totalPendingQty).toFixed(3)}.`
                : `Order ${prepared.order.order_number || `#${prepared.order.id}`} has been marked as received.`,
            level: 'success',
            entityType: 'order',
            entityId: Number(prepared.order.id || req.params.id),
            metadata: {
              order_id: Number(prepared.order.id || req.params.id),
              order_number: prepared.order.order_number || null,
              user_id: Number(prepared.order.user_id || 0) || null,
              pending_qty: Number(result.totalPendingQty || 0),
            },
            createdBy: Number(req.authUser?.id || 0) || null,
          });
        }
      } catch (notifyError) {
        console.warn(
          '[NOTIFY] order status notification failed:',
          notifyError?.message || notifyError
        );
      }

      return res.json({
        success: true,
        applied: true,
        stock_applied: result.stockApplied,
        requested_qty: Number(result.totalRequestedQty || 0),
        fulfilled_qty: Number(result.totalFulfilledQty || 0),
        pending_qty: Number(result.totalPendingQty || 0),
      });
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      return res.status(status).json({ error: error?.message || 'Failed to update order status' });
    }
  });
};

module.exports = { registerOrderStatusRoutes };
