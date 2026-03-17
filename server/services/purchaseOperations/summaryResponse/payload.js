const buildSummaryPayload = ({
  baseData,
  insights,
  actionRollups,
  notificationsEnabled,
} = {}) => {
  const {
    todayKey,
    tomorrowKey,
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

  return {
    today: todayKey,
    tomorrow: tomorrowKey,
    automation: {
      notifications: notificationsEnabled ? 'automatic' : 'disabled',
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

module.exports = { buildSummaryPayload };
