const createPurchaseOperationsPaymentPredictions = () => {
  const buildPaymentPredictions = ({
    baseData,
    payablesWithInsights,
    distributorInsights,
  }) => {
    const { todayKey } = baseData;

    const predictedPaymentsToday = payablesWithInsights
      .filter((entry) => entry.inferred_due_date === todayKey || entry.payment_due_date === todayKey || entry.payment_due_date < todayKey)
      .map((entry) => ({
        ...entry,
        prediction_reason: entry.payment_due_date < todayKey
          ? 'overdue'
          : (entry.inferred_due_date === todayKey && entry.payment_due_date !== todayKey ? 'history_inferred_today' : 'due_today'),
      }))
      .sort((a, b) => Number(b.balance_due || 0) - Number(a.balance_due || 0)
        || String(b.distributor_name || '').localeCompare(String(b.distributor_name || '')));

    const predictedPaymentsNext = distributorInsights
      .filter((entry) => entry.next_payment_due_date)
      .map((entry) => ({
        distributor_id: entry.distributor_id,
        distributor_name: entry.distributor_name,
        next_payment_due_date: entry.next_payment_due_date,
        next_payment_due_source: entry.next_payment_due_source,
        predicted_payment_amount: Number(entry.predicted_payment_amount || 0),
        outstanding_amount: Number(entry.outstanding_amount || 0),
      }))
      .sort((a, b) => String(a.next_payment_due_date || '').localeCompare(String(b.next_payment_due_date || ''))
        || Number(b.predicted_payment_amount || 0) - Number(a.predicted_payment_amount || 0));

    const predictedDeliveriesNext = distributorInsights
      .filter((entry) => entry.next_delivery_date)
      .map((entry) => ({
        distributor_id: entry.distributor_id,
        distributor_name: entry.distributor_name,
        next_delivery_date: entry.next_delivery_date,
        next_delivery_source: entry.next_delivery_source,
        predicted_delivery_count: Number(entry.predicted_delivery_count || 0),
        active_open_orders: Number(entry.active_open_orders || 0),
      }))
      .sort((a, b) => String(a.next_delivery_date || '').localeCompare(String(b.next_delivery_date || ''))
        || Number(b.predicted_delivery_count || 0) - Number(a.predicted_delivery_count || 0));

    const nextPaymentDate = predictedPaymentsNext[0]?.next_payment_due_date || null;
    const nextDeliveryDate = predictedDeliveriesNext[0]?.next_delivery_date || null;

    return {
      predictedPaymentsToday,
      predictedPaymentsNext,
      predictedDeliveriesNext,
      nextPaymentDate,
      nextDeliveryDate,
    };
  };

  return { buildPaymentPredictions };
};

module.exports = { createPurchaseOperationsPaymentPredictions };
