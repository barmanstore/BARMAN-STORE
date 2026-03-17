const finalizePurchaseOrderReceive = async (deps, {
  req,
  order,
  poStatus,
  nextAction,
}) => {
  const {
    dbGetAsync,
    dbRunAsync,
    calculatePoPaymentSnapshot,
    derivePoLifecycleFromPaymentStatus,
    derivePurchaseNextAction,
  } = deps;

  const totals = await dbGetAsync(
    `SELECT
       COALESCE(SUM(taxable_value), 0) AS subtotal,
       COALESCE(SUM(tax_amount), 0) AS tax_amount,
       COALESCE(SUM(line_total), 0) AS total_amount
     FROM purchase_order_items
     WHERE order_id = ?`,
    [req.params.id]
  );
  const receivePaymentSnapshot = calculatePoPaymentSnapshot(
    Number(totals?.total_amount || 0),
    Number(order.paid_amount || 0)
  );
  const nextLifecycleStatus = derivePoLifecycleFromPaymentStatus(poStatus, receivePaymentSnapshot.paymentStatus);
  const nextActionResolved = derivePurchaseNextAction({
    ...order,
    status: 'received',
    received_at: new Date().toISOString(),
    po_status: nextLifecycleStatus,
    payment_status: receivePaymentSnapshot.paymentStatus,
    balance_due: receivePaymentSnapshot.balanceDue,
  });

  await dbRunAsync(
    `UPDATE purchase_orders
     SET status = 'received',
         po_status = ?,
         invoice_number = ?,
         subtotal = ?,
         tax_amount = ?,
         total_amount = ?,
         total = ?,
         payment_status = ?,
         paid_amount = ?,
         balance_due = ?,
         received_at = COALESCE(received_at, CURRENT_TIMESTAMP),
         next_action = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      nextLifecycleStatus,
      req.body?.invoice_number || order.invoice_number || null,
      Number(totals?.subtotal || 0),
      Number(totals?.tax_amount || 0),
      Number(totals?.total_amount || 0),
      Number(totals?.total_amount || 0),
      receivePaymentSnapshot.paymentStatus,
      receivePaymentSnapshot.paidAmount,
      receivePaymentSnapshot.balanceDue,
      nextActionResolved,
      req.params.id
    ]
  );

  return {
    nextLifecycleStatus,
    nextAction: nextActionResolved,
    receivePaymentSnapshot,
  };
};

module.exports = { finalizePurchaseOrderReceive };
