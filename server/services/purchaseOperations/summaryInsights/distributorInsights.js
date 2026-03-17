const { buildDistributorCadence } = require('./distributor/cadence');
const { collectDistributorOrderStats } = require('./distributor/orderStats');
const {
  buildLikelyItems,
  buildSuggestedItems,
  mergeSuggestedProductKnowledge,
} = require('./distributor/itemSuggestions');
const { buildPaymentDeliveryForecast } = require('./distributor/paymentDelivery');
const { attachInsightsToPayables } = require('./distributor/payables');

const createPurchaseOperationsDistributorInsights = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    computeAverageDays,
    getDistributorOrderScheduleDay,
    mergeDistributorProductKnowledge,
    getDistributorPaymentPlan,
    getPurchaseOrderLifecycleStatus,
    getPurchaseOrderPaymentAnchorDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getDaysBetweenDateKeys,
    pickLatestDateKey,
    pickEarliestDateKey,
    PO_LIFECYCLE_CANCELLED,
    PURCHASE_WEEKDAYS,
  } = deps;

  const buildDistributorInsights = ({ baseData, metrics }) => {
    const {
      todayKey,
      distributors,
      orders,
    } = baseData;
    const {
      paymentsByOrderId,
      ledgerBalanceByDistributor,
      orderById,
      payables,
      payablesByDistributor,
      ordersByDistributor,
      isOpenOrder,
    } = metrics;

    const inferDistributorInsight = (distributor) => {
      const distributorId = Number(distributor.id || 0);
      const distributorOrders = [...(ordersByDistributor.get(distributorId) || [])]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const completedOrders = distributorOrders.filter((order) => getPurchaseOrderLifecycleStatus(order) !== PO_LIFECYCLE_CANCELLED);
      const openDistributorOrders = distributorOrders.filter(isOpenOrder);
      const cadenceData = buildDistributorCadence({
        todayKey,
        completedOrders,
        distributor,
        computeAverageDays,
        getDistributorOrderScheduleDay,
        getPurchaseOrderAnchorDateKey,
        getDaysBetweenDateKeys,
        getWeekdayFromDateKey,
        PURCHASE_WEEKDAYS,
        addDaysToDateKey,
      });

      const orderStats = collectDistributorOrderStats({
        completedOrders,
        paymentsByOrderId,
        normalizeTransactionDate,
        getPurchaseOrderPaymentAnchorDateKey,
        getPurchaseOrderDeliveryDateKey,
        getPurchaseOrderAnchorDateKey,
        getDaysBetweenDateKeys,
        pickLatestDateKey,
      });

      const likelyItems = buildLikelyItems(orderStats.productCounts, { limit: 3 });
      const suggestedItems = buildSuggestedItems(orderStats.suggestionMap, { limit: 5 });
      const mergedProductKnowledge = mergeSuggestedProductKnowledge({
        distributor,
        mergeDistributorProductKnowledge,
        likelyItems,
        suggestedItems,
      });

      const paymentDelivery = buildPaymentDeliveryForecast({
        completedOrders,
        openDistributorOrders,
        payablesByDistributor,
        distributorId,
        distributor,
        ledgerBalanceByDistributor,
        computeAverageDays,
        getDistributorPaymentPlan,
        getPurchaseOrderPaymentAnchorDateKey,
        getPurchaseOrderAnchorDateKey,
        normalizeTransactionDate,
        addDaysToDateKey,
        pickEarliestDateKey,
        pickLatestDateKey,
        paymentLagDays: orderStats.paymentLagDays,
        deliveryLagDays: orderStats.deliveryLagDays,
        paymentDateKeys: orderStats.paymentDateKeys,
        deliveryDateKeys: orderStats.deliveryDateKeys,
        lastOrderDateKey: cadenceData.lastOrderDateKey,
      });

      return {
        distributor_id: distributorId,
        distributor_name: distributor.name,
        cadence_days: cadenceData.cadenceDays,
        next_order_date: cadenceData.nextOrderDate,
        schedule_day: cadenceData.scheduleDay || null,
        po_balance_due: paymentDelivery.outstandingAmount,
        ledger_balance: paymentDelivery.ledgerBalance,
        outstanding_amount: paymentDelivery.outstandingAmount,
        likely_items: mergedProductKnowledge.historical_items.slice(0, 3),
        suggested_items: suggestedItems,
        products_supplied_manual: mergedProductKnowledge.manual_items,
        products_supplied_all: mergedProductKnowledge.merged_items,
        products_supplied_text: mergedProductKnowledge.merged_text,
        active_open_orders: openDistributorOrders.length,
        last_order_date: cadenceData.lastOrderDateKey,
        last_delivery_date: paymentDelivery.lastDeliveryDate,
        last_payment_date: paymentDelivery.lastPaymentDate,
        next_payment_due_date: paymentDelivery.nextPaymentDueDate,
        next_payment_due_source: paymentDelivery.nextPaymentDueSource,
        predicted_payment_amount: paymentDelivery.predictedPaymentAmount,
        next_delivery_date: paymentDelivery.nextDeliveryDate,
        next_delivery_source: paymentDelivery.nextDeliverySource,
        predicted_delivery_count: paymentDelivery.predictedDeliveryCount,
        configured_payment_due_days: paymentDelivery.configuredPaymentDueDays,
        inferred_payment_due_days: paymentDelivery.inferredPaymentDueDays,
        avg_delivery_days: paymentDelivery.avgDeliveryDays,
        inferred_due_date: paymentDelivery.inferredDueDate || null,
        strict_deadline_count: completedOrders.filter((order) => Boolean(normalizeTransactionDate(order.strict_due_date))).length,
      };
    };

    const distributorInsights = distributors
      .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active')
      .map(inferDistributorInsight)
      .sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));
    const distributorInsightById = new Map(
      distributorInsights.map((entry) => [Number(entry.distributor_id || 0), entry])
    );
    const payablesWithInsights = attachInsightsToPayables({
      payables,
      distributorInsightById,
      orderById,
      normalizeTransactionDate,
    });

    return {
      distributorInsights,
      distributorInsightById,
      payablesWithInsights,
    };
  };

  return { buildDistributorInsights };
};

module.exports = { createPurchaseOperationsDistributorInsights };
