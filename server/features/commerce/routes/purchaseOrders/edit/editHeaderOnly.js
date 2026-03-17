const updatePurchaseOrderHeaderOnly = async (deps, {
  req,
  cur,
  updatedDistributorId,
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
    dbRunAsync,
    calculatePoPaymentSnapshot,
    buildPurchaseDuplicateKey,
    recordPurchaseOrderStatusHistoryAsync,
    derivePurchaseNextAction,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
  } = deps;

  const nextSubtotal = Number(req.body?.subtotal ?? cur.subtotal ?? 0);
  const nextTaxAmount = Number(req.body?.tax_amount ?? cur.tax_amount ?? 0);
  const nextTotalAmount = Number(req.body?.total_amount ?? cur.total_amount ?? cur.total ?? 0);
  const paymentSnapshot = calculatePoPaymentSnapshot(nextTotalAmount, Number(cur.paid_amount || 0));
  const duplicateKey = cur.duplicate_key || buildPurchaseDuplicateKey({
    distributorId: updatedDistributorId,
    plannedOrderDate,
    items: await dbAllAsync('SELECT product_id, product_name, quantity, uom FROM purchase_order_items WHERE order_id = ?', [req.params.id]),
  });

  await dbRunAsync(
    `UPDATE purchase_orders
     SET distributor_id=?, notes=?, expected_delivery=?, planned_order_date=?, payment_due_date=?, strict_due_date=?, strict_due_note=?, duplicate_key=?, status=?, po_status=?, revision_count=?, next_action=?, subtotal=?, tax_amount=?, total_amount=?, total=?, payment_status=?, paid_amount=?, balance_due=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [
      updatedDistributorId,
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
      nextSubtotal,
      nextTaxAmount,
      nextTotalAmount,
      nextTotalAmount,
      paymentSnapshot.paymentStatus,
      paymentSnapshot.paidAmount,
      paymentSnapshot.balanceDue,
      req.params.id
    ]
  );

  if (nextLifecycleStatus !== currentPoStatus) {
    await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
      fromStatus: currentPoStatus,
      toStatus: nextLifecycleStatus,
      note: 'Purchase order revised after header edits',
      paymentStatus: paymentSnapshot.paymentStatus,
      balanceDue: paymentSnapshot.balanceDue,
      createdBy: req?.authUser?.id || req.body?.created_by || null,
    });
  }

  return { paymentSnapshot };
};

module.exports = { updatePurchaseOrderHeaderOnly };
