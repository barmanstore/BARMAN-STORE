const buildPaymentDeliveryForecast = ({
  completedOrders,
  openDistributorOrders,
  payablesByDistributor,
  distributorId,
  ledgerBalanceByDistributor,
  computeAverageDays,
  getDistributorPaymentPlan,
  getPurchaseOrderPaymentAnchorDateKey,
  getPurchaseOrderAnchorDateKey,
  distributor,
  normalizeTransactionDate,
  addDaysToDateKey,
  pickEarliestDateKey,
  pickLatestDateKey,
  paymentLagDays,
  deliveryLagDays,
  paymentDateKeys,
  deliveryDateKeys,
  lastOrderDateKey,
} = {}) => {
  const openPayables = payablesByDistributor.get(distributorId) || [];
  const outstandingAmount = openDistributorOrders.reduce((sum, order) => sum + Math.max(0, Number(order.balance_due || 0)), 0);
  const configuredPaymentPlan = getDistributorPaymentPlan(distributor);
  const avgPaymentLagDays = computeAverageDays(paymentLagDays);
  const avgDeliveryDays = computeAverageDays(deliveryLagDays);
  const paymentReferenceOrder = completedOrders.find((order) => Number(order.balance_due || 0) > 0) || completedOrders[0] || null;
  const paymentAnchorDate = paymentReferenceOrder
    ? getPurchaseOrderPaymentAnchorDateKey(paymentReferenceOrder)
    : null;
  const inferredDueDate = paymentAnchorDate
    ? addDaysToDateKey(paymentAnchorDate, avgPaymentLagDays ?? configuredPaymentPlan.paymentDueDays)
    : null;
  const nextPaymentDueDate = pickEarliestDateKey(openPayables.map((entry) => entry.payment_due_date))
    || inferredDueDate
    || null;
  const nextPaymentDueSource = openPayables.length
    ? 'open_payable'
    : (inferredDueDate ? 'history_inferred' : 'unknown');
  const predictedPaymentAmount = nextPaymentDueDate
    ? openPayables
      .filter((entry) => entry.payment_due_date === nextPaymentDueDate)
      .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0)
    : 0;
  const openDeliveryDates = openDistributorOrders
    .map((order) => normalizeTransactionDate(order.expected_delivery || null))
    .filter(Boolean);
  const inferredDeliveryDate = avgDeliveryDays && lastOrderDateKey
    ? addDaysToDateKey(lastOrderDateKey, avgDeliveryDays)
    : null;
  const nextDeliveryDate = pickEarliestDateKey(openDeliveryDates) || inferredDeliveryDate || null;
  const nextDeliverySource = openDeliveryDates.length
    ? 'open_order'
    : (inferredDeliveryDate ? 'history_inferred' : 'unknown');
  const predictedDeliveryCount = nextDeliveryDate
    ? openDistributorOrders.filter((order) => normalizeTransactionDate(order.expected_delivery || null) === nextDeliveryDate).length
    : 0;

  return {
    outstandingAmount,
    ledgerBalance: Number(ledgerBalanceByDistributor.get(distributorId) || 0),
    lastDeliveryDate: pickLatestDateKey(deliveryDateKeys),
    lastPaymentDate: pickLatestDateKey(paymentDateKeys),
    nextPaymentDueDate,
    nextPaymentDueSource,
    predictedPaymentAmount,
    nextDeliveryDate,
    nextDeliverySource,
    predictedDeliveryCount,
    configuredPaymentDueDays: configuredPaymentPlan.paymentDueDays,
    inferredPaymentDueDays: avgPaymentLagDays,
    avgDeliveryDays,
    inferredDueDate: inferredDueDate || null,
  };
};

module.exports = { buildPaymentDeliveryForecast };
