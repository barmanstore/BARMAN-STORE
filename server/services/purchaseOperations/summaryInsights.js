const {
  createPurchaseOperationsDistributorInsights,
} = require('./summaryInsights/distributorInsights');
const {
  createPurchaseOperationsDistributorSchedules,
} = require('./summaryInsights/distributorSchedules');
const {
  createPurchaseOperationsPaymentPredictions,
} = require('./summaryInsights/paymentPredictions');
const { buildSupplierVisitStates } = require('./summaryInsights/supplierVisits');
const { createPurchaseOperationsSummaryCards } = require('./summaryInsights/summaryCards');

const createPurchaseOperationsSummaryInsights = (deps) => {
  const {
    normalizeTransactionDate,
    getPurchaseOrderLifecycleStatus,
    getEffectivePurchaseDueDateKey,
    PO_LIFECYCLE_PREPARED,
  } = deps;

  const distributorInsights = createPurchaseOperationsDistributorInsights(deps);
  const distributorSchedules = createPurchaseOperationsDistributorSchedules(deps);
  const paymentPredictions = createPurchaseOperationsPaymentPredictions(deps);
  const summaryCards = createPurchaseOperationsSummaryCards(deps);

  const buildPurchaseOperationsInsights = (baseData, metrics) => {
    const { todayKey } = baseData;
    const { openOrders } = metrics;

    const {
      distributorInsights: distributorInsightList,
      distributorInsightById,
      payablesWithInsights,
    } = distributorInsights.buildDistributorInsights({ baseData, metrics });

    const { todayDistributors, tomorrowDistributors, weeklyDistributors, reminders } =
      distributorSchedules.buildDistributorSchedules({
        baseData,
        metrics,
        distributorInsightById,
        payablesWithInsights,
      });

    const {
      predictedPaymentsToday,
      predictedPaymentsNext,
      predictedDeliveriesNext,
      nextPaymentDate,
      nextDeliveryDate,
    } = paymentPredictions.buildPaymentPredictions({
      baseData,
      payablesWithInsights,
      distributorInsights: distributorInsightList,
    });

    const supplierVisits = buildSupplierVisitStates({
      baseData,
      metrics,
      weeklyDistributors,
      addDaysToDateKey: deps.addDaysToDateKey,
      getSupplierScheduleConfig: deps.getSupplierScheduleConfig,
      getWeekdayFromDateKey: deps.getWeekdayFromDateKey,
      getPurchaseOrderLifecycleStatus,
      normalizeTransactionDate,
      PO_LIFECYCLE_CONFIRMED: deps.PO_LIFECYCLE_CONFIRMED,
      PO_LIFECYCLE_PART_PAID: deps.PO_LIFECYCLE_PART_PAID,
      PO_LIFECYCLE_FULLY_PAID: deps.PO_LIFECYCLE_FULLY_PAID,
      PO_LIFECYCLE_CLOSED: deps.PO_LIFECYCLE_CLOSED,
    });

    const workflow = openOrders
      .map((order) => {
        const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
        const paymentDueDate = getEffectivePurchaseDueDateKey(order, todayKey);
        const urgencyScore =
          (paymentDueDate < todayKey ? 100 : 0) +
          (order.next_action === 'Confirm with bill' ? 80 : 0) +
          (order.next_action === 'Collect payment' ? 70 : 0) +
          (order.next_action === 'Receive delivery' ? 60 : 0) +
          (order.next_action === 'Close PO' ? 50 : 0) +
          (lifecycleStatus === PO_LIFECYCLE_PREPARED ? 40 : 0);
        return {
          order_id: Number(order.id || 0),
          po_number: order.po_number,
          distributor_id: Number(order.distributor_id || 0),
          distributor_name: order.distributor_name,
          po_status: lifecycleStatus,
          payment_status: order.payment_status,
          balance_due: Number(order.balance_due || 0),
          payment_due_date: paymentDueDate,
          expected_delivery: normalizeTransactionDate(order.expected_delivery),
          next_action: order.next_action,
          urgency_score: urgencyScore,
          bill_number: order.bill_number || order.invoice_number || null,
        };
      })
      .filter((entry) => entry.next_action !== 'Monitor')
      .sort(
        (a, b) =>
          b.urgency_score - a.urgency_score ||
          Number(b.balance_due || 0) - Number(a.balance_due || 0)
      )
      .slice(0, 20);

    const cards = summaryCards.buildSummaryCards({
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
    });

    return {
      distributorInsights: distributorInsightList,
      distributorInsightById,
      payablesWithInsights,
      todayDistributors,
      tomorrowDistributors,
      weeklyDistributors,
      predictedPaymentsToday,
      predictedPaymentsNext,
      predictedDeliveriesNext,
      supplierVisits,
      reminders,
      workflow,
      cards,
      nextPaymentDate,
      nextDeliveryDate,
    };
  };

  return { buildPurchaseOperationsInsights };
};

module.exports = { createPurchaseOperationsSummaryInsights };
