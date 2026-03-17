const applyReceiveStatusUpdate = async ({
  orderId,
  order,
  items,
  isInitialReceive,
  reapplyPending,
  description,
  createdBy,
  dbTxAsync,
  dbGetAsync,
  dbRunAsync,
  logStockLedgerAsync,
  normalizeOrderPaymentStatus,
  ORDER_STATUS_RECEIVED,
}) => {
  let totalRequestedQty = 0;
  let totalFulfilledQty = 0;
  let totalPendingQty = 0;
  let stockApplied = Number(order?.stock_applied || 0) === 1 ? 1 : 0;

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

      const current = await dbGetAsync('SELECT id, stock FROM products WHERE id = ?', [item.product_id]);
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
        await dbRunAsync('UPDATE products SET stock = stock - ? WHERE id = ?', [fulfillNow, item.product_id]);
        const after = Number((await dbGetAsync('SELECT stock FROM products WHERE id = ?', [item.product_id]))?.stock || 0);
        await logStockLedgerAsync({
          productId: item.product_id,
          transactionType: 'SALE',
          quantityChange: -Number(fulfillNow),
          previousBalance: before,
          newBalance: Number(after),
          referenceType: 'ORDER',
          referenceId: String(orderId),
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

    if (isInitialReceive) {
      await dbRunAsync(
        'INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)',
        [orderId, ORDER_STATUS_RECEIVED, description || 'Order received/confirmed', createdBy]
      );
    } else if (reapplyPending) {
      await dbRunAsync(
        'INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)',
        [orderId, ORDER_STATUS_RECEIVED, description || 'Pending fulfillment re-applied', createdBy]
      );
    }

    await dbRunAsync(
      `UPDATE orders
       SET status = ?, payment_method = ?, payment_status = ?, stock_applied = ?, credit_applied = 0
        WHERE id = ?`,
      [
        ORDER_STATUS_RECEIVED,
        'cash',
        normalizeOrderPaymentStatus(order?.payment_status, ORDER_STATUS_RECEIVED),
        stockApplied,
        orderId,
      ]
    );
  });

  return {
    totalRequestedQty,
    totalFulfilledQty,
    totalPendingQty,
    stockApplied,
  };
};

module.exports = { applyReceiveStatusUpdate };
