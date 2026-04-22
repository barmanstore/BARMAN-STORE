const persistAnalyticsSnapshots = async ({
  persistSnapshots,
  persistPurchaseAnalyticsSnapshotsAsync,
  todayKey,
  cards,
  predictedPaymentsToday,
  predictedPaymentsNext,
  predictedDeliveriesNext,
  distributorInsights,
} = {}) => {
  if (!persistSnapshots) return;
  try {
    await persistPurchaseAnalyticsSnapshotsAsync({
      snapshotDate: todayKey,
      cards,
      predictedPaymentsToday,
      predictedPaymentsNext,
      predictedDeliveriesNext,
      distributorInsights,
    });
  } catch (error) {
    console.warn('[PURCHASE_OPS] Failed to persist analytics snapshots:', error?.message || error);
  }
};

module.exports = { persistAnalyticsSnapshots };
