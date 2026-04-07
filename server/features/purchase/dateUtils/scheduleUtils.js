const createScheduleUtils = ({ normalizeWeekdayLabel }) => {
  const getDistributorVisitScheduleDay = (distributor = {}) => (
    normalizeWeekdayLabel(distributor.visit_day || distributor.delivery_day || distributor.order_day)
  );

  const getDistributorOrderScheduleDay = (distributor = {}) => (
    getDistributorVisitScheduleDay(distributor)
  );

  const getSupplierScheduleConfig = (supplier = {}, distributor = {}) => {
    const rawType = String(supplier?.schedule_type || '').trim().toLowerCase();
    const scheduleType = rawType || 'irregular';
    if (scheduleType === 'weekly') {
      const supplierScheduleDay = normalizeWeekdayLabel(supplier.schedule_day);
      const distributorVisitDay = normalizeWeekdayLabel(distributor.visit_day);
      const distributorOrderDay = normalizeWeekdayLabel(distributor.order_day);
      const looksLikeLegacyOrderBackfill = Boolean(supplier?.is_primary)
        && supplierScheduleDay
        && distributorVisitDay
        && distributorOrderDay
        && supplierScheduleDay === distributorOrderDay
        && distributorVisitDay !== distributorOrderDay
        && String(supplier?.created_at || '').trim()
        && String(supplier?.created_at || '').trim() === String(supplier?.updated_at || '').trim();

      return {
        scheduleType,
        scheduleDay: looksLikeLegacyOrderBackfill
          ? distributorVisitDay
          : (supplierScheduleDay || getDistributorVisitScheduleDay(distributor) || null),
        fallback: !supplierScheduleDay || looksLikeLegacyOrderBackfill,
      };
    }
    if (scheduleType === 'daily') {
      return {
        scheduleType,
        scheduleDay: null,
        fallback: false,
      };
    }
    if (scheduleType === 'irregular') {
      return {
        scheduleType,
        scheduleDay: null,
        fallback: false,
      };
    }

    const fallbackDay = getDistributorVisitScheduleDay(distributor);
    return {
      scheduleType: fallbackDay ? 'weekly' : 'irregular',
      scheduleDay: fallbackDay || null,
      fallback: true,
    };
  };

  return { getDistributorOrderScheduleDay, getSupplierScheduleConfig };
};

module.exports = { createScheduleUtils };
