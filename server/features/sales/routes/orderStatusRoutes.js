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
    logStockLedgerAsync
  } = deps;

app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const requestedStatus = normalizeOrderStatus(req.body?.status, '');
    const reapplyPending = parseBooleanEnv(req.body?.reapply_pending, false);
    if (!requestedStatus) return res.status(400).json({ error: 'Status is required' });
    if (requestedStatus !== ORDER_STATUS_RECEIVED) {
      return res.status(400).json({ error: 'Only received confirmation is allowed' });
    }
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const currentStatus = normalizeOrderStatus(order.status, ORDER_STATUS_ORDERED);
    if (currentStatus === ORDER_STATUS_RECEIVED) {
      if (!reapplyPending) {
        return res.json({ success: true, applied: false, message: 'Order is already marked as received' });
      }
    }
    if (currentStatus !== ORDER_STATUS_ORDERED && currentStatus !== ORDER_STATUS_RECEIVED) {
      return res.status(400).json({ error: 'Order is not in ordered state' });
    }

    // record status change in history
    const createdBy = Number(req.authUser?.id || 0) || null;
    const description = req.body?.description || null;
    const items = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]);
    let totalRequestedQty = 0;
    let totalFulfilledQty = 0;
    let totalPendingQty = 0;
    let stockApplied = Number(order?.stock_applied || 0) === 1 ? 1 : 0;
    const isInitialReceive = currentStatus !== ORDER_STATUS_RECEIVED;
    await dbTxAsync(async () => {
      for (const item of items) {
        const productId = Number(item?.product_id || 0);
        const isManual = Number(item?.is_manual || 0) === 1 || !productId;
        const requestedQty = Math.max(0, Number(item?.requested_qty || item?.quantity || 0));
        if (requestedQty <= 0) continue;
        totalRequestedQty += requestedQty;

        if (isManual) {
          totalFulfilledQty += Math.max(0, Number(item?.fulfilled_qty || requestedQty));
          await dbRunAsync(
            `UPDATE order_items
             SET requested_qty = COALESCE(requested_qty, ?),
                 available_now_qty = COALESCE(available_now_qty, ?),
                 fulfilled_qty = CASE WHEN COALESCE(fulfilled_qty, 0) > 0 THEN fulfilled_qty ELSE ? END,
                 pending_qty = COALESCE(pending_qty, 0)
             WHERE id = ?`,
            [requestedQty, requestedQty, requestedQty, item.id]
          );
          continue;
        }

        const current = await dbGetAsync(`SELECT id, stock FROM products WHERE id = ?`, [item.product_id]);
        if (!current) throw new Error(`Product ${item.product_id} not found`);

        const fulfilledAlready = Math.max(0, Number(item?.fulfilled_qty || 0));
        const availableNowAlready = Math.max(0, Number(item?.available_now_qty || 0));
        const pendingRaw = Number(item?.pending_qty);
        const pendingBefore = Number.isFinite(pendingRaw)
          ? Math.max(0, pendingRaw)
          : Math.max(0, requestedQty - fulfilledAlready);
        const availableStock = Math.max(0, Number(current.stock || 0));
        const targetFulfillNow = isInitialReceive
          ? Math.max(0, availableNowAlready - fulfilledAlready)
          : pendingBefore;
        const fulfillNow = Math.min(availableStock, targetFulfillNow);
        const fulfilledAfter = Math.max(0, fulfilledAlready + fulfillNow);
        const pendingAfter = Math.max(0, requestedQty - fulfilledAfter);
        const availableNowAfter = Math.max(availableNowAlready, fulfilledAfter);

        if (fulfillNow > 0) {
          const before = availableStock;
          await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [fulfillNow, item.product_id]);
          const after = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0);
          await logStockLedgerAsync({
            productId: item.product_id,
            transactionType: 'SALE',
            quantityChange: -Number(fulfillNow),
            previousBalance: before,
            newBalance: Number(after),
            referenceType: 'ORDER',
            referenceId: String(req.params.id),
            userId: order.user_id || null,
          });
          stockApplied = 1;
        }

        totalFulfilledQty += fulfilledAfter;
        totalPendingQty += pendingAfter;

        await dbRunAsync(
          `UPDATE order_items
           SET requested_qty = COALESCE(requested_qty, ?),
               available_now_qty = ?,
               fulfilled_qty = ?,
               pending_qty = ?,
               stock_snapshot = COALESCE(stock_snapshot, ?)
           WHERE id = ?`,
          [requestedQty, availableNowAfter, fulfilledAfter, pendingAfter, availableStock, item.id]
        );
      }

      if (currentStatus !== ORDER_STATUS_RECEIVED) {
        await dbRunAsync(
          `INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`,
          [req.params.id, ORDER_STATUS_RECEIVED, description || 'Order received/confirmed', createdBy]
        );
      } else if (reapplyPending) {
        await dbRunAsync(
          `INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`,
          [req.params.id, ORDER_STATUS_RECEIVED, description || 'Pending fulfillment re-applied', createdBy]
        );
      }
      await dbRunAsync(
        `UPDATE orders
         SET status = ?, payment_method = ?, payment_status = ?, stock_applied = ?, credit_applied = 0
          WHERE id = ?`,
        [ORDER_STATUS_RECEIVED, 'cash', normalizeOrderPaymentStatus(order?.payment_status, ORDER_STATUS_RECEIVED), stockApplied, req.params.id]
      );
    });

    await logAdminAuditAsync(req, {
      action: 'order.status_update',
      entityType: 'order',
      entityId: req.params.id,
      details: {
        status: ORDER_STATUS_RECEIVED,
        applied: true,
        stock_applied: stockApplied,
        requested_qty: Number(totalRequestedQty || 0),
        fulfilled_qty: Number(totalFulfilledQty || 0),
        pending_qty: Number(totalPendingQty || 0),
      },
    });
    try {
      if (Number(order?.user_id || 0)) {
        await createAppNotification({
          userId: Number(order.user_id),
          title: 'Order received',
          message: Number(totalPendingQty || 0) > 0
            ? `Order ${order.order_number || `#${order.id}`} is received with pending quantity ${Number(totalPendingQty).toFixed(3)}.`
            : `Order ${order.order_number || `#${order.id}`} has been marked as received.`,
          level: 'success',
          entityType: 'order',
          entityId: Number(order.id || req.params.id),
          metadata: {
            order_id: Number(order.id || req.params.id),
            order_number: order.order_number || null,
            user_id: Number(order.user_id || 0) || null,
            pending_qty: Number(totalPendingQty || 0),
          },
          createdBy: Number(req.authUser?.id || 0) || null,
        });
      }
    } catch (notifyError) {
      console.warn('[NOTIFY] order status notification failed:', notifyError?.message || notifyError);
    }
    return res.json({
      success: true,
      applied: true,
      stock_applied: stockApplied,
      requested_qty: Number(totalRequestedQty || 0),
      fulfilled_qty: Number(totalFulfilledQty || 0),
      pending_qty: Number(totalPendingQty || 0),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

};

module.exports = { registerOrderStatusRoutes };
