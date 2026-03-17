const { buildEnrichedOrders } = require('./builders/enrichOrders');
const { buildPayables } = require('./builders/payables');
const { buildDistributorInsights } = require('./builders/distributorInsights');
const { buildReminderList } = require('./builders/reminderList');

const createPurchaseOperationsReminderBuilders = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    normalizeBooleanFlag,
    getDistributorOrderScheduleDay,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    getWeekdayFromDateKey,
    getDaysBetweenDateKeys,
    normalizePoPaymentStatus,
    getEffectivePurchaseDueDateKey,
    derivePurchaseNextAction,
    PURCHASE_WEEKDAYS,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
  } = deps;

  const buildPurchaseOperationAlerts = ({
    todayKey,
    tomorrowKey,
    distributors,
    orders,
    items,
  }) => {
    const { enrichedOrders } = buildEnrichedOrders({
      orders,
      items,
      getPurchaseOrderLifecycleStatus,
      normalizePoPaymentStatus,
      PO_PAYMENT_UNPAID,
      derivePurchaseNextAction,
    });

    const isOpenOrder = (order) => {
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      return lifecycleStatus !== PO_LIFECYCLE_CANCELLED && lifecycleStatus !== PO_LIFECYCLE_CLOSED;
    };

    const openOrders = enrichedOrders.filter(isOpenOrder);
    const payables = buildPayables({
      openOrders,
      todayKey,
      getEffectivePurchaseDueDateKey,
      getDaysBetweenDateKeys,
    });

    const ordersByDistributor = new Map();
    for (const order of enrichedOrders) {
      const key = Number(order.distributor_id || 0);
      const list = ordersByDistributor.get(key) || [];
      list.push(order);
      ordersByDistributor.set(key, list);
    }

    const distributorInsights = buildDistributorInsights({
      todayKey,
      distributors,
      ordersByDistributor,
      normalizeTransactionDate,
      addDaysToDateKey,
      getDistributorOrderScheduleDay,
      getPurchaseOrderLifecycleStatus,
      getWeekdayFromDateKey,
      getDaysBetweenDateKeys,
      PURCHASE_WEEKDAYS,
      PO_LIFECYCLE_CANCELLED,
    });

    const reminders = buildReminderList({
      tomorrowKey,
      distributors,
      ordersByDistributor,
      distributorInsights,
      normalizeBooleanFlag,
      getDistributorOrderScheduleDay,
      getPurchaseOrderLifecycleStatus,
      isPoEditableLifecycle,
      getWeekdayFromDateKey,
    });

    return {
      todayKey,
      tomorrowKey,
      reminders,
      payables,
    };
  };

  return { buildPurchaseOperationAlerts };
};

module.exports = { createPurchaseOperationsReminderBuilders };
