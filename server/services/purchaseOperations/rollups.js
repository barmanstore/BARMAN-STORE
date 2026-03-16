const createPurchaseOperationsRollups = (deps) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    normalizeTransactionDate,
    addDaysToDateKey,
    normalizeBooleanFlag,
    getDistributorOrderScheduleDay,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    getWeekdayFromDateKey,
    parseDistributorProductsSupplied,
    mergeDistributorProductKnowledge,
    getDistributorPaymentPlan,
    computeAverageDays,
    computeAverageGapDays,
    computeStdDev,
    deriveStockoutRisk,
    getPurchaseOrderPaymentAnchorDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getDaysBetweenDateKeys,
    pickLatestDateKey,
    pickEarliestDateKey,
    normalizePoPaymentStatus,
    getEffectivePurchaseDueDateKey,
    resolveRollupRange,
    buildDateSeries,
    normalizePoLifecycleStatus,
    resolveInsightDateRange,
    notifyAdmins,
    PURCHASE_ACTION_ROLLUP_FIELDS,
    PURCHASE_ACTION_STATUS_MAP,
    PURCHASE_WEEKDAYS,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
    derivePurchaseNextAction,
    persistPurchaseAnalyticsSnapshotsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
    IS_VERCEL_RUNTIME,
  } = deps;

  const buildPurchaseActionRollupsAsync = async ({
    startDate,
    endDate,
    distributorId = null,
  } = {}) => {
    const { startDate: normalizedStart, endDate: normalizedEnd } = resolveRollupRange({
      startDate,
      endDate,
    });
    const daySeries = buildDateSeries(normalizedStart, normalizedEnd);
    const actionKeys = PURCHASE_ACTION_ROLLUP_FIELDS.map((field) => field.key);
    const buildEmptyCounts = () => actionKeys.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    const byDayMap = new Map();
    const ensureDay = (dateKey) => {
      const normalized = normalizeTransactionDate(dateKey);
      if (!normalized) return null;
      if (byDayMap.has(normalized)) return byDayMap.get(normalized);
      const weekday = getWeekdayFromDateKey(normalized);
      const entry = {
        date: normalized,
        weekday,
        ...buildEmptyCounts(),
      };
      byDayMap.set(normalized, entry);
      return entry;
    };
    const addCount = (dateKey, actionKey, amount = 1) => {
      if (!actionKey) return;
      const entry = ensureDay(dateKey);
      if (!entry) return;
      entry[actionKey] = Number(entry[actionKey] || 0) + Number(amount || 0);
    };

    daySeries.forEach((dateKey) => ensureDay(dateKey));

    const rangeParams = [normalizedStart, normalizedEnd];
    const distributorParams = distributorId ? [distributorId] : [];
    const params = distributorId ? [...rangeParams, ...distributorParams] : rangeParams;

    const poCreatedRows = await dbAllAsync(
      `SELECT date(created_at) AS action_date
       FROM purchase_orders
       WHERE date(created_at) >= date(?)
         AND date(created_at) <= date(?)
         ${distributorId ? `AND distributor_id = ?` : ''}`,
      params
    );
    poCreatedRows.forEach((row) => addCount(row.action_date, 'po_created', 1));

    const statusRows = await dbAllAsync(
      `SELECT date(posh.created_at) AS action_date, LOWER(posh.to_status) AS to_status
       FROM purchase_order_status_history posh
       LEFT JOIN purchase_orders po ON po.id = posh.purchase_order_id
       WHERE date(posh.created_at) >= date(?)
         AND date(posh.created_at) <= date(?)
         ${distributorId ? `AND po.distributor_id = ?` : ''}`,
      params
    );
    statusRows.forEach((row) => {
      const statusKey = normalizePoLifecycleStatus(row.to_status || '');
      const actionKey = PURCHASE_ACTION_STATUS_MAP.get(statusKey) || null;
      if (actionKey) addCount(row.action_date, actionKey, 1);
    });

    const paymentRows = await dbAllAsync(
      `SELECT date(COALESCE(transaction_date, created_at)) AS action_date
       FROM purchase_order_payments
       WHERE date(COALESCE(transaction_date, created_at)) >= date(?)
         AND date(COALESCE(transaction_date, created_at)) <= date(?)
         ${distributorId ? `AND distributor_id = ?` : ''}`,
      params
    );
    paymentRows.forEach((row) => addCount(row.action_date, 'payment', 1));

    const deliveryRows = await dbAllAsync(
      `SELECT date(received_at) AS action_date
       FROM purchase_orders
       WHERE received_at IS NOT NULL
         AND date(received_at) >= date(?)
         AND date(received_at) <= date(?)
         ${distributorId ? `AND distributor_id = ?` : ''}`,
      params
    );
    deliveryRows.forEach((row) => addCount(row.action_date, 'delivery_received', 1));

    const returnRows = await dbAllAsync(
      `SELECT date(created_at) AS action_date
       FROM purchase_returns
       WHERE date(created_at) >= date(?)
         AND date(created_at) <= date(?)
         ${distributorId ? `AND distributor_id = ?` : ''}`,
      params
    );
    returnRows.forEach((row) => addCount(row.action_date, 'return', 1));

    const ledgerRows = await dbAllAsync(
      `SELECT date(COALESCE(transaction_date, created_at)) AS action_date
       FROM distributor_ledger
       WHERE date(COALESCE(transaction_date, created_at)) >= date(?)
         AND date(COALESCE(transaction_date, created_at)) <= date(?)
         AND (
           source IS NULL
           OR TRIM(source) = ''
           OR LOWER(source) NOT IN ('purchase_order', 'po_payment', 'po_correction')
         )
         ${distributorId ? `AND distributor_id = ?` : ''}`,
      params
    );
    ledgerRows.forEach((row) => addCount(row.action_date, 'ledger_manual', 1));

    const reminderRows = await dbAllAsync(
      `SELECT date(COALESCE(sent_at, created_at)) AS action_date
       FROM distributor_purchase_reminders
       WHERE (sent_at IS NOT NULL OR LOWER(COALESCE(status, '')) = 'sent')
         AND date(COALESCE(sent_at, created_at)) >= date(?)
         AND date(COALESCE(sent_at, created_at)) <= date(?)
         ${distributorId ? `AND distributor_id = ?` : ''}`,
      params
    );
    reminderRows.forEach((row) => addCount(row.action_date, 'reminder_sent', 1));

    const byDay = [...byDayMap.values()]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const weekdayOrder = [
      PURCHASE_WEEKDAYS[1],
      PURCHASE_WEEKDAYS[2],
      PURCHASE_WEEKDAYS[3],
      PURCHASE_WEEKDAYS[4],
      PURCHASE_WEEKDAYS[5],
      PURCHASE_WEEKDAYS[6],
      PURCHASE_WEEKDAYS[0],
    ].filter(Boolean);
    const byWeekdayMap = new Map();
    weekdayOrder.forEach((weekday) => {
      byWeekdayMap.set(weekday, {
        weekday,
        day_count: 0,
        ...buildEmptyCounts(),
      });
    });
    byDay.forEach((entry) => {
      const bucket = byWeekdayMap.get(entry.weekday);
      if (!bucket) return;
      bucket.day_count += 1;
      actionKeys.forEach((key) => {
        bucket[key] += Number(entry[key] || 0);
      });
    });

    const totals = buildEmptyCounts();
    byDay.forEach((entry) => {
      actionKeys.forEach((key) => {
        totals[key] += Number(entry[key] || 0);
      });
    });

    return {
      range: {
        start_date: normalizedStart,
        end_date: normalizedEnd,
      },
      actions: PURCHASE_ACTION_ROLLUP_FIELDS,
      totals,
      by_day: byDay,
      by_weekday: weekdayOrder.map((weekday) => byWeekdayMap.get(weekday)),
    };
  };


  return {
    buildPurchaseActionRollupsAsync,
  };
};

module.exports = { createPurchaseOperationsRollups };
