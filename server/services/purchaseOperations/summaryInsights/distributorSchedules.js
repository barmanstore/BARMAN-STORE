const createPurchaseOperationsDistributorSchedules = (deps) => {
  const {
    normalizeTransactionDate,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    getDistributorOrderScheduleDay,
    parseDistributorProductsSupplied,
    normalizeBooleanFlag,
    isPoEditableLifecycle,
    getPurchaseOrderLifecycleStatus,
    PURCHASE_WEEKDAYS,
  } = deps;

  const buildScheduledDistributorEntry = ({
    distributor,
    scheduleDate,
    distributorInsightById,
    ordersByDistributor,
    payablesWithInsights,
    todayKey,
  }) => {
    const distributorId = Number(distributor.id || 0);
    const insight = distributorInsightById.get(distributorId) || null;
    const distributorOrders = ordersByDistributor.get(distributorId) || [];
    const activePayables = payablesWithInsights.filter((entry) => Number(entry.distributor_id || 0) === distributorId);
    const dueTodayAmount = activePayables
      .filter((entry) => entry.payment_due_date === todayKey)
      .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
    const overdueAmountForDistributor = activePayables
      .filter((entry) => entry.payment_due_date < todayKey)
      .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
    const strictDeadlineOrder = distributorOrders
      .map((order) => normalizeTransactionDate(order.strict_due_date || null))
      .filter(Boolean)
      .sort()[0] || null;
    return {
      distributor_id: distributorId,
      distributor_name: distributor.name,
      schedule_date: scheduleDate,
      schedule_day: getDistributorOrderScheduleDay(distributor),
      order_cutoff_time: distributor.order_cutoff_time || null,
      preferred_whatsapp_time: distributor.preferred_whatsapp_time || null,
      payment_terms: distributor.payment_terms || null,
      configured_payment_due_days: insight?.configured_payment_due_days ?? null,
      inferred_payment_due_days: insight?.inferred_payment_due_days ?? null,
      po_balance_due: Number(insight?.po_balance_due || 0),
      ledger_balance: Number(insight?.ledger_balance || 0),
      due_today_amount: dueTodayAmount,
      overdue_amount: overdueAmountForDistributor,
      likely_items: insight?.likely_items || [],
      suggested_items: insight?.suggested_items || [],
      products_supplied_all: insight?.products_supplied_all || parseDistributorProductsSupplied(distributor.products_supplied || ''),
      next_payment_due_date: insight?.next_payment_due_date || null,
      inferred_due_date: insight?.inferred_due_date || null,
      strict_due_date: strictDeadlineOrder,
      has_open_draft: distributorOrders.some((order) => isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(order))),
    };
  };

  const buildDistributorSchedules = ({
    baseData,
    metrics,
    distributorInsightById,
    payablesWithInsights,
  }) => {
    const {
      todayKey,
      tomorrowKey,
      distributors,
    } = baseData;
    const { ordersByDistributor } = metrics;

    const activeDistributors = distributors.filter((distributor) => String(distributor.status || 'active').trim().toLowerCase() === 'active');
    const todayWeekday = getWeekdayFromDateKey(todayKey);
    const tomorrowWeekday = getWeekdayFromDateKey(tomorrowKey);
    const todayDistributors = activeDistributors
      .filter((distributor) => getDistributorOrderScheduleDay(distributor) === todayWeekday)
      .map((distributor) => buildScheduledDistributorEntry({
        distributor,
        scheduleDate: todayKey,
        distributorInsightById,
        ordersByDistributor,
        payablesWithInsights,
        todayKey,
      }))
      .sort((a, b) => Number(b.overdue_amount || 0) - Number(a.overdue_amount || 0)
        || Number(b.due_today_amount || 0) - Number(a.due_today_amount || 0)
        || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));
    const tomorrowDistributors = activeDistributors
      .filter((distributor) => getDistributorOrderScheduleDay(distributor) === tomorrowWeekday)
      .map((distributor) => buildScheduledDistributorEntry({
        distributor,
        scheduleDate: tomorrowKey,
        distributorInsightById,
        ordersByDistributor,
        payablesWithInsights,
        todayKey,
      }))
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
        return buildScheduledDistributorEntry({
          distributor,
          scheduleDate,
          distributorInsightById,
          ordersByDistributor,
          payablesWithInsights,
          todayKey,
        });
      })
      .filter(Boolean)
      .sort((a, b) => String(a.schedule_date || '').localeCompare(String(b.schedule_date || ''))
        || String(a.distributor_name || '').localeCompare(String(b.distributor_name || '')));

    const reminders = distributors
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

    return {
      todayDistributors,
      tomorrowDistributors,
      weeklyDistributors,
      reminders,
    };
  };

  return { buildDistributorSchedules };
};

module.exports = { createPurchaseOperationsDistributorSchedules };
