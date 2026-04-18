const buildSummaryAmounts = ({
  todayKey,
  orders,
  openOrders,
  payablesWithInsights,
  predictedPaymentsToday,
  ledgerBalanceByDistributor,
  paidTodayAmount,
  getPurchaseOrderLifecycleStatus,
  PO_LIFECYCLE_CANCELLED,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_SENT,
  PO_LIFECYCLE_REVISED,
} = {}) => {
  const payableTodayAmount = (payablesWithInsights || [])
    .filter((entry) => entry.payment_due_date === todayKey)
    .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
  const overdueAmount = (payablesWithInsights || [])
    .filter((entry) => entry.payment_due_date < todayKey)
    .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
  const predictedPaymentTodayAmount = (predictedPaymentsToday || [])
    .filter((entry) => entry.prediction_reason !== 'overdue')
    .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
  const outstandingPoAmount = (orders || []).reduce((sum, order) => {
    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    if (lifecycleStatus === PO_LIFECYCLE_CANCELLED) return sum;
    return sum + Math.max(0, Number(order.balance_due || 0));
  }, 0);
  const unpostedOutstandingAmount = (openOrders || []).reduce((sum, order) => {
    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    if (
      lifecycleStatus === PO_LIFECYCLE_PREPARED ||
      lifecycleStatus === PO_LIFECYCLE_SENT ||
      lifecycleStatus === PO_LIFECYCLE_REVISED
    ) {
      return sum + Math.max(0, Number(order.balance_due || 0));
    }
    return sum;
  }, 0);
  const ledgerOutstandingAmount = [...(ledgerBalanceByDistributor || new Map()).values()].reduce(
    (sum, balance) => {
      const numeric = Number(balance || 0);
      return sum + (numeric > 0 ? numeric : 0);
    },
    0
  );
  const outstandingAmount = ledgerOutstandingAmount + unpostedOutstandingAmount;

  return {
    outstandingAmount,
    ledgerOutstandingAmount,
    outstandingPoAmount,
    payableTodayAmount,
    overdueAmount,
    predictedPaymentTodayAmount,
    paidTodayAmount: Number(paidTodayAmount || 0),
  };
};

module.exports = { buildSummaryAmounts };
