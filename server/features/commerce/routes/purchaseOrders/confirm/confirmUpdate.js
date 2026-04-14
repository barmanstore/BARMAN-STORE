const updatePurchaseOrderOnConfirm = async (deps, {
  req,
  billNumber,
  nextLifecycleStatus,
  totalSnapshot,
  paymentDueDate,
  nextAction,
  confirmedAt,
  delivered,
}) => {
  const { dbRunAsync } = deps;

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
         delivered = ?,
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
      delivered ? 1 : 0,
      confirmedAt,
      req.params.id,
    ]
  );
};

module.exports = { updatePurchaseOrderOnConfirm };
