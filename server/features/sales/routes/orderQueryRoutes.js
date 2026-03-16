const registerOrderQueryRoutes = (deps) => {
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
    canAccessOrder
  } = deps;

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const order = await dbGetAsync(
      `SELECT o.*, b.id AS bill_id, b.bill_number AS linked_bill_number
       FROM orders o
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrder(req.authUser, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const items = await dbAllAsync(
      `SELECT oi.*,
              COALESCE(NULLIF(oi.product_name, ''), p.name, 'Item') AS product_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [req.params.id]
    );
    return res.json({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
      items,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id/history', requireAuth, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrder(req.authUser, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = await dbAllAsync(
      `SELECT h.id, h.order_id, h.status, h.description, h.created_by, h.created_at, u.name as created_by_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.order_id = ?
       ORDER BY h.created_at DESC`,
      [req.params.id]
    );
    return res.json(rows.map((row) => ({
      ...row,
      status: normalizeOrderStatus(row?.status, ORDER_STATUS_ORDERED),
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/number/:orderNumber', requireAuth, async (req, res) => {
  try {
    const order = await dbGetAsync(
      `SELECT o.*, b.id AS bill_id, b.bill_number AS linked_bill_number
       FROM orders o
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.order_number = ?`,
      [req.params.orderNumber]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrder(req.authUser, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const items = await dbAllAsync(
      `SELECT oi.*,
              COALESCE(NULLIF(oi.product_name, ''), p.name, 'Item') AS product_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [order.id]
    );
    return res.json({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
      items,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/orders', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const orders = await dbAllAsync(
      `SELECT o.*,
              b.id AS bill_id,
              b.bill_number AS linked_bill_number,
              COALESCE(agg.requested_qty, 0) AS requested_qty,
              COALESCE(agg.available_now_qty, 0) AS available_now_qty,
              COALESCE(agg.fulfilled_qty, 0) AS fulfilled_qty,
              COALESCE(agg.pending_qty, 0) AS pending_qty
       FROM orders o
       LEFT JOIN (
         SELECT order_id,
                SUM(COALESCE(requested_qty, quantity, 0)) AS requested_qty,
                SUM(COALESCE(available_now_qty, 0)) AS available_now_qty,
                SUM(COALESCE(fulfilled_qty, 0)) AS fulfilled_qty,
                SUM(COALESCE(pending_qty, 0)) AS pending_qty
         FROM order_items
         GROUP BY order_id
       ) agg ON agg.order_id = o.id
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [req.params.userId]
    );
    const enriched = await Promise.all(
      orders.map(async (order) => {
        const items = await dbAllAsync(
          `SELECT oi.*
           FROM order_items oi
           WHERE oi.order_id = ?
           ORDER BY oi.id ASC`,
          [order.id]
        );
        return {
          ...order,
          status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
          payment_method: 'cash',
          payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
          shipping_address: parseOrderAddress(order?.shipping_address),
          items,
        };
      })
    );
    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const placeOrder = async (payload) => {
  const {
    user_id = null,
    customer_name,
    customer_email = '',
    customer_phone = null,
    shipping_address = {},
    items = [],
    payment_method = 'cash',
  } = payload;

  if (!customer_name || !items.length) {
    throw new Error('Missing required fields');
  }
  if (!Number(user_id)) {
    throw new Error('AUTH_REQUIRED: Login is required to place orders');
  }
  const normalizedCustomerEmail = normalizeEmail(customer_email) || '';
  const account = await dbGetAsync(`SELECT id, role, email_verified, phone_verified FROM users WHERE id = ?`, [user_id]);
  if (!account) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }
  if (
    String(account.role || '').toLowerCase() !== 'admin' &&
    Number(account.email_verified || 0) !== 1 &&
    Number(account.phone_verified || 0) !== 1
  ) {
    throw new Error('INCOMPLETE_PROFILE: Verify at least one contact method (email or phone) before placing orders');
  }
  const phoneParsed = parsePhoneInput(customer_phone);
  if (phoneParsed.error) {
    throw new Error(phoneParsed.error);
  }
  const normalizedCustomerPhone = phoneParsed.value;

  const normalizeUomToken = (value, fallback = 'pcs') =>
    String(value || fallback).trim().toLowerCase() || fallback;

  const parsedItems = items.map((it, index) => {
    const parsedProductId = Number(it?.product_id ?? it?.id ?? 0);
    const productId = Number.isFinite(parsedProductId) && parsedProductId > 0
      ? Math.trunc(parsedProductId)
      : null;
    let quantity = Number(it?.quantity || 0);
    const providedName = String(it?.product_name || it?.name || '').trim();
    const quantityLabel = String(it?.quantity_label || it?.qty_text || '').trim();
    const itemType = String(it?.item_type || '').trim().toLowerCase();
    const manualHint = parseBooleanEnv(it?.is_manual, false) || itemType === 'manual';
    const isManual = manualHint || !productId;
    if ((!Number.isFinite(quantity) || quantity <= 0) && quantityLabel) {
      const quantityFromLabel = Number(String(quantityLabel).match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
      if (Number.isFinite(quantityFromLabel) && quantityFromLabel > 0) {
        quantity = quantityFromLabel;
      }
    }
    const rawPrice = Number(it?.price);
    const priceUnknownHint = parseBooleanEnv(it?.price_unknown, false) || parseBooleanEnv(it?.unknown_price, false);
    let price = Number.isFinite(rawPrice) ? rawPrice : NaN;
    if (isManual && (priceUnknownHint || !Number.isFinite(price) || price < 0)) {
      price = 0;
    }
    return {
      line_index: index,
      // Keep backward compatibility for older schemas where product_id can still be NOT NULL.
      // product_id=0 is treated as manual everywhere in this codebase.
      product_id: isManual ? 0 : productId,
      product_name: providedName,
      quantity,
      price,
      is_manual: isManual ? 1 : 0,
      uom: normalizeUomToken(it?.uom, 'pcs'),
    };
  });
  if (parsedItems.some((it) => it.quantity <= 0 || !Number.isFinite(it.quantity))) {
    throw new Error('Invalid order items');
  }
  if (parsedItems.some((it) => it.price < 0 || !Number.isFinite(it.price))) {
    throw new Error('Invalid order items');
  }
  if (parsedItems.some((it) => it.is_manual === 1 && !it.product_name)) {
    throw new Error('Manual order items must include a product name');
  }

  const stockSnapshotByProductId = new Map();
  for (const it of parsedItems) {
    if (it.is_manual === 1) continue;
    const p = await dbGetAsync(`SELECT id, name, stock, uom FROM products WHERE id = ?`, [it.product_id]);
    if (!p) throw new Error(`Product ${it.product_id} not found`);
    stockSnapshotByProductId.set(Number(p.id), Math.max(0, Number(p.stock || 0)));
    if (!it.product_name) {
      it.product_name = String(p.name || '').trim() || 'Item';
    }
    it.uom = normalizeUomToken(p.uom, it.uom || 'pcs');
  }

  const normalizedPaymentMethod = normalizePaymentMethod(payment_method);
  const subtotal = parsedItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;
  const orderNumber = generateOrderNumber();
  const createdStatus = ORDER_STATUS_ORDERED;
  let availableNowTotal = 0;
  let pendingTotal = 0;

  return await dbTxAsync(async () => {
    const orderInsert = await dbRunAsync(
      `INSERT INTO orders
      (order_number, user_id, customer_name, customer_email, customer_phone, shipping_address, total_amount, status, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        user_id,
        customer_name,
        normalizedCustomerEmail,
        normalizedCustomerPhone,
        JSON.stringify(shipping_address || {}),
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
         (order_id, product_id, product_name, is_manual, quantity, uom, requested_qty, available_now_qty, fulfilled_qty, pending_qty, stock_snapshot, price, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          it.price * it.quantity
        ]
      );
    }
    await dbRunAsync(
      `INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`,
      [orderId, createdStatus, 'Order placed', user_id]
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

};

module.exports = { registerOrderQueryRoutes };
