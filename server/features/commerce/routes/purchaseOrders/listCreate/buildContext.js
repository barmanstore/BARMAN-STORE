const buildPurchaseOrderContext = ({
  body,
  distributor,
  normalizedItems,
  buildPurchaseDuplicateKey,
  normalizeTransactionDate,
  calculatePoPaymentSnapshot,
  computePurchasePaymentDueDate,
}) => {
  const plannedOrderDate = normalizeTransactionDate(
    body.planned_order_date || body.expected_delivery || new Date().toISOString()
  )
    || new Date().toISOString().slice(0, 10);

  const duplicateKey = buildPurchaseDuplicateKey({
    distributorId: Number(body.distributor_id || 0),
    plannedOrderDate,
    items: normalizedItems,
  });

  const subtotal = normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0);
  const taxAmount = normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
  const totalAmount = normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);

  const paymentSnapshot = calculatePoPaymentSnapshot(totalAmount, 0);
  const inferredPaymentDueDate = computePurchasePaymentDueDate(
    distributor,
    plannedOrderDate,
    {
      payment_cycle_type: body.payment_cycle_type,
      payment_due_days: body.payment_due_days,
    }
  );

  const strictDueDate = normalizeTransactionDate(body.strict_due_date || body.strict_payment_due_date || null);
  const strictDueNote = String(body.strict_due_note || body.strict_deadline_note || '').trim() || null;
  const paymentDueDate = strictDueDate || inferredPaymentDueDate;

  return {
    plannedOrderDate,
    duplicateKey,
    subtotal,
    taxAmount,
    totalAmount,
    paymentSnapshot,
    paymentDueDate,
    strictDueDate,
    strictDueNote,
  };
};

module.exports = { buildPurchaseOrderContext };
