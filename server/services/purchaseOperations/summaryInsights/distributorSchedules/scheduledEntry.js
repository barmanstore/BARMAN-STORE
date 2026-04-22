const buildScheduledDistributorEntry = ({
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
} = {}) => {
  const distributorId = Number(distributor.id || 0);
  const insight = distributorInsightById.get(distributorId) || null;
  const supplierId = Number(supplier?.id || 0);
  const supplierOrders = supplierId ? ordersBySupplier.get(supplierId) || [] : [];
  const ordersForEntry = supplierId ? supplierOrders : ordersByDistributor.get(distributorId) || [];
  const ledgerBalance = supplierId ? 0 : Number(insight?.ledger_balance || 0);
  const activePayables = payablesWithInsights.filter((entry) => {
    if (supplierId) return Number(entry?.supplier_id || 0) === supplierId;
    return Number(entry?.distributor_id || 0) === distributorId;
  });
  const openDraftOrders = ordersForEntry.filter((order) =>
    isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(order))
  );
  const orderedUnconfirmedOrders = openDraftOrders
    .slice()
    .sort(
      (left, right) =>
        String(left.created_at || '').localeCompare(String(right.created_at || '')) ||
        Number(left.id || 0) - Number(right.id || 0)
    );
  const unconfirmedPoCount = orderedUnconfirmedOrders.length;
  const unconfirmedPoDue = orderedUnconfirmedOrders.reduce(
    (sum, order) => sum + Number(order.balance_due || 0),
    0
  );
  const unconfirmedPoOrder = orderedUnconfirmedOrders[0] || null;
  const confirmedPoBalanceDue = ordersForEntry
    .filter((order) => !isPoEditableLifecycle(getPurchaseOrderLifecycleStatus(order)))
    .reduce((sum, order) => sum + Number(order.balance_due || 0), 0);
  const fallbackProductsSuppliedText =
    String(supplier?.products_supplied || '').trim() ||
    String(distributor?.products_supplied || '').trim();
  const dueTodayAmount = activePayables
    .filter((entry) => entry.payment_due_date === todayKey)
    .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
  const overdueAmountForDistributor = activePayables
    .filter((entry) => entry.payment_due_date < todayKey)
    .reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0);
  const strictDeadlineOrder =
    ordersForEntry
      .map((order) => normalizeTransactionDate(order.strict_due_date || null))
      .filter(Boolean)
      .sort()[0] || null;
  const payableOrderId =
    activePayables
      .slice()
      .sort(
        (left, right) =>
          String(left.payment_due_date || '').localeCompare(String(right.payment_due_date || '')) ||
          Number(right.balance_due || 0) - Number(left.balance_due || 0) ||
          Number(left.order_id || 0) - Number(right.order_id || 0)
      )[0]?.order_id || null;

  return {
    distributor_id: distributorId,
    distributor_name: distributor.name,
    supplier_id: supplierId || null,
    supplier_name: supplier?.name || null,
    schedule_date: scheduleDate,
    schedule_day: scheduleDay || getDistributorOrderScheduleDay(distributor),
    schedule_type: scheduleType || null,
    order_cutoff_time: distributor.order_cutoff_time || null,
    preferred_whatsapp_time: distributor.preferred_whatsapp_time || null,
    payment_terms: distributor.payment_terms || null,
    configured_payment_due_days: insight?.configured_payment_due_days ?? null,
    inferred_payment_due_days: insight?.inferred_due_days ?? null,
    po_balance_due: activePayables.reduce((sum, entry) => sum + Number(entry.balance_due || 0), 0),
    confirmed_po_balance_due: confirmedPoBalanceDue,
    ledger_balance: ledgerBalance,
    due_today_amount: dueTodayAmount,
    overdue_amount: overdueAmountForDistributor,
    payable_order_id: payableOrderId,
    likely_items: insight?.likely_items || [],
    suggested_items: insight?.suggested_items || [],
    products_supplied_all:
      insight?.products_supplied_all ||
      parseDistributorProductsSupplied(fallbackProductsSuppliedText),
    novelty_alerts: insight?.novelty_alerts || [],
    novelty_summary: insight?.novelty_summary || { total_count: 0 },
    has_novelty_alerts: Boolean(insight?.has_novelty_alerts),
    next_payment_due_date: insight?.next_payment_due_date || null,
    inferred_due_date: insight?.inferred_due_date || null,
    strict_due_date: strictDeadlineOrder,
    has_open_draft: unconfirmedPoCount > 0,
    unconfirmed_po_count: unconfirmedPoCount,
    unconfirmed_po_due: unconfirmedPoDue,
    unconfirmed_po_order_id: unconfirmedPoOrder?.id || null,
    unconfirmed_po_order_number: unconfirmedPoOrder?.po_number || null,
  };
};

module.exports = { buildScheduledDistributorEntry };
