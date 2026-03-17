const { buildScheduledDistributorEntry } = require('./scheduledEntry');

const buildScheduleLists = ({
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
} = {}) => {
  const activeDistributors = distributors
    .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active');
  const todayWeekday = getWeekdayFromDateKey(todayKey);
  const tomorrowWeekday = getWeekdayFromDateKey(tomorrowKey);

  const buildEntry = (distributor, scheduleDate) => buildScheduledDistributorEntry({
    distributor,
    scheduleDate,
    distributorInsightById,
    ordersByDistributor,
    payablesWithInsights,
    todayKey,
    getDistributorOrderScheduleDay,
    parseDistributorProductsSupplied,
    normalizeTransactionDate,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
  });

  const todayDistributors = activeDistributors
    .filter((distributor) => getDistributorOrderScheduleDay(distributor) === todayWeekday)
    .map((distributor) => buildEntry(distributor, todayKey))
    .sort((a, b) => Number(b.overdue_amount || 0) - Number(a.overdue_amount || 0)
      || Number(b.due_today_amount || 0) - Number(a.due_today_amount || 0)
      || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));

  const tomorrowDistributors = activeDistributors
    .filter((distributor) => getDistributorOrderScheduleDay(distributor) === tomorrowWeekday)
    .map((distributor) => buildEntry(distributor, tomorrowKey))
    .sort((a, b) => Number(b.po_balance_due || 0) - Number(a.po_balance_due || 0)
      || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));

  const weeklyDistributors = activeDistributors
    .map((distributor) => {
      const scheduleDay = getDistributorOrderScheduleDay(distributor);
      if (!scheduleDay) return null;
      const targetIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === scheduleDay);
      const sourceIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === todayWeekday);
      if (targetIndex < 0 || sourceIndex < 0) return null;
      const offset = (targetIndex - sourceIndex + 7) % 7;
      const scheduleDate = addDaysToDateKey(todayKey, offset);
      if (!scheduleDate) return null;
      return buildEntry(distributor, scheduleDate);
    })
    .filter(Boolean)
    .sort((a, b) => String(a.schedule_date || '').localeCompare(String(b.schedule_date || ''))
      || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));

  return { todayDistributors, tomorrowDistributors, weeklyDistributors };
};

module.exports = { buildScheduleLists };
