const handlePurchaseOrderClose = async (deps, {
  req,
  res,
  order,
  currentPoStatus,
}) => {
  const {
    dbRunAsync,
    canPoAcceptPayment,
    logAdminAuditAsync,
    normalizePoPaymentStatus,
    recordPurchaseOrderStatusHistoryAsync,
    PO_LIFECYCLE_CLOSED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_PAYMENT_PAID,
    PO_PAYMENT_UNPAID,
  } = deps;

  const balanceDue = Math.max(0, Number(order.balance_due || 0));
  if (!canPoAcceptPayment(currentPoStatus) && currentPoStatus !== PO_LIFECYCLE_FULLY_PAID) {
    return res.status(400).json({ error: 'Only confirmed purchase orders can be closed' });
  }
  if (balanceDue > 0 || normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID) !== PO_PAYMENT_PAID) {
    return res.status(400).json({ error: 'Purchase order can be closed only after full payment' });
  }
  await dbRunAsync(
    `UPDATE purchase_orders
     SET po_status = ?,
         next_action = 'Closed',
         closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [PO_LIFECYCLE_CLOSED, req.params.id]
  );
  await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
    fromStatus: currentPoStatus,
    toStatus: PO_LIFECYCLE_CLOSED,
    note: 'Purchase order closed',
    billNumber: order.bill_number || order.invoice_number || null,
    paymentStatus: order.payment_status,
    balanceDue: 0,
    createdBy: req.body?.updated_by || req.body?.created_by || null,
  });
  await logAdminAuditAsync(req, {
    action: 'purchase_order.status_update',
    entityType: 'purchase_order',
    entityId: req.params.id,
    details: {
      status: 'closed',
      po_status: PO_LIFECYCLE_CLOSED,
    },
  });
  return res.json({ success: true, po_status: PO_LIFECYCLE_CLOSED });
};

module.exports = { handlePurchaseOrderClose };
