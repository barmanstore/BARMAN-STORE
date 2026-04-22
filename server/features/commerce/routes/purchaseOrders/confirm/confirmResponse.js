const buildConfirmResponse = ({
  nextLifecycleStatus,
  totalSnapshot,
  paymentDueDate,
  stockAlreadyApplied,
  capAdjustments,
  PURCHASE_STOCK_CAP,
  delivered,
}) => ({
  success: true,
  po_status: nextLifecycleStatus,
  payment_status: totalSnapshot.paymentStatus,
  paid_amount: totalSnapshot.paidAmount,
  balance_due: totalSnapshot.balanceDue,
  payment_due_date: paymentDueDate,
  delivered: Boolean(delivered),
  stock_cap: PURCHASE_STOCK_CAP,
  stock_applied: !stockAlreadyApplied,
  stock_already_applied: stockAlreadyApplied,
  cap_applied_count: capAdjustments.length,
  cap_adjustments: capAdjustments,
});

module.exports = { buildConfirmResponse };
