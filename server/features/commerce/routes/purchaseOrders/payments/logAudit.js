const logPurchaseOrderPaymentAudit = async ({
  req,
  logAdminAuditAsync,
  orderId,
  amount,
  paymentMode,
  reference,
  paymentId,
  paymentStatus,
  paidAmount,
  balanceDue,
}) => {
  await logAdminAuditAsync(req, {
    action: 'purchase_order.payment_add',
    entityType: 'purchase_order',
    entityId: orderId,
    details: {
      amount,
      payment_mode: paymentMode,
      reference,
      payment_id: paymentId,
      payment_status: paymentStatus,
      paid_amount: paidAmount,
      balance_due: balanceDue,
    },
  });
};

module.exports = { logPurchaseOrderPaymentAudit };
