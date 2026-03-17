const { buildScheduleLists } = require('./distributorSchedules/scheduleLists');
const { buildScheduleReminders } = require('./distributorSchedules/reminders');

const createPurchaseOperationsDistributorSchedules = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    getDistributorOrderScheduleDay,
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
    } = baseData;
    const { ordersByDistributor } = metrics;

    const { todayDistributors, tomorrowDistributors, weeklyDistributors } = buildScheduleLists({
      todayKey,
      tomorrowKey,
      distributors,
      distributorInsightById,
      ordersByDistributor,
      payablesWithInsights,
      getWeekdayFromDateKey,
      getDistributorOrderScheduleDay,
      addDaysToDateKey,
      parseDistributorProductsSupplied,
      normalizeTransactionDate,
      getPurchaseOrderLifecycleStatus,
      isPoEditableLifecycle,
      PURCHASE_WEEKDAYS,
    });

    const reminders = buildScheduleReminders({
      tomorrowKey,
      distributors,
      distributorInsightById,
      ordersByDistributor,
      normalizeBooleanFlag,
      getDistributorOrderScheduleDay,
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
