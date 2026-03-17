const { createRollupState } = require('./rollups/rollupState');
const { createRollupQueries } = require('./rollups/rollupQueries');

const createPurchaseOperationsRollups = (deps) => {
  const {
    dbAllAsync,
    normalizeTransactionDate,
    getWeekdayFromDateKey,
    resolveRollupRange,
    buildDateSeries,
    normalizePoLifecycleStatus,
    PURCHASE_ACTION_ROLLUP_FIELDS,
    PURCHASE_ACTION_STATUS_MAP,
    PURCHASE_WEEKDAYS,
  } = deps;

  const rollupState = createRollupState({
    normalizeTransactionDate,
    getWeekdayFromDateKey,
    PURCHASE_ACTION_ROLLUP_FIELDS,
    PURCHASE_WEEKDAYS,
  });
  const rollupQueries = createRollupQueries({
    dbAllAsync,
    normalizePoLifecycleStatus,
    PURCHASE_ACTION_STATUS_MAP,
  });

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
    const byDayMap = new Map();
    daySeries.forEach((dateKey) => rollupState.ensureDay(byDayMap, dateKey));

    const poCreatedRows = await rollupQueries.fetchPoCreatedRows({ normalizedStart, normalizedEnd, distributorId });
    poCreatedRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, 'po_created', 1));

    const statusRows = await rollupQueries.fetchStatusRows({ normalizedStart, normalizedEnd, distributorId });
    statusRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, row.action_key, 1));

    const paymentRows = await rollupQueries.fetchPaymentRows({ normalizedStart, normalizedEnd, distributorId });
    paymentRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, 'payment', 1));

    const deliveryRows = await rollupQueries.fetchDeliveryRows({ normalizedStart, normalizedEnd, distributorId });
    deliveryRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, 'delivery_received', 1));

    const returnRows = await rollupQueries.fetchReturnRows({ normalizedStart, normalizedEnd, distributorId });
    returnRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, 'return', 1));

    const ledgerRows = await rollupQueries.fetchLedgerRows({ normalizedStart, normalizedEnd, distributorId });
    ledgerRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, 'ledger_manual', 1));

    const reminderRows = await rollupQueries.fetchReminderRows({ normalizedStart, normalizedEnd, distributorId });
    reminderRows.forEach((row) => rollupState.addCount(byDayMap, row.action_date, 'reminder_sent', 1));

    const byDay = rollupState.buildByDay(byDayMap);
    const totals = rollupState.buildTotals(byDay);

    return {
      range: {
        start_date: normalizedStart,
        end_date: normalizedEnd,
      },
      actions: PURCHASE_ACTION_ROLLUP_FIELDS,
      totals,
      by_day: byDay,
      by_weekday: rollupState.buildByWeekday(byDay),
    };
  };


  return {
    buildPurchaseActionRollupsAsync,
  };
};

module.exports = { createPurchaseOperationsRollups };
