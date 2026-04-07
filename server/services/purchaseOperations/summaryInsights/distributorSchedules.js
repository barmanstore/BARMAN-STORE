const { buildScheduleLists } = require('./distributorSchedules/scheduleLists');
const { buildScheduleReminders } = require('./distributorSchedules/reminders');

const createPurchaseOperationsDistributorSchedules = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    getDistributorOrderScheduleDay,
    getSupplierScheduleConfig,
    parseDistributorProductsSupplied,
    normalizeBooleanFlag,
    isPoEditableLifecycle,
    getPurchaseOrderLifecycleStatus,
    PURCHASE_WEEKDAYS,
  } = deps;

  const buildDistributorSchedules = ({
    baseData,
    metrics,
    distributorInsightById,
    payablesWithInsights,
  }) => {
    const {
      todayKey,
      tomorrowKey,
      distributors,
      suppliers,
    } = baseData;
    const { ordersByDistributor, ordersBySupplier } = metrics;

    const { todayDistributors, tomorrowDistributors, weeklyDistributors } = buildScheduleLists({
      todayKey,
      tomorrowKey,
      distributors,
      suppliers,
      distributorInsightById,
      ordersByDistributor,
      ordersBySupplier,
      payablesWithInsights,
      getWeekdayFromDateKey,
      getDistributorOrderScheduleDay,
      getSupplierScheduleConfig,
      addDaysToDateKey,
      parseDistributorProductsSupplied,
      normalizeTransactionDate,
      getPurchaseOrderLifecycleStatus,
      isPoEditableLifecycle,
      PURCHASE_WEEKDAYS,
    });

    const reminders = buildScheduleReminders({
      todayKey,
      tomorrowKey,
      distributors,
      suppliers,
      distributorInsightById,
      ordersByDistributor,
      ordersBySupplier,
      normalizeBooleanFlag,
      normalizeTransactionDate,
      getDistributorOrderScheduleDay,
      getSupplierScheduleConfig,
      getWeekdayFromDateKey,
      getPurchaseOrderLifecycleStatus,
      isPoEditableLifecycle,
    });

    return {
      todayDistributors,
      tomorrowDistributors,
      weeklyDistributors,
      reminders,
    };
  };

  return { buildDistributorSchedules };
};

module.exports = { createPurchaseOperationsDistributorSchedules };
