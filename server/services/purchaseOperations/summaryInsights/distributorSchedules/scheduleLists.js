const { resolveIrregularScheduleDate } = require('./resolveIrregularScheduleDate');
const { buildScheduledDistributorEntry } = require('./scheduledEntry');

const buildScheduleLists = ({
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
} = {}) => {
  const distributorById = new Map(
    (Array.isArray(distributors) ? distributors : []).map((entry) => [
      Number(entry?.id || 0),
      entry,
    ])
  );
  const activeSuppliers = (Array.isArray(suppliers) ? suppliers : [])
    .filter((supplier) => Number(supplier?.distributor_id || 0))
    .filter((supplier) => Boolean(supplier?.is_active ?? true))
    .filter((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      return (
        distributor &&
        String(distributor.status || 'active')
          .trim()
          .toLowerCase() === 'active'
      );
    });

  const todayWeekday = getWeekdayFromDateKey(todayKey);
  const tomorrowWeekday = getWeekdayFromDateKey(tomorrowKey);

  const buildEntry = (supplier, distributor, scheduleDate, scheduleDay, scheduleType) =>
    buildScheduledDistributorEntry({
      distributor,
      supplier,
      scheduleDate,
      scheduleDay,
      scheduleType,
      distributorInsightById,
      ordersByDistributor,
      ordersBySupplier,
      payablesWithInsights,
      todayKey,
      getDistributorOrderScheduleDay,
      parseDistributorProductsSupplied,
      normalizeTransactionDate,
      getPurchaseOrderLifecycleStatus,
      isPoEditableLifecycle,
    });

  const getIrregularScheduleDate = (supplier, distributor) =>
    resolveIrregularScheduleDate({
      todayKey,
      supplier,
      distributor,
      distributorInsightById,
      ordersByDistributor,
      ordersBySupplier,
      normalizeTransactionDate,
    });

  const todayDistributors = activeSuppliers
    .filter((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      if (!distributor) return false;
      const schedule = getSupplierScheduleConfig(supplier, distributor);
      if (schedule.scheduleType === 'daily') return true;
      if (schedule.scheduleType === 'weekly') return schedule.scheduleDay === todayWeekday;
      if (schedule.scheduleType === 'irregular') {
        return getIrregularScheduleDate(supplier, distributor) === todayKey;
      }
      return false;
    })
    .map((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      const schedule = getSupplierScheduleConfig(supplier, distributor);
      const scheduleDay = schedule.scheduleType === 'weekly' ? schedule.scheduleDay : null;
      return buildEntry(supplier, distributor, todayKey, scheduleDay, schedule.scheduleType);
    })
    .sort(
      (a, b) =>
        Number(b.overdue_amount || 0) - Number(a.overdue_amount || 0) ||
        Number(b.due_today_amount || 0) - Number(a.due_today_amount || 0) ||
        String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')) ||
        String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''))
    );

  const tomorrowDistributors = activeSuppliers
    .filter((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      if (!distributor) return false;
      const schedule = getSupplierScheduleConfig(supplier, distributor);
      if (schedule.scheduleType === 'daily') return true;
      if (schedule.scheduleType === 'weekly') return schedule.scheduleDay === tomorrowWeekday;
      if (schedule.scheduleType === 'irregular') {
        return getIrregularScheduleDate(supplier, distributor) === tomorrowKey;
      }
      return false;
    })
    .map((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      const schedule = getSupplierScheduleConfig(supplier, distributor);
      const scheduleDay = schedule.scheduleType === 'weekly' ? schedule.scheduleDay : null;
      return buildEntry(supplier, distributor, tomorrowKey, scheduleDay, schedule.scheduleType);
    })
    .sort(
      (a, b) =>
        Number(b.po_balance_due || 0) - Number(a.po_balance_due || 0) ||
        String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')) ||
        String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''))
    );

  const weeklyDistributors = activeSuppliers
    .map((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      if (!distributor) return null;
      const schedule = getSupplierScheduleConfig(supplier, distributor);
      if (schedule.scheduleType === 'daily') {
        return buildEntry(supplier, distributor, todayKey, todayWeekday, 'daily');
      }
      if (schedule.scheduleType === 'weekly') {
        const scheduleDay = schedule.scheduleDay;
        if (!scheduleDay) return null;
        const targetIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === scheduleDay);
        const sourceIndex = PURCHASE_WEEKDAYS.findIndex((day) => day === todayWeekday);
        if (targetIndex < 0 || sourceIndex < 0) return null;
        const offset = (targetIndex - sourceIndex + 7) % 7;
        const scheduleDate = addDaysToDateKey(todayKey, offset);
        if (!scheduleDate) return null;
        return buildEntry(supplier, distributor, scheduleDate, scheduleDay, 'weekly');
      }
      if (schedule.scheduleType === 'irregular') {
        const scheduleDate = getIrregularScheduleDate(supplier, distributor);
        return buildEntry(supplier, distributor, scheduleDate, null, 'irregular');
      }
      return null;
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        String(a.schedule_date || '').localeCompare(String(b.schedule_date || '')) ||
        String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')) ||
        String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''))
    );

  return { todayDistributors, tomorrowDistributors, weeklyDistributors };
};

module.exports = { buildScheduleLists };
