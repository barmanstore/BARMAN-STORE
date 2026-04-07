const resolveIrregularScheduleDate = ({
  todayKey,
  distributor,
  supplier,
  distributorInsightById,
  ordersByDistributor,
  ordersBySupplier,
  normalizeTransactionDate,
} = {}) => {
  const distributorId = Number(distributor?.id || 0);
  if (!distributorId) return null;

  const insight = distributorInsightById.get(distributorId) || null;
  const supplierId = Number(supplier?.id || 0);
  const supplierOrders = supplierId ? (ordersBySupplier.get(supplierId) || []) : [];
  const distributorOrders = ordersByDistributor.get(distributorId) || [];
  const ordersForEntry = supplierOrders.length ? supplierOrders : distributorOrders;
  const strictDueDate = ordersForEntry
    .map((order) => normalizeTransactionDate(order?.strict_due_date || null))
    .filter(Boolean)
    .sort()[0] || null;

  const candidateDates = [
    insight?.next_order_date,
    strictDueDate,
    insight?.next_payment_due_date,
    insight?.inferred_due_date,
  ]
    .map((value) => normalizeTransactionDate(value))
    .filter(Boolean)
    .map((value) => (value < todayKey ? todayKey : value))
    .sort();

  if (candidateDates.length) {
    return candidateDates[0];
  }

  const hasOutstandingPressure = Number(insight?.po_balance_due || 0) > 0
    || Number(insight?.ledger_balance || 0) > 0
    || Number(insight?.outstanding_amount || 0) > 0;

  return hasOutstandingPressure ? todayKey : null;
};

module.exports = { resolveIrregularScheduleDate };
