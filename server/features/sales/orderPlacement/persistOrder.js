const { normalizeUomToken } = require('./normalizeUom');

const persistOrderPlacement = async ({
  dbRunAsync,
  dbTxAsync,
  normalizeOrderPaymentStatus,
  parsedItems,
  stockSnapshotByProductId,
  orderNumber,
  userId,
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  total,
  createdStatus,
  normalizedPaymentMethod,
}) => {
  let availableNowTotal = 0;
  let pendingTotal = 0;

  return dbTxAsync(async () => {
    const orderInsert = await dbRunAsync(
      `INSERT INTO orders
       (order_number, user_id, customer_name, customer_email, customer_phone, shipping_address, total_amount, status, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        userId,
        customerName,
        customerEmail,
        customerPhone,
        JSON.stringify(shippingAddress || {}),
        total,
        createdStatus,
        normalizedPaymentMethod,
        normalizeOrderPaymentStatus('pending', createdStatus),
      ]
    );
    const orderId = orderInsert.lastInsertRowid;

    for (const it of parsedItems) {
      const isManual = Number(it.is_manual || 0) === 1;
      const productId = isManual ? 0 : (it.product_id || null);
      const requestedQty = Number(it.quantity || 0);
      const stockSnapshot = isManual ? null : Number(stockSnapshotByProductId.get(Number(productId || 0)) || 0);
      const availableNowQty = isManual
        ? requestedQty
        : Math.min(Math.max(0, Number(stockSnapshot || 0)), requestedQty);
      const fulfilledQty = isManual ? requestedQty : 0;
      const pendingQty = Math.max(0, requestedQty - availableNowQty);
      availableNowTotal += availableNowQty;
      pendingTotal += pendingQty;
      const lineUom = normalizeUomToken(it.uom, 'pcs');
      await dbRunAsync(
        `INSERT INTO order_items
         (order_id, product_id, product_name, is_manual, quantity, uom, requested_qty, available_now_qty, fulfilled_qty, pending_qty, stock_snapshot, price, line_subtotal, offer_discount, manual_discount, offer_label, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          productId,
          it.product_name || null,
          isManual ? 1 : 0,
          requestedQty,
          lineUom,
          requestedQty,
          availableNowQty,
          fulfilledQty,
          pendingQty,
          stockSnapshot,
          it.price,
          Number.isFinite(Number(it?.line_subtotal))
            ? Number(it.line_subtotal)
            : (it.price * it.quantity),
          Math.max(0, Number(it?.offer_discount || 0)),
          Math.max(0, Number(it?.manual_discount || 0)),
          String(it?.offer_label || '').trim() || null,
          Number.isFinite(Number(it?.line_total))
            ? Number(it.line_total)
            : (it.price * it.quantity),
        ]
      );
    }
    await dbRunAsync(
      'INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)',
      [orderId, createdStatus, 'Order placed', userId]
    );

    return {
      orderId,
      orderNumber,
      totalAmount: total,
      availableNowQty: Number(availableNowTotal || 0),
      pendingQty: Number(pendingTotal || 0),
    };
  });
};

module.exports = { persistOrderPlacement };
