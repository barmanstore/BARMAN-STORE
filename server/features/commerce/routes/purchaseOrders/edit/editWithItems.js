const updatePurchaseOrderWithItems = async (deps, {
  req,
  cur,
  items,
  updatedDistributorId,
  updatedSupplierId,
  updatedNotes,
  updatedExpectedDelivery,
  plannedOrderDate,
  paymentDueDate,
  strictDueDate,
  strictDueNote,
  currentPoStatus,
  nextLifecycleStatus,
  shouldIncrementRevision,
}) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    acquirePurchaseDuplicateLockAsync,
    buildPurchaseDuplicateKey,
    buildPurchaseTransactionTimestamp,
    calculatePoPaymentSnapshot,
    createPurchaseConflictError,
    findDuplicatePurchaseOrderAsync,
    normalizePurchaseOrderItems,
    recordProductCostHistoryEntryAsync,
    recordPurchaseOrderStatusHistoryAsync,
    syncDistributorProductsSuppliedAsync,
    upsertSupplierProductsAsync,
    derivePurchaseNextAction,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
  } = deps;

  if (!items.length) {
    const error = new Error('At least one item is required');
    error.status = 400;
    throw error;
  }

  const normalizedItems = await normalizePurchaseOrderItems(items);
  const duplicateKey = buildPurchaseDuplicateKey({
    distributorId: updatedDistributorId,
    plannedOrderDate,
    items: normalizedItems,
  });
  const subtotal = normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0);
  const taxAmount = normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
  const totalAmount = normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
  const paymentSnapshot = calculatePoPaymentSnapshot(totalAmount, Number(cur.paid_amount || 0));

  await dbTxAsync(async () => {
    await acquirePurchaseDuplicateLockAsync({
      distributorId: updatedDistributorId,
      plannedOrderDate,
      duplicateKey,
    });
    const existingDuplicate = await findDuplicatePurchaseOrderAsync({
      distributorId: updatedDistributorId,
      plannedOrderDate,
      duplicateKey,
      excludeOrderId: Number(req.params.id || 0),
    });
    if (existingDuplicate) {
      throw createPurchaseConflictError(
        `Possible duplicate purchase order already exists (${existingDuplicate.po_number}) for the same distributor, planned date, and item basket`,
        'purchase_order_duplicate',
        existingDuplicate
      );
    }
    await dbRunAsync(
      `UPDATE purchase_orders
       SET distributor_id=?, supplier_id=?, notes=?, expected_delivery=?, planned_order_date=?, payment_due_date=?, strict_due_date=?, strict_due_note=?, duplicate_key=?, status=?, po_status=?, revision_count=?, next_action=?, subtotal=?, tax_amount=?, total_amount=?, total=?, payment_status=?, paid_amount=?, balance_due=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        updatedDistributorId,
        updatedSupplierId || null,
        updatedNotes || null,
        updatedExpectedDelivery || null,
        plannedOrderDate,
        paymentDueDate,
        strictDueDate,
        strictDueNote,
        duplicateKey,
        nextLifecycleStatus === PO_LIFECYCLE_SENT ? 'sent' : 'pending',
        nextLifecycleStatus,
        shouldIncrementRevision ? Number(cur.revision_count || 0) + 1 : Number(cur.revision_count || 0),
        nextLifecycleStatus === PO_LIFECYCLE_REVISED ? 'Resend updated PO' : derivePurchaseNextAction({ ...cur, po_status: nextLifecycleStatus }),
        subtotal,
        taxAmount,
        totalAmount,
        totalAmount,
        paymentSnapshot.paymentStatus,
        paymentSnapshot.paidAmount,
        paymentSnapshot.balanceDue,
        req.params.id
      ]
    );
    await dbRunAsync('DELETE FROM product_cost_history WHERE po_id = ?', [req.params.id]);
    await dbRunAsync('DELETE FROM purchase_order_items WHERE order_id = ?', [req.params.id]);
    const transactionTs = buildPurchaseTransactionTimestamp(plannedOrderDate, new Date());
    for (const it of normalizedItems) {
      const insert = await dbRunAsync(
        `INSERT INTO purchase_order_items (order_id, product_id, product_name, row_source, quantity, received_quantity, uom, unit_price, rate, unit_price_before_discount, unit_discount_amount, tax_rate, unit_tax_amount, unit_cost_incl_tax, line_total_incl_tax, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          it.product_id || null,
          it.product_name || 'Unknown',
          it.row_source || 'manual',
          Number(it.quantity || 0),
          Number(it.received_quantity || 0),
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
          distributorId: updatedDistributorId,
          purchaseOrderId: Number(req.params.id || 0),
          purchaseOrderItemId: poItemId,
          unitCostInclTax: it.unit_cost_incl_tax,
          taxRate: it.tax_rate || it.gst_rate,
          discountAmount: it.unit_discount_amount,
          transactionTs,
        });
      }
    }
    await upsertSupplierProductsAsync(updatedDistributorId, normalizedItems, {
      supplierId: updatedSupplierId || null,
    });
  });

  await syncDistributorProductsSuppliedAsync(updatedDistributorId, normalizedItems, {
    supplierId: updatedSupplierId || null,
  });
  if (nextLifecycleStatus !== currentPoStatus) {
    await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
      fromStatus: currentPoStatus,
      toStatus: nextLifecycleStatus,
      note: 'Purchase order revised after edits',
      paymentStatus: paymentSnapshot.paymentStatus,
      balanceDue: paymentSnapshot.balanceDue,
      createdBy: req?.authUser?.id || req.body?.created_by || null,
    });
  }

  return { paymentSnapshot };
};

module.exports = { updatePurchaseOrderWithItems };
