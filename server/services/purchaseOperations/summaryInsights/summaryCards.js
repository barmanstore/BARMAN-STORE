const { buildOrderCounts } = require('./summaryCards/orderCounts');
const { buildSummaryAmounts } = require('./summaryCards/amounts');
const { buildSummaryCounts } = require('./summaryCards/counts');

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

    const orderCounts = buildOrderCounts({
      openOrders,
      isDeliveryPending,
      getPurchaseOrderLifecycleStatus,
      PO_LIFECYCLE_PREPARED,
      PO_LIFECYCLE_SENT,
      PO_LIFECYCLE_REVISED,
      PO_LIFECYCLE_FULLY_PAID,
    });

    const amounts = buildSummaryAmounts({
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
    });

    const counts = buildSummaryCounts({
      reminders,
      predictedPaymentsNext,
      predictedDeliveriesNext,
      nextPaymentDate,
      nextDeliveryDate,
      todayDistributors,
      tomorrowDistributors,
      weeklyDistributors,
    });

    return {
      outstanding_amount: amounts.outstandingAmount,
      ledger_outstanding_amount: amounts.ledgerOutstandingAmount,
      po_outstanding_amount: amounts.outstandingPoAmount,
      payable_today_amount: amounts.payableTodayAmount,
      overdue_amount: amounts.overdueAmount,
      predicted_payment_today_amount: amounts.predictedPaymentTodayAmount,
      predicted_payment_next_count: counts.predictedPaymentNextCount,
      predicted_delivery_next_count: counts.predictedDeliveryNextCount,
      next_payment_due_date: counts.nextPaymentDate,
      next_delivery_date: counts.nextDeliveryDate,
      paid_today_amount: amounts.paidTodayAmount,
      reminder_count: counts.reminderCount,
      waiting_bill_count: orderCounts.waitingBillCount,
      waiting_delivery_count: orderCounts.waitingDeliveryCount,
      close_ready_count: orderCounts.closeReadyCount,
      today_distributor_count: counts.todayDistributorCount,
      tomorrow_distributor_count: counts.tomorrowDistributorCount,
      weekly_distributor_count: counts.weeklyDistributorCount,
    };
  };

  return { buildSummaryCards };
};

module.exports = { createPurchaseOperationsSummaryCards };
