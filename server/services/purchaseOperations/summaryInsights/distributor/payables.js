const attachInsightsToPayables = ({
  payables,
  distributorInsightById,
  orderById,
  normalizeTransactionDate,
} = {}) =>
  payables.map((entry) => {
    const insight = distributorInsightById.get(Number(entry.distributor_id || 0)) || null;
    const order = orderById.get(Number(entry.order_id || 0)) || null;
    return {
      ...entry,
      configured_due_date: normalizeTransactionDate(order?.payment_due_date || null) || null,
      strict_due_date: normalizeTransactionDate(order?.strict_due_date || null) || null,
      inferred_due_date: insight?.inferred_due_date || null,
      next_payment_due_date: insight?.next_payment_due_date || null,
      next_delivery_date: insight?.next_delivery_date || null,
      predicted_payment_amount: Number(insight?.predicted_payment_amount || 0),
      po_balance_due: Number(entry.balance_due || 0),
      ledger_balance: Number(insight?.ledger_balance || 0),
    };
  });

module.exports = { attachInsightsToPayables };
