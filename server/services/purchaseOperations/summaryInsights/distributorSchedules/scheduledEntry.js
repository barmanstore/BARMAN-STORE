const buildScheduledDistributorEntry = ({
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
} = {}) => {
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

module.exports = { buildScheduledDistributorEntry };
