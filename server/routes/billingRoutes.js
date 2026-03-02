const registerBillingRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    normalizePhone,
    normalizeOrderStatus,
    normalizePaymentMethod,
    normalizeProductRecord,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    resolveClientRequestId,
    isUniqueViolationError,
    generateBillNumber,
    logStockLedgerAsync,
    logAdminAuditAsync,
    createAppNotification
  } = deps;

app.get('/api/users/:userId/bills', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = await dbAllAsync(
      `SELECT *
       FROM bills
       WHERE customer_id = ?
       ORDER BY created_at DESC`,
      [requestUserId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/bills/:identifier', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const identifier = String(req.params.identifier || '').trim();
    const bill = await dbGetAsync(
      `SELECT *
       FROM bills
       WHERE customer_id = ?
         AND (id = ? OR bill_number = ?)
       LIMIT 1`,
      [requestUserId, identifier, identifier]
    );
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await dbAllAsync(`SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC`, [bill.id]);
    return res.json({ ...bill, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/customers/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = q
      ? await dbAllAsync(`SELECT id, name, email, phone, address FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20`, [like, like, like])
      : await dbAllAsync(`SELECT id, name, email, phone, address FROM users WHERE role='customer' ORDER BY name LIMIT 20`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/products/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    let sql = `SELECT * FROM products WHERE COALESCE(is_active, 1) = 1`;
    const params = [];
    if (q) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR barcode LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY name LIMIT 50`;
    return res.json((await dbAllAsync(sql, params)).map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills/create', requireAdmin, async (req, res) => {
  let clientRequestId = null;
  let linkedOrderId = 0;
  try {
    const b = req.body || {};
    linkedOrderId = Number(b.order_id || 0) || 0;
    const idempotency = resolveClientRequestId(req);
    if (idempotency.error) return res.status(400).json({ error: idempotency.error });
    clientRequestId = idempotency.value;
    if (clientRequestId) {
      const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          bill_id: Number(existing.id),
          bill_number: existing.bill_number,
        });
      }
    }

    let linkedOrder = null;
    let linkedOrderItems = [];
    if (linkedOrderId) {
      linkedOrder = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [linkedOrderId]);
      if (!linkedOrder) return res.status(404).json({ error: 'Linked order not found' });
      const existingForOrder = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE order_id = ? LIMIT 1`, [linkedOrderId]);
      if (existingForOrder) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          bill_id: Number(existingForOrder.id),
          bill_number: existingForOrder.bill_number,
          reason: 'order_already_billed',
        });
      }
      const linkedOrderStatus = normalizeOrderStatus(linkedOrder?.status, ORDER_STATUS_ORDERED);
      if (linkedOrderStatus !== ORDER_STATUS_RECEIVED) {
        return res.status(409).json({
          error: 'Linked order must be marked received before billing',
          order_status: linkedOrderStatus,
        });
      }
      linkedOrderItems = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`, [linkedOrderId]);
    }

    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'items are required' });
    const billTypeRaw = String(b.bill_type || 'sales').trim().toLowerCase();
    const billType = billTypeRaw === 'purchase' ? 'purchase' : 'sales';
    const fulfillmentModeRaw = String(b.fulfillment_mode || '').trim().toLowerCase();
    const fulfillmentMode = linkedOrderId
      ? (fulfillmentModeRaw === 'full_now' ? 'full_now' : 'available_now')
      : 'full_now';

    const customerIdFromBody = Number(b.customer_id || 0);
    const fallbackOrderUserId = Number(linkedOrder?.user_id || 0);
    const customerId = customerIdFromBody || fallbackOrderUserId || 0;
    let customer = customerId
      ? await dbGetAsync(`SELECT id, name, email, phone, address, role FROM users WHERE id = ?`, [customerId])
      : null;

    if (!customer && linkedOrderId) {
      customer = {
        id: customerId || null,
        name: String(linkedOrder?.customer_name || '').trim() || 'Customer',
        email: normalizeEmail(linkedOrder?.customer_email),
        phone: normalizePhone(linkedOrder?.customer_phone),
        address: linkedOrder?.shipping_address || null,
        role: 'customer',
      };
    }
    if (!customer) return res.status(400).json({ error: 'customer not found' });
    if (!String(customer.name || '').trim()) return res.status(400).json({ error: 'Customer name is required' });

    const customerName = String(customer.name || '').trim();
    const customerEmail = normalizeEmail(customer.email);
    const customerPhone = normalizePhone(customer.phone);
    const customerAddress = customer.address ? String(customer.address).trim() : null;
    const allowOrderLinkedLineItemsWithoutProduct = linkedOrderId > 0;
    const productCache = new Map();
    const itemErrors = [];
    const sanitizedItems = [];
    for (let index = 0; index < items.length; index += 1) {
      const it = items[index];
      const rowNo = index + 1;
      const productId = Number(it.product_id || 0);
      if (!productId && !allowOrderLinkedLineItemsWithoutProduct) {
        itemErrors.push(`Item ${rowNo}: product_id is required`);
        continue;
      }
      if (productId && !productCache.has(productId)) {
        productCache.set(
          productId,
          (await dbGetAsync(`SELECT id, name, stock, is_active FROM products WHERE id = ?`, [productId])) || null
        );
      }
      const product = productId ? productCache.get(productId) : null;
      if (!product && productId && !allowOrderLinkedLineItemsWithoutProduct) {
        itemErrors.push(`Item ${rowNo}: Product ${productId} not found`);
        continue;
      }
      if (product && Number(product.is_active ?? 1) !== 1 && !allowOrderLinkedLineItemsWithoutProduct) {
        itemErrors.push(`Item ${rowNo}: Product ${productId} is inactive`);
        continue;
      }
      const qty = Math.max(0, Number(it.qty || 0));
      const mrp = Math.max(0, Number(it.mrp || 0));
      const lineSubtotal = mrp * qty;
      const discount = Math.min(lineSubtotal, Math.max(0, Number(it.discount || 0)));
      const amount = Math.max(0, lineSubtotal - discount);
      const productName =
        String(it.product_name || '').trim() ||
        String(product?.name || '').trim() ||
        'Unknown';
      if (!productName) {
        itemErrors.push(`Item ${rowNo}: product_name is required`);
        continue;
      }
      const normalized = {
        product_id: product ? Number(product.id) : null,
        product_name: productName,
        mrp,
        qty,
        unit: String(it.unit || 'pcs'),
        discount,
        amount,
      };
      if (normalized.qty > 0 && normalized.amount >= 0) {
        sanitizedItems.push(normalized);
      }
    }

    if (itemErrors.length) {
      return res.status(400).json({ error: 'Invalid bill items', details: itemErrors });
    }

    if (!sanitizedItems.length) return res.status(400).json({ error: 'At least one valid item is required' });
    const linkedFulfilledRemainingByProductId = new Map();
    if (linkedOrderItems.length) {
      linkedOrderItems.forEach((item) => {
        const productId = Number(item?.product_id || 0);
        if (!productId) return;
        const requestedQty = Math.max(0, Number(item?.requested_qty || item?.quantity || 0));
        const pendingQty = Math.max(0, Number(item?.pending_qty || 0));
        const fulfilledQty = Math.max(0, requestedQty - pendingQty);
        linkedFulfilledRemainingByProductId.set(
          productId,
          Number(linkedFulfilledRemainingByProductId.get(productId) || 0) + fulfilledQty
        );
      });
    }
    const itemFulfillmentRows = sanitizedItems.map((it) => {
      const requestedQty = Math.max(0, Number(it.qty || 0));
      const productId = Number(it.product_id || 0);
      const stockSnapshot = productId ? Math.max(0, Number(productCache.get(productId)?.stock || 0)) : 0;
      if (!linkedOrderId || !productId) {
        return {
          ...it,
          requested_qty: requestedQty,
          available_now_qty: requestedQty,
          fulfilled_qty: requestedQty,
          pending_qty: 0,
          stock_snapshot: stockSnapshot,
        };
      }
      if (fulfillmentMode === 'full_now') {
        return {
          ...it,
          requested_qty: requestedQty,
          available_now_qty: requestedQty,
          fulfilled_qty: requestedQty,
          pending_qty: 0,
          stock_snapshot: stockSnapshot,
        };
      }
      const fulfilledRemaining = Math.max(0, Number(linkedFulfilledRemainingByProductId.get(productId) || 0));
      const fulfilledQty = Math.min(requestedQty, fulfilledRemaining);
      const pendingQty = Math.max(0, requestedQty - fulfilledQty);
      linkedFulfilledRemainingByProductId.set(productId, Math.max(0, fulfilledRemaining - fulfilledQty));
      return {
        ...it,
        requested_qty: requestedQty,
        available_now_qty: fulfilledQty,
        fulfilled_qty: fulfilledQty,
        pending_qty: pendingQty,
        stock_snapshot: stockSnapshot,
      };
    });
    const salesQtyByProduct = new Map();
    const shouldApplySalesStock = billType === 'sales' && !linkedOrderId;
    if (shouldApplySalesStock) {
      sanitizedItems.forEach((it) => {
        if (!it.product_id) return;
        salesQtyByProduct.set(
          it.product_id,
          Number(salesQtyByProduct.get(it.product_id) || 0) + Number(it.qty || 0)
        );
      });
      const stockErrors = [];
      for (const [productId, neededQty] of salesQtyByProduct.entries()) {
        const product = productCache.get(productId);
        const currentStock = Number(product?.stock || 0);
        if (currentStock < neededQty) {
          stockErrors.push(`Product ${productId}: requested ${neededQty}, in stock ${currentStock}`);
        }
      }
      if (stockErrors.length) {
        return res.status(400).json({
          error: 'Insufficient stock for one or more items',
          details: stockErrors,
        });
      }
    }
    const subtotal = itemFulfillmentRows.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const billDiscount = Math.min(subtotal, Math.max(0, Number(b.discount_amount || 0)));
    const totalAmount = Math.max(0, subtotal - billDiscount);
    const paidAmount = Math.max(0, Math.min(totalAmount, Number(b.paid_amount || 0)));
    const creditAmount = Math.max(0, totalAmount - paidAmount);
    const paymentStatus = creditAmount > 0 ? 'pending' : 'paid';
    const createdBy = Number(req.authUser?.id || 0) || null;
    const billNumber = generateBillNumber();
    const normalizedOrderId = linkedOrderId || null;
    const billId = await dbTxAsync(async () => {
      const header = await dbRunAsync(
        `INSERT INTO bills (bill_number, customer_id, customer_name, customer_email, customer_phone, customer_address, subtotal, discount_amount, total_amount, paid_amount, credit_amount, payment_method, payment_status, bill_type, created_by, client_request_id, order_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billNumber,
          Number(customer.id || 0) || null,
          customerName,
          customerEmail,
          customerPhone,
          customerAddress,
          subtotal,
          billDiscount,
          totalAmount,
          paidAmount,
          creditAmount,
          normalizePaymentMethod(b.payment_method),
          paymentStatus,
          billType,
          createdBy,
          clientRequestId,
          normalizedOrderId,
          b.notes ? String(b.notes) : null,
        ]
      );
      const billId = header.lastInsertRowid;
      for (const it of itemFulfillmentRows) {
        await dbRunAsync(
          `INSERT INTO bill_items
           (bill_id, product_id, product_name, mrp, qty, requested_qty, available_now_qty, fulfilled_qty, pending_qty, stock_snapshot, unit, discount, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            billId,
            it.product_id,
            it.product_name,
            it.mrp,
            it.qty,
            it.requested_qty,
            it.available_now_qty,
            it.fulfilled_qty,
            it.pending_qty,
            it.stock_snapshot,
            it.unit,
            it.discount,
            it.amount,
          ]
        );
      }
      if (shouldApplySalesStock) {
        for (const [productId, neededQty] of salesQtyByProduct.entries()) {
          const before = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [productId]))?.stock || 0);
          if (before < neededQty) {
            const err = new Error(`Insufficient stock for product ${productId}`);
            err.status = 400;
            throw err;
          }
          await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [neededQty, productId]);
          const after = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [productId]))?.stock || 0);
          await logStockLedgerAsync({
            productId,
            transactionType: 'out',
            quantityChange: -Number(neededQty || 0),
            previousBalance: before,
            newBalance: after,
            referenceType: 'bill',
            referenceId: String(billId),
            userId: createdBy,
            userName: req.authUser?.name || null,
            notes: `Sales bill ${billNumber}`,
          });
        }
      }
      if (creditAmount > 0 && Number(customer.id || 0)) {
        const last = await dbGetAsync(
          `SELECT balance
           FROM credit_history
           WHERE user_id = ?
           ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC
           LIMIT 1`,
          [Number(customer.id)]
        );
        const currentBalance = Number(last?.balance || 0);
        const nextBalance = currentBalance + Number(creditAmount || 0);
        await dbRunAsync(
          `INSERT INTO credit_history (user_id, type, amount, balance, description, reference, transaction_date, created_by, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            Number(customer.id),
            'given',
            Number(creditAmount || 0),
            nextBalance,
            `Bill credit | Paid: Rs ${Number(paidAmount || 0).toFixed(2)} | Credit: Rs ${Number(creditAmount || 0).toFixed(2)}`,
            billNumber,
            null,
            createdBy,
            clientRequestId ? `${clientRequestId}:credit` : null,
          ]
        );
      }
      if (normalizedOrderId) {
        await dbRunAsync(
          `UPDATE orders
           SET payment_status = ?, credit_applied = ?
           WHERE id = ?`,
          [paymentStatus, creditAmount > 0 ? 1 : 0, normalizedOrderId]
        );
      }
      return billId;
    });
    await logAdminAuditAsync(req, {
      action: 'bill.create',
      entityType: 'bill',
      entityId: billId,
      requestId: clientRequestId,
      details: {
        bill_number: billNumber,
        customer_id: Number(customer.id),
        bill_type: billType,
        total_amount: Number(totalAmount || 0),
        credit_amount: Number(creditAmount || 0),
        items_count: itemFulfillmentRows.length,
        linked_order_id: normalizedOrderId,
        stock_applied: shouldApplySalesStock,
      },
    });
    try {
      const totalAmountText = `Rs ${Number(totalAmount || 0).toFixed(2)}`;
      if (Number(customer.id || 0)) {
        await createAppNotification({
          userId: Number(customer.id),
          title: `Bill ${billNumber} created`,
          message: `A new bill of ${totalAmountText} was created for your account.`,
          level: 'info',
          entityType: 'bill',
          entityId: billId,
          metadata: {
            route: '/my-bills',
            bill_id: Number(billId || 0),
            bill_number: billNumber,
            total_amount: Number(totalAmount || 0),
            credit_amount: Number(creditAmount || 0),
            paid_amount: Number(paidAmount || 0),
            order_id: normalizedOrderId,
          },
          createdBy,
        });
      }
    } catch (notifyError) {
      console.warn('[NOTIFY] bill creation notification failed:', notifyError?.message || notifyError);
    }
    const pendingQtyTotal = itemFulfillmentRows.reduce((sum, it) => sum + Math.max(0, Number(it.pending_qty || 0)), 0);
    const fulfilledQtyTotal = itemFulfillmentRows.reduce((sum, it) => sum + Math.max(0, Number(it.fulfilled_qty || 0)), 0);
    return res.status(201).json({
      success: true,
      bill_id: billId,
      bill_number: billNumber,
      order_id: normalizedOrderId,
      stock_applied: shouldApplySalesStock,
      fulfilled_qty: Number(fulfilledQtyTotal || 0),
      pending_qty: Number(pendingQtyTotal || 0),
      fulfillment_mode: fulfillmentMode,
    });
  } catch (error) {
    if (clientRequestId && isUniqueViolationError(error)) {
      const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          bill_id: Number(existing.id),
          bill_number: existing.bill_number,
        });
      }
    }
    if (linkedOrderId && isUniqueViolationError(error)) {
      const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE order_id = ? LIMIT 1`, [linkedOrderId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          bill_id: Number(existing.id),
          bill_number: existing.bill_number,
          reason: 'order_already_billed',
        });
      }
    }
    return res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/bills', requireAdmin, async (_, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM bills ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const bill = await dbGetAsync(`SELECT * FROM bills WHERE id = ? OR bill_number = ?`, [id, id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await dbAllAsync(`SELECT * FROM bill_items WHERE bill_id = ?`, [bill.id]);
    return res.json({ ...bill, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/bills/:id/payment', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM bills WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Bill not found' });
    const nextPaymentStatus = String(req.body?.payment_status || cur.payment_status || '').trim().toLowerCase() || 'pending';
    const nextPaymentMethod = req.body?.payment_method || cur.payment_method;
    await dbRunAsync(`UPDATE bills SET payment_status = ?, payment_method = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [
      nextPaymentStatus,
      nextPaymentMethod,
      req.params.id,
    ]);
    const linkedOrderId = Number(cur.order_id || 0);
    if (linkedOrderId) {
      await dbRunAsync(
        `UPDATE orders
         SET payment_status = ?, credit_applied = ?
         WHERE id = ?`,
        [nextPaymentStatus, nextPaymentStatus === 'paid' ? 0 : Number(cur.credit_amount || 0) > 0 ? 1 : 0, linkedOrderId]
      );
    }
    await logAdminAuditAsync(req, {
      action: 'bill.payment_update',
      entityType: 'bill',
      entityId: req.params.id,
      details: {
        payment_status: nextPaymentStatus,
        payment_method: nextPaymentMethod,
        linked_order_id: linkedOrderId || null,
      },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/stats/summary', requireAdmin, async (_, res) => {
  try {
    const totalBills = (await dbGetAsync(`SELECT COUNT(*) as count FROM bills`))?.count || 0;
    const totalSales = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'sales'`))?.total || 0;
    const totalPurchase = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'purchase'`))?.total || 0;
    return res.json({ totalBills, totalSales, totalPurchase });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
};

module.exports = {
  registerBillingRoutes,
};
