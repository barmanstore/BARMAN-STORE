const buildSummaryCounts = ({
  reminders,
  predictedPaymentsNext,
  predictedDeliveriesNext,
  nextPaymentDate,
  nextDeliveryDate,
  todayDistributors,
  tomorrowDistributors,
  weeklyDistributors,
} = {}) => ({
  reminderCount: Array.isArray(reminders) ? reminders.length : 0,
  predictedPaymentNextCount: Array.isArray(predictedPaymentsNext)
    ? predictedPaymentsNext.length
    : 0,
  predictedDeliveryNextCount: Array.isArray(predictedDeliveriesNext)
    ? predictedDeliveriesNext.length
    : 0,
  nextPaymentDate: nextPaymentDate || null,
  nextDeliveryDate: nextDeliveryDate || null,
  todayDistributorCount: Array.isArray(todayDistributors) ? todayDistributors.length : 0,
  tomorrowDistributorCount: Array.isArray(tomorrowDistributors) ? tomorrowDistributors.length : 0,
  weeklyDistributorCount: Array.isArray(weeklyDistributors) ? weeklyDistributors.length : 0,
});

module.exports = { buildSummaryCounts };
