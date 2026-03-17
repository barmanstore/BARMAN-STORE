const buildScheduleReminders = ({
  tomorrowKey,
  distributors,
  distributorInsightById,
  ordersByDistributor,
  normalizeBooleanFlag,
  getDistributorOrderScheduleDay,
  getWeekdayFromDateKey,
  getPurchaseOrderLifecycleStatus,
  isPoEditableLifecycle,
} = {}) => distributors
  .filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active')
  .filter((distributor) => normalizeBooleanFlag(distributor.auto_reminders_enabled, true))
  .map((distributor) => {
    const scheduleDay = getDistributorOrderScheduleDay(distributor);
    if (!scheduleDay || scheduleDay !== getWeekdayFromDateKey(tomorrowKey)) return null;
    const distributorOrders = ordersByDistributor.get(Number(distributor.id || 0)) || [];
    const hasEditableOrder = distributorOrders.some((order) => {
      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      return isPoEditableLifecycle(lifecycleStatus);
    });
    const insight = distributorInsightById.get(Number(distributor.id || 0)) || null;
    return {
      distributor_id: Number(distributor.id || 0),
      distributor_name: distributor.name,
      reminder_for: tomorrowKey,
      schedule_day: scheduleDay,
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

module.exports = { buildScheduleReminders };
