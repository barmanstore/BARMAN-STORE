const handlePurchaseOrderConfirm = async (deps, {
  req,
  res,
  order,
  currentPoStatus,
  billNumber,
}) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    calculatePoPaymentSnapshot,
    computePurchasePaymentDueDate,
    createDistributorLedgerEntry,
    derivePoLifecycleFromPaymentStatus,
    derivePurchaseNextAction,
    findDuplicateDistributorBillAsync,
    getDistributorByIdAsync,
    isPoEditableLifecycle,
    logAdminAuditAsync,
    logStockLedgerAsync,
    normalizeTransactionDate,
    recordPurchaseOrderStatusHistoryAsync,
    toPurchaseBaseQty,
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_PART_PAID,
    PURCHASE_STOCK_CAP,
  } = deps;

  if (!isPoEditableLifecycle(currentPoStatus)) {
    return res.status(400).json({ error: 'Only prepared, sent, or revised purchase orders can be confirmed' });
  }
  if (!billNumber) {
    return res.status(400).json({ error: 'bill_number is required when confirming a purchase order' });
  }
  const duplicateBill = await findDuplicateDistributorBillAsync({
    distributorId: Number(order.distributor_id || 0),
    billNumber,
    excludeOrderId: Number(req.params.id || 0),
  });
  if (duplicateBill) {
    return res.status(409).json({
      error: `Bill number already exists for this distributor on ${duplicateBill.po_number}`,
      conflict_type: 'purchase_bill_duplicate',
      conflict: duplicateBill,
    });
  }

  const initialPaidAmountRaw = Number(
    req.body?.paid_amount ?? req.body?.initial_paid_amount ?? req.body?.payment_amount ?? 0
  );
  const initialPaidAmount = Math.max(0, initialPaidAmountRaw);
  const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
  const paymentReference = String(req.body?.payment_reference || req.body?.reference || billNumber || '').trim() || null;
  const paymentNotes = String(req.body?.payment_notes || req.body?.notes || '').trim() || null;
  const paymentDate = normalizeTransactionDate(req.body?.payment_date || req.body?.transaction_date || new Date().toISOString());
  const confirmedAt = new Date().toISOString();
  const distributorId = Number(order.distributor_id || 0);
  const distributor = await getDistributorByIdAsync(distributorId);
  if (distributorId > 0 && !distributor) {
    return res.status(400).json({ error: 'Purchase order distributor not found. Reassign the distributor before processing this PO.' });
  }
  const totalSnapshot = calculatePoPaymentSnapshot(Number(order.total_amount ?? order.total ?? 0), initialPaidAmount);
  if (initialPaidAmount > totalSnapshot.totalAmount) {
    return res.status(400).json({ error: 'Initial paid amount cannot exceed PO total amount' });
  }

  const stockAlreadyApplied = Number(order.stock_applied_on_confirm || 0) === 1;
  const capAdjustments = [];
  let createdPaymentId = null;
  const nextLifecycleStatus = derivePoLifecycleFromPaymentStatus(PO_LIFECYCLE_CONFIRMED, totalSnapshot.paymentStatus);
  const nextAction = derivePurchaseNextAction({
    ...order,
    po_status: nextLifecycleStatus,
    status: 'confirmed',
    payment_status: totalSnapshot.paymentStatus,
    balance_due: totalSnapshot.balanceDue,
  });
  const paymentDueDate = normalizeTransactionDate(order.strict_due_date)
    || computePurchasePaymentDueDate(
      distributor || {},
      paymentDate || order.planned_order_date || order.expected_delivery || order.created_at,
    );
  await dbTxAsync(async () => {
    if (!stockAlreadyApplied) {
      const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
      for (const item of items) {
        const productId = Number(item.product_id || 0);
        if (!productId) continue;
        const product = await dbGetAsync(
          `SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
          [productId]
        );
        if (!product) continue;

        const orderedQtyInput = Math.max(0, Number(item.quantity || 0));
        const orderedQty = toPurchaseBaseQty(orderedQtyInput, item.uom, product);
        const beforeStock = Number(product.stock || 0);
        const intendedStock = beforeStock + orderedQty;
        const finalStock = Math.min(PURCHASE_STOCK_CAP, Math.max(0, intendedStock));
        const quantityChange = finalStock - beforeStock;
        const capHit = intendedStock > PURCHASE_STOCK_CAP || beforeStock > PURCHASE_STOCK_CAP;

        if (quantityChange !== 0) {
          await dbRunAsync(`UPDATE products SET stock = ? WHERE id = ?`, [finalStock, productId]);
          const noteLines = ['Auto stock update on PO confirmation'];
          if (capHit) {
            noteLines.push(`Stock cap ${PURCHASE_STOCK_CAP} applied (intended ${intendedStock}, final ${finalStock})`);
          }
          await logStockLedgerAsync({
            productId,
            transactionType: quantityChange >= 0 ? 'PURCHASE' : 'ADJUSTMENT',
            quantityChange,
            previousBalance: beforeStock,
            newBalance: finalStock,
            referenceType: 'PO_CONFIRM',
            referenceId: String(req.params.id),
            userId: req.body?.updated_by || req.body?.created_by || null,
            notes: noteLines.join('. '),
          });
        }

        if (capHit) {
          capAdjustments.push({
            product_id: productId,
            product_name: item.product_name || null,
            ordered_quantity: orderedQtyInput,
            ordered_quantity_base: orderedQty,
            before_stock: beforeStock,
            intended_stock: intendedStock,
            final_stock: finalStock,
            discarded_quantity: Math.max(0, intendedStock - finalStock),
            discarded_quantity_base: Math.max(0, intendedStock - finalStock),
          });
        }
      }
    }

    const existingPoCredit = await dbGetAsync(
      `SELECT id
       FROM distributor_ledger
       WHERE distributor_id = ?
         AND source = 'purchase_order'
         AND LOWER(type) = 'credit'
         AND (source_id = ? OR source_id = ?)
       ORDER BY id DESC
       LIMIT 1`,
      [order.distributor_id, String(req.params.id), `${req.params.id}.0`]
    );
    if (!existingPoCredit && distributorId > 0 && totalSnapshot.totalAmount > 0) {
      await createDistributorLedgerEntry(order.distributor_id, {
        type: 'credit',
        transaction_type: 'credit',
        amount: totalSnapshot.totalAmount,
        payment_mode: 'credit',
        reference: order.po_number || `PO-${req.params.id}`,
        bill_number: billNumber || null,
        description: `Purchase Order ${order.po_number || req.params.id}${billNumber ? ` (Bill: ${billNumber})` : ''}`.trim(),
        transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
        source: 'purchase_order',
        source_id: req.params.id,
        created_by: req.body?.updated_by || req.body?.created_by || null,
      });
    }

    if (totalSnapshot.paidAmount > 0 && distributorId > 0) {
      const paymentResult = await dbRunAsync(
        `INSERT INTO purchase_order_payments
         (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          order.distributor_id,
          totalSnapshot.paidAmount,
          paymentMode,
          paymentReference,
          paymentNotes,
          paymentDate,
          req.body?.updated_by || req.body?.created_by || null,
        ]
      );
      createdPaymentId = Number(paymentResult.lastInsertRowid || 0) || null;
      if (createdPaymentId) {
        await createDistributorLedgerEntry(order.distributor_id, {
          type: 'payment',
          transaction_type: 'payment',
          amount: totalSnapshot.paidAmount,
          payment_mode: paymentMode,
          reference: paymentReference || order.po_number || `PO-${req.params.id}`,
          bill_number: billNumber || null,
          description: `PO payment on confirmation ${order.po_number || req.params.id}`,
          transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
          source: 'po_payment',
          source_id: createdPaymentId,
          created_by: req.body?.updated_by || req.body?.created_by || null,
        });
      }
    }

    await dbRunAsync(
      `UPDATE purchase_orders
       SET status = 'confirmed',
           po_status = ?,
           payment_status = ?,
           paid_amount = ?,
           balance_due = ?,
           bill_number = COALESCE(?, bill_number),
           invoice_number = COALESCE(?, invoice_number),
           payment_due_date = ?,
           next_action = ?,
           stock_applied_on_confirm = 1,
           confirmed_at = COALESCE(confirmed_at, ?),
           processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      [
        nextLifecycleStatus,
        totalSnapshot.paymentStatus,
        totalSnapshot.paidAmount,
        totalSnapshot.balanceDue,
        billNumber || null,
        billNumber || null,
        paymentDueDate,
        nextAction,
        confirmedAt,
        req.params.id,
      ]
    );
  });

  await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
    fromStatus: currentPoStatus,
    toStatus: nextLifecycleStatus,
    note: 'Purchase order confirmed with bill',
    billNumber: billNumber || null,
    paymentStatus: totalSnapshot.paymentStatus,
    balanceDue: totalSnapshot.balanceDue,
    createdBy: req.body?.updated_by || req.body?.created_by || null,
  });
  await logAdminAuditAsync(req, {
    action: 'purchase_order.status_update',
    entityType: 'purchase_order',
    entityId: req.params.id,
    details: {
      status: 'confirmed',
      po_status: nextLifecycleStatus,
      bill_number: billNumber || null,
      initial_paid_amount: totalSnapshot.paidAmount,
      balance_due: totalSnapshot.balanceDue,
      payment_status: totalSnapshot.paymentStatus,
      stock_applied: !stockAlreadyApplied,
      stock_already_applied: stockAlreadyApplied,
      cap_applied_count: capAdjustments.length,
      process_payment_id: createdPaymentId,
    },
  });
  return res.json({
    success: true,
    po_status: nextLifecycleStatus,
    payment_status: totalSnapshot.paymentStatus,
    paid_amount: totalSnapshot.paidAmount,
    balance_due: totalSnapshot.balanceDue,
    payment_due_date: paymentDueDate,
    stock_cap: PURCHASE_STOCK_CAP,
    stock_applied: !stockAlreadyApplied,
    stock_already_applied: stockAlreadyApplied,
    cap_applied_count: capAdjustments.length,
    cap_adjustments: capAdjustments,
  });
};

module.exports = { handlePurchaseOrderConfirm };
