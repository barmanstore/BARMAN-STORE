const createOrderPlacement = (deps) => {
  const {
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    parsePhoneInput,
    parseBooleanEnv,
    normalizePaymentMethod,
    generateOrderNumber,
    normalizeOrderPaymentStatus,
    ORDER_STATUS_ORDERED,
  } = deps;

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

  return { placeOrder };
};

module.exports = { createOrderPlacement };
