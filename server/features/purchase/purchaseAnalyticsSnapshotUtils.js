const createPurchaseAnalyticsSnapshotUtils = (deps = {}) => {
  const { dbRunAsync, normalizeTransactionDate } = deps;

  const savePurchaseAnalyticsSnapshotAsync = async ({
    snapshotDate = null,
    distributorId = 0,
    payload = {},
  } = {}) => {
    const normalizedDate = normalizeTransactionDate(snapshotDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    const payloadJson = JSON.stringify(payload ?? {});
    return dbRunAsync(
      `INSERT INTO purchase_analytics_snapshots (snapshot_date, distributor_id, payload)
       VALUES (?, ?, ?::jsonb)
       ON CONFLICT (snapshot_date, distributor_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
      [normalizedDate, Number(distributorId || 0), payloadJson]
    );
  };

  const persistPurchaseAnalyticsSnapshotsAsync = async ({
    snapshotDate = null,
    cards = {},
    predictedPaymentsToday = [],
    predictedPaymentsNext = [],
    predictedDeliveriesNext = [],
    distributorInsights = [],
  } = {}) => {
    const normalizedDate = normalizeTransactionDate(snapshotDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    const globalPayload = {
      snapshot_date: normalizedDate,
      cards,
      predicted_payments_today: predictedPaymentsToday,
      predicted_payments_next: predictedPaymentsNext,
      predicted_deliveries_next: predictedDeliveriesNext,
      distributor_insights: distributorInsights,
      computed_at: new Date().toISOString(),
    };
    await savePurchaseAnalyticsSnapshotAsync({
      snapshotDate: normalizedDate,
      distributorId: 0,
      payload: globalPayload,
    });

    for (const entry of Array.isArray(distributorInsights) ? distributorInsights : []) {
      if (!entry?.distributor_id) continue;
      const payload = {
        snapshot_date: normalizedDate,
        distributor_id: entry.distributor_id,
        distributor_name: entry.distributor_name,
        last_order_date: entry.last_order_date,
        last_delivery_date: entry.last_delivery_date,
        last_payment_date: entry.last_payment_date,
        avg_payment_lag_days: entry.inferred_payment_due_days,
        avg_delivery_days: entry.avg_delivery_days,
        outstanding_amount: entry.outstanding_amount,
        po_balance_due: entry.po_balance_due,
        ledger_balance: entry.ledger_balance,
        likely_items: entry.likely_items || [],
        suggested_items: entry.suggested_items || [],
        products_supplied_text: entry.products_supplied_text || '',
        novelty_alerts: entry.novelty_alerts || [],
        novelty_summary: entry.novelty_summary || { total_count: 0 },
        computed_at: new Date().toISOString(),
      };
      await savePurchaseAnalyticsSnapshotAsync({
        snapshotDate: normalizedDate,
        distributorId: entry.distributor_id,
        payload,
      });
    }
  };

  return {
    savePurchaseAnalyticsSnapshotAsync,
    persistPurchaseAnalyticsSnapshotsAsync,
  };
};

module.exports = { createPurchaseAnalyticsSnapshotUtils };
