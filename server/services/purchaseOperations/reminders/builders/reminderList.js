const buildReminderList = ({
  tomorrowKey,
  distributors,
  suppliers,
  ordersByDistributor,
  ordersBySupplier,
  distributorInsights,
  normalizeBooleanFlag,
  getDistributorOrderScheduleDay,
  getSupplierScheduleConfig,
  getPurchaseOrderLifecycleStatus,
  isPoEditableLifecycle,
  getWeekdayFromDateKey,
} = {}) => {
  const distributorById = new Map(
    (Array.isArray(distributors) ? distributors : []).map((entry) => [Number(entry?.id || 0), entry])
  );
  const activeSuppliers = (Array.isArray(suppliers) ? suppliers : [])
    .filter((supplier) => Number(supplier?.distributor_id || 0))
    .filter((supplier) => Boolean(supplier?.is_active ?? true))
    .filter((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      return distributor && String(distributor.status || 'active').trim().toLowerCase() === 'active';
    })
    .filter((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      return distributor && normalizeBooleanFlag(distributor.auto_reminders_enabled, true);
    });

  return activeSuppliers
    .map((supplier) => {
      const distributor = distributorById.get(Number(supplier.distributor_id || 0));
      if (!distributor) return null;
      const schedule = getSupplierScheduleConfig(supplier, distributor);
      const scheduleDay = schedule.scheduleType === 'weekly' ? schedule.scheduleDay : null;
      const isDueTomorrow = schedule.scheduleType === 'daily'
        || (schedule.scheduleType === 'weekly' && scheduleDay === getWeekdayFromDateKey(tomorrowKey))
        || (schedule.scheduleType === 'irregular'
          && (distributorInsights.find((entry) => entry.distributor_id === Number(distributor.id || 0))?.next_order_date === tomorrowKey));
      if (!isDueTomorrow) return null;

      const supplierId = Number(supplier.id || 0);
      const supplierOrders = supplierId ? (ordersBySupplier.get(supplierId) || []) : [];
      const distributorOrders = ordersByDistributor.get(Number(distributor.id || 0)) || [];
      const ordersForEntry = supplierOrders.length ? supplierOrders : distributorOrders;
      const hasEditableOrder = ordersForEntry.some((order) => isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(order)));
      const insight = distributorInsights.find((entry) => entry.distributor_id === Number(distributor.id || 0)) || null;
      return {
        distributor_id: Number(distributor.id || 0),
        distributor_name: distributor.name,
        supplier_id: supplierId || null,
        supplier_name: supplier.name || null,
        reminder_for: tomorrowKey,
        schedule_day: scheduleDay,
        schedule_type: schedule.scheduleType,
        order_cutoff_time: distributor.order_cutoff_time || null,
        preferred_whatsapp_time: distributor.preferred_whatsapp_time || null,
        has_open_draft: hasEditableOrder,
        suggested_next_order_date: insight?.next_order_date || tomorrowKey,
        likely_items: insight?.likely_items || [],
        suggested_items: insight?.suggested_items || [],
        outstanding_amount: insight?.outstanding_amount || 0,
        message: hasEditableOrder
          ? 'Order reminder due tomorrow, but there is already an open draft/sent PO'
          : 'Order reminder due tomorrow',
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));
};

module.exports = { buildReminderList };
