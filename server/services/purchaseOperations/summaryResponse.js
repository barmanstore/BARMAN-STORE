const { persistAnalyticsSnapshots } = require('./summaryResponse/snapshots');
const { buildSummaryPayload } = require('./summaryResponse/payload');

const createPurchaseOperationsSummaryResponse = (deps) => {
  const {
    buildPurchaseActionRollupsAsync,
    persistPurchaseAnalyticsSnapshotsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
  } = deps;

  const buildPurchaseOperationsResponse = async ({
    baseData,
    insights,
    persistSnapshots = true,
  }) => {
    const { todayKey, distributorIdFilter, rollupRange } = baseData;
    await persistAnalyticsSnapshots({
      persistSnapshots,
      persistPurchaseAnalyticsSnapshotsAsync,
      todayKey,
      cards: insights.cards,
      predictedPaymentsToday: insights.predictedPaymentsToday,
      predictedPaymentsNext: insights.predictedPaymentsNext,
      predictedDeliveriesNext: insights.predictedDeliveriesNext,
      distributorInsights: insights.distributorInsights,
    });

    const actionRollups = await buildPurchaseActionRollupsAsync({
      startDate: rollupRange.startDate,
      endDate: rollupRange.endDate,
      distributorId: distributorIdFilter,
    });

    return buildSummaryPayload({
      baseData,
      insights,
      actionRollups,
      notificationsEnabled: PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    });
  };

  return { buildPurchaseOperationsResponse };
};

module.exports = { createPurchaseOperationsSummaryResponse };
