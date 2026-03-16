const buildBillDraft = async (deps, req) => {
  const {
    dbAllAsync,
    dbGetAsync,
    normalizeEmail,
    normalizePhone,
    normalizeOrderStatus,
    resolveClientRequestId,
    generateBillNumber,
    normalizeUomToken,
    getProductUomProfile,
    getAllowedBillingUnits,
    toPricingQty,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
  } = deps;

  const createHttpError = (status, message, details) => {
    const error = new Error(message);
    error.status = status;
    if (details) error.details = details;
    return error;
  };

  const b = req.body || {};
  const linkedOrderId = Number(b.order_id || 0) || 0;
  const idempotency = resolveClientRequestId(req);
  if (idempotency.error) throw createHttpError(400, idempotency.error);
  const clientRequestId = idempotency.value;
  if (clientRequestId) {
    const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
    if (existing) {
      return {
        clientRequestId,
        linkedOrderId,
        dedupe: {
          status: 200,
          body: {
            success: true,
            deduplicated: true,
            bill_id: Number(existing.id),
            bill_number: existing.bill_number,
          },
        },
      };
    }
  }

  let linkedOrder = null;
  let linkedOrderItems = [];
  if (linkedOrderId) {
    linkedOrder = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [linkedOrderId]);
    if (!linkedOrder) throw createHttpError(404, 'Linked order not found');
    const existingForOrder = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE order_id = ? LIMIT 1`, [linkedOrderId]);
    if (existingForOrder) {
      return {
        clientRequestId,
        linkedOrderId,
        dedupe: {
          status: 200,
          body: {
            success: true,
            deduplicated: true,
            bill_id: Number(existingForOrder.id),
            bill_number: existingForOrder.bill_number,
            reason: 'order_already_billed',
          },
        },
      };
    }
    const linkedOrderStatus = normalizeOrderStatus(linkedOrder?.status, ORDER_STATUS_ORDERED);
    if (linkedOrderStatus !== ORDER_STATUS_RECEIVED) {
      const error = createHttpError(409, 'Linked order must be marked received before billing');
      error.orderStatus = linkedOrderStatus;
      throw error;
    }
    linkedOrderItems = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`, [linkedOrderId]);
  }

  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw createHttpError(400, 'items are required');
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
  if (!customer) throw createHttpError(400, 'customer not found');
  if (!String(customer.name || '').trim()) throw createHttpError(400, 'Customer name is required');

  const customerName = String(customer.name || '').trim();
  const customerEmail = normalizeEmail(customer.email);
  const customerPhone = normalizePhone(customer.phone);
  const customerAddress = customer.address ? String(customer.address).trim() : null;
  // Uninterrupted billing: manual/unlisted lines are allowed for all bill flows.
  const allowLineItemsWithoutProduct = true;
  const productCache = new Map();
  const itemErrors = [];
  const sanitizedItems = [];
  for (let index = 0; index < items.length; index += 1) {
    const it = items[index];
    const rowNo = index + 1;
    const productId = Number(it.product_id || 0);
    if (!productId && !allowLineItemsWithoutProduct) {
      itemErrors.push(`Item ${rowNo}: product_id is required`);
      continue;
    }
    if (productId && !productCache.has(productId)) {
      productCache.set(
        productId,
        (await dbGetAsync(`SELECT id, name, stock, is_active, uom, base_unit, uom_type, conversion_factor FROM products WHERE id = ?`, [productId])) || null
      );
    }
    const product = productId ? productCache.get(productId) : null;
    if (!product && productId && !allowLineItemsWithoutProduct) {
      itemErrors.push(`Item ${rowNo}: Product ${productId} not found`);
      continue;
    }
    if (product && Number(product.is_active ?? 1) !== 1 && !allowLineItemsWithoutProduct) {
      itemErrors.push(`Item ${rowNo}: Product ${productId} is inactive`);
      continue;
    }
    const qty = Math.max(0, Number(it.qty || 0));
    const mrp = Math.max(0, Number(it.mrp || 0));
    const pricingQty = toPricingQty(qty, it.unit, product);
    const lineSubtotal = mrp * pricingQty;
    const discount = Math.min(lineSubtotal, Math.max(0, Number(it.discount || 0)));
    const amount = Math.max(0, lineSubtotal - discount);
    const productName =
      String(it.product_name || '').trim()
      || String(product?.name || '').trim()
      || 'Unknown';
    if (!productName) {
      itemErrors.push(`Item ${rowNo}: product_name is required`);
      continue;
    }
    const providedUnitRaw = String(it.unit || '').trim();
    let normalizedUnit = normalizeUomToken(providedUnitRaw, 'pcs');
    if (product) {
      const profile = getProductUomProfile(product);
      const allowedUnits = getAllowedBillingUnits(product);
      if (providedUnitRaw) {
        const requestedUnit = normalizeUomToken(providedUnitRaw, profile.sellingUnit);
        if (!allowedUnits.includes(requestedUnit)) {
          itemErrors.push(
            `Item ${rowNo}: unit "${providedUnitRaw}" is invalid for product ${product.id}. Allowed: ${allowedUnits.join(', ')}`
          );
          continue;
        }
        normalizedUnit = requestedUnit;
      } else {
        normalizedUnit = allowedUnits[0] || profile.baseUnit;
      }
    }
    const normalized = {
      product_id: product ? Number(product.id) : null,
      product_name: productName,
      mrp,
      qty,
      unit: normalizedUnit,
      discount,
      amount,
    };
    if (normalized.qty > 0 && normalized.amount >= 0) {
      sanitizedItems.push(normalized);
    }
  }

  if (itemErrors.length) {
    throw createHttpError(400, 'Invalid bill items', itemErrors);
  }

  if (!sanitizedItems.length) throw createHttpError(400, 'At least one valid item is required');
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
    const product = productId ? productCache.get(productId) : null;
    const stockSnapshotBase = productId ? Math.max(0, Number(product?.stock || 0)) : 0;
    const requestedStockQty = product ? toStockUnitQty(requestedQty, it.unit, product) : requestedQty;
    const stockSnapshot = product ? fromStockUnitQty(stockSnapshotBase, it.unit, product) : stockSnapshotBase;

    if (!productId) {
      return {
        ...it,
        requested_qty: roundQty(requestedQty),
        available_now_qty: roundQty(requestedQty),
        fulfilled_qty: roundQty(requestedQty),
        pending_qty: 0,
        stock_snapshot: roundQty(stockSnapshot),
        requested_stock_qty: roundQty(requestedStockQty),
        fulfilled_stock_qty: roundQty(requestedStockQty),
        pending_stock_qty: 0,
        stock_snapshot_base: roundQty(stockSnapshotBase),
      };
    }
    if (!linkedOrderId) {
      const fulfilledStockQty = Math.min(requestedStockQty, stockSnapshotBase);
      const fulfilledQtyConverted = fromStockUnitQty(fulfilledStockQty, it.unit, product);
      const fulfilledQty = Math.min(requestedQty, fulfilledQtyConverted);
      const pendingQty = Math.max(0, requestedQty - fulfilledQty);
      const pendingStockQty = Math.max(0, requestedStockQty - fulfilledStockQty);
      return {
        ...it,
        requested_qty: roundQty(requestedQty),
        available_now_qty: roundQty(fulfilledQty),
        fulfilled_qty: roundQty(fulfilledQty),
        pending_qty: roundQty(pendingQty),
        stock_snapshot: roundQty(stockSnapshot),
        requested_stock_qty: roundQty(requestedStockQty),
        fulfilled_stock_qty: roundQty(fulfilledStockQty),
        pending_stock_qty: roundQty(pendingStockQty),
        stock_snapshot_base: roundQty(stockSnapshotBase),
      };
    }
    if (fulfillmentMode === 'full_now') {
      return {
        ...it,
        requested_qty: roundQty(requestedQty),
        available_now_qty: roundQty(requestedQty),
        fulfilled_qty: roundQty(requestedQty),
        pending_qty: 0,
        stock_snapshot: roundQty(stockSnapshot),
        requested_stock_qty: roundQty(requestedStockQty),
        fulfilled_stock_qty: roundQty(requestedStockQty),
        pending_stock_qty: 0,
        stock_snapshot_base: roundQty(stockSnapshotBase),
      };
    }
    const fulfilledRemaining = Math.max(0, Number(linkedFulfilledRemainingByProductId.get(productId) || 0));
    const fulfilledQty = Math.min(requestedQty, fulfilledRemaining);
    const pendingQty = Math.max(0, requestedQty - fulfilledQty);
    const fulfilledStockQty = product ? toStockUnitQty(fulfilledQty, it.unit, product) : fulfilledQty;
    const pendingStockQty = Math.max(0, requestedStockQty - fulfilledStockQty);
    linkedFulfilledRemainingByProductId.set(productId, Math.max(0, fulfilledRemaining - fulfilledQty));
    return {
      ...it,
      requested_qty: roundQty(requestedQty),
      available_now_qty: roundQty(fulfilledQty),
      fulfilled_qty: roundQty(fulfilledQty),
      pending_qty: roundQty(pendingQty),
      stock_snapshot: roundQty(stockSnapshot),
      requested_stock_qty: roundQty(requestedStockQty),
      fulfilled_stock_qty: roundQty(fulfilledStockQty),
      pending_stock_qty: roundQty(pendingStockQty),
      stock_snapshot_base: roundQty(stockSnapshotBase),
    };
  });
  const salesQtyByProduct = new Map();
  const shouldApplySalesStock = billType === 'sales' && !linkedOrderId;
  if (shouldApplySalesStock) {
    itemFulfillmentRows.forEach((it) => {
      if (!it.product_id) return;
      const fulfilledStockQty = Math.max(0, Number(it.fulfilled_stock_qty ?? it.fulfilled_qty ?? 0));
      if (fulfilledStockQty <= 0) return;
      salesQtyByProduct.set(
        it.product_id,
        Number(salesQtyByProduct.get(it.product_id) || 0) + fulfilledStockQty
      );
    });
  }
  const subtotal = itemFulfillmentRows.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const billDiscount = Math.min(subtotal, Math.max(0, Number(b.discount_amount || 0)));
  const totalAmount = Math.max(0, subtotal - billDiscount);
  const paidAmount = Math.max(0, Math.min(totalAmount, Number(b.paid_amount || 0)));
  const creditAmount = Math.max(0, totalAmount - paidAmount);
  const paymentStatus = creditAmount > 0 ? 'pending' : 'paid';
  const billNumber = generateBillNumber();
  const normalizedOrderId = linkedOrderId || null;

  return {
    clientRequestId,
    linkedOrderId,
    draft: {
      billNumber,
      billType,
      fulfillmentMode,
      customer,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      itemFulfillmentRows,
      shouldApplySalesStock,
      salesQtyByProduct,
      subtotal,
      billDiscount,
      totalAmount,
      paidAmount,
      creditAmount,
      paymentStatus,
      normalizedOrderId,
      linkedOrderItems,
    },
  };
};

module.exports = { buildBillDraft };
