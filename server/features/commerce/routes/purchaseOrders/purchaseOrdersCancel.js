const handlePurchaseOrderCancel = async (deps, {
  req,
  res,
  order,
  currentPoStatus,
  billNumber,
}) => {
  const {
    dbRunAsync,
    isPoEditableLifecycle,
    logAdminAuditAsync,
    normalizePoPaymentStatus,
    recordPurchaseOrderStatusHistoryAsync,
    PO_LIFECYCLE_CANCELLED,
    PO_PAYMENT_UNPAID,
  } = deps;

  if (!isPoEditableLifecycle(currentPoStatus)) {
    return res.status(400).json({ error: 'Only unconfirmed purchase orders can be cancelled' });
  }
  await dbRunAsync(
    `UPDATE purchase_orders
     SET status = 'cancelled',
         po_status = ?,
         next_action = 'Cancelled',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [PO_LIFECYCLE_CANCELLED, req.params.id]
  );
  await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
    fromStatus: currentPoStatus,
    toStatus: PO_LIFECYCLE_CANCELLED,
    note: 'Purchase order cancelled',
    billNumber: billNumber || null,
    paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
    balanceDue: Number(order.balance_due || 0),
    createdBy: req.body?.updated_by || req.body?.created_by || null,
  });
  await logAdminAuditAsync(req, {
    action: 'purchase_order.status_update',
    entityType: 'purchase_order',
    entityId: req.params.id,
    details: {
      status: 'cancelled',
      po_status: PO_LIFECYCLE_CANCELLED,
      bill_number: billNumber || null,
    },
  });
  return res.json({ success: true, po_status: PO_LIFECYCLE_CANCELLED });
};

module.exports = { handlePurchaseOrderCancel };
