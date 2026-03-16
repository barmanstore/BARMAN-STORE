const createPurchaseOperationsSummaryCards = (deps) => {
  const {
    getPurchaseOrderLifecycleStatus,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_FULLY_PAID,
  } = deps;

  const buildSummaryCards = ({
    baseData,
    metrics,
    payablesWithInsights,
    reminders,
    predictedPaymentsToday,
    predictedPaymentsNext,
    predictedDeliveriesNext,
    nextPaymentDate,
    nextDeliveryDate,
    todayDistributors,
    tomorrowDistributors,
    weeklyDistributors,
  }) => {
    const { todayKey, orders } = baseData;
    const { openOrders, isDeliveryPending, ledgerBalanceByDistributor, paidTodayAmount } = metrics;

    const waitingBillCount = openOrders.filter((order) => {
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      return (lifecycleStatus === PO_LIFECYCLE_SENT || lifecycleStatus === PO_LIFECYCLE_REVISED || lifecycleStatus === PO_LIFECYCLE_PREPARED)
        && !String(order.bill_number || order.invoice_number || '').trim();
    }).length;
    const waitingDeliveryCount = openOrders.filter(isDeliveryPending).length;
    const closeReadyCount = openOrders.filter((order) => getPurchaseOrderLifecycleStatus(order) === PO_LIFECYCLE_FULLY_PAID).length;
    const payableTodayAmount = payablesWithInsights
      .filter((entry) => entry.payment_due_date === todayKey)
      .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
    const overdueAmount = payablesWithInsights
      .filter((entry) => entry.payment_due_date < todayKey)
      .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
    const predictedPaymentTodayAmount = predictedPaymentsToday
      .filter((entry) => entry.prediction_reason !== 'overdue')
      .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
    const outstandingPoAmount = orders.reduce((sum, order) => {
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      if (lifecycleStatus === PO_LIFECYCLE_CANCELLED) return sum;
      return sum + Math.max(0, Number(order.balance_due || 0));
    }, 0);
    const unpostedOutstandingAmount = openOrders.reduce((sum, order) => {
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      if (
        lifecycleStatus === PO_LIFECYCLE_PREPARED
        || lifecycleStatus === PO_LIFECYCLE_SENT
        || lifecycleStatus === PO_LIFECYCLE_REVISED
      ) {
        return sum + Math.max(0, Number(order.balance_due || 0));
      }
      return sum;
    }, 0);
    const ledgerOutstandingAmount = [...ledgerBalanceByDistributor.values()].reduce(
      (sum, balance) => {
        const numeric = Number(balance || 0);
        return sum + (numeric > 0 ? numeric : 0);
      },
      0
    );
    const outstandingAmount = ledgerOutstandingAmount + unpostedOutstandingAmount;

    return {
      outstanding_amount: outstandingAmount,
      ledger_outstanding_amount: ledgerOutstandingAmount,
      po_outstanding_amount: outstandingPoAmount,
      payable_today_amount: payableTodayAmount,
      overdue_amount: overdueAmount,
      predicted_payment_today_amount: predictedPaymentTodayAmount,
      predicted_payment_next_count: predictedPaymentsNext.length,
      predicted_delivery_next_count: predictedDeliveriesNext.length,
      next_payment_due_date: nextPaymentDate,
      next_delivery_date: nextDeliveryDate,
      paid_today_amount: paidTodayAmount,
      reminder_count: reminders.length,
      waiting_bill_count: waitingBillCount,
      waiting_delivery_count: waitingDeliveryCount,
      close_ready_count: closeReadyCount,
      today_distributor_count: todayDistributors.length,
      tomorrow_distributor_count: tomorrowDistributors.length,
      weekly_distributor_count: weeklyDistributors.length,
    };
  };

  return { buildSummaryCards };
};

module.exports = { createPurchaseOperationsSummaryCards };
