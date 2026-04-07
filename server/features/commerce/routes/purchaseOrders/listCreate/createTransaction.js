const createPurchaseOrderTransaction = async ({
  body,
  poNumber,
  clientRequestId,
  context,
  normalizedItems,
  acquirePurchaseDuplicateLockAsync,
  findDuplicatePurchaseOrderAsync,
  createPurchaseConflictError,
  dbTxAsync,
  dbRunAsync,
  dbGetAsync,
  buildPurchaseTransactionTimestamp,
  recordProductCostHistoryEntryAsync,
  upsertSupplierProductsAsync,
  recordPurchaseOrderStatusHistoryAsync,
  PO_LIFECYCLE_PREPARED,
}) => {
  const {
    plannedOrderDate,
    duplicateKey,
    subtotal,
    taxAmount,
    totalAmount,
    paymentSnapshot,
    paymentDueDate,
    strictDueDate,
    strictDueNote,
  } = context;

  const orderId = await dbTxAsync(async () => {
    await acquirePurchaseDuplicateLockAsync({
      distributorId: Number(body.distributor_id || 0),
      plannedOrderDate,
      duplicateKey,
    });

    const existingDuplicate = await findDuplicatePurchaseOrderAsync({
      distributorId: Number(body.distributor_id || 0),
      plannedOrderDate,
      duplicateKey,
    });

    if (existingDuplicate) {
      throw createPurchaseConflictError(
        `Possible duplicate purchase order already exists (${existingDuplicate.po_number}) for the same distributor, planned date, and item basket`,
        'purchase_order_duplicate',
        existingDuplicate
      );
    }

    const header = await dbRunAsync(
      `INSERT INTO purchase_orders
       (po_number, distributor_id, supplier_id, subtotal, tax_amount, total_amount, total, status, po_status, payment_status, paid_amount, balance_due, notes, expected_delivery, planned_order_date, payment_due_date, strict_due_date, strict_due_note, duplicate_key, next_action, created_by, client_request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        poNumber,
        body.distributor_id,
        body.supplier_id || null,
        subtotal,
        taxAmount,
        totalAmount,
        totalAmount,
        'pending',
        PO_LIFECYCLE_PREPARED,
        paymentSnapshot.paymentStatus,
        paymentSnapshot.paidAmount,
        paymentSnapshot.balanceDue,
        body.notes || null,
        body.expected_delivery || null,
        plannedOrderDate,
        paymentDueDate,
        strictDueDate,
        strictDueNote,
        duplicateKey,
        'Send to distributor',
        body.created_by || null,
        clientRequestId,
      ]
    );

    const orderId = header.lastInsertRowid;
    const transactionTs = buildPurchaseTransactionTimestamp(plannedOrderDate, new Date());

    for (const it of normalizedItems) {
      const fallbackName = it.product_id
        ? (await dbGetAsync('SELECT name FROM products WHERE id = ?', [it.product_id]))?.name
        : null;

      const insert = await dbRunAsync(
        `INSERT INTO purchase_order_items (order_id, product_id, product_name, row_source, quantity, received_quantity, uom, unit_price, rate, unit_price_before_discount, unit_discount_amount, tax_rate, unit_tax_amount, unit_cost_incl_tax, line_total_incl_tax, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          it.product_id || null,
          it.product_name || fallbackName || 'Unknown',
          it.row_source || 'manual',
          Number(it.quantity || 0),
          0,
          it.uom || 'pcs',
          Number(it.unit_price || 0),
          Number(it.rate || it.unit_price || 0),
          Number(it.unit_price_before_discount || 0),
          Number(it.unit_discount_amount || 0),
          Number(it.tax_rate || it.gst_rate || 0),
          Number(it.unit_tax_amount || 0),
          Number(it.unit_cost_incl_tax || 0),
          Number(it.line_total_incl_tax || it.line_total || 0),
          Number(it.gst_rate || 0),
          it.discount_type || 'percent',
          Number(it.discount_value || 0),
          Number(it.taxable_value || 0),
          Number(it.tax_amount || 0),
          Number(it.line_total || 0),
          Number(it.line_total || 0),
        ]
      );

      const poItemId = Number(insert?.lastInsertRowid || 0) || null;
      if (it.product_id && poItemId) {
        await recordProductCostHistoryEntryAsync({
          productId: it.product_id,
          distributorId: body.distributor_id,
          purchaseOrderId: orderId,
          purchaseOrderItemId: poItemId,
          unitCostInclTax: it.unit_cost_incl_tax,
          taxRate: it.tax_rate || it.gst_rate,
          discountAmount: it.unit_discount_amount,
          transactionTs,
        });
      }
    }

    await upsertSupplierProductsAsync(body.distributor_id, normalizedItems, {
      supplierId: body.supplier_id || null,
    });
    await recordPurchaseOrderStatusHistoryAsync(orderId, {
      fromStatus: null,
      toStatus: PO_LIFECYCLE_PREPARED,
      note: 'Purchase order prepared',
      paymentStatus: paymentSnapshot.paymentStatus,
      balanceDue: paymentSnapshot.balanceDue,
      createdBy: body.created_by || null,
    });

    return orderId;
  });

  return { orderId };
};

module.exports = { createPurchaseOrderTransaction };
