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
    const {
      todayKey,
      tomorrowKey,
      distributorIdFilter,
      rollupRange,
    } = baseData;

    const {
      cards,
      todayDistributors,
      tomorrowDistributors,
      weeklyDistributors,
      predictedPaymentsToday,
      predictedPaymentsNext,
      predictedDeliveriesNext,
      reminders,
      payablesWithInsights,
      workflow,
      distributorInsights,
    } = insights;

    if (persistSnapshots) {
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
    }

    const actionRollups = await buildPurchaseActionRollupsAsync({
      startDate: rollupRange.startDate,
      endDate: rollupRange.endDate,
      distributorId: distributorIdFilter,
    });

    return {
      today: todayKey,
      tomorrow: tomorrowKey,
      automation: {
        notifications: PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED ? 'automatic' : 'disabled',
        whatsapp: 'manual',
        po_preparation: 'manual',
      },
      cards,
      today_distributors: todayDistributors,
      tomorrow_distributors: tomorrowDistributors,
      weekly_distributors: weeklyDistributors,
      predicted_payments_today: predictedPaymentsToday,
      predicted_payments_next: predictedPaymentsNext,
      predicted_deliveries_next: predictedDeliveriesNext,
      reminders,
      payables: payablesWithInsights.slice(0, 20),
      workflow,
      distributor_insights: distributorInsights.slice(0, 20),
      action_rollups: actionRollups,
    };
  };

  return { buildPurchaseOperationsResponse };
};

module.exports = { createPurchaseOperationsSummaryResponse };
