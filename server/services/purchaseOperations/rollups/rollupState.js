const createRollupState = ({
  normalizeTransactionDate,
  getWeekdayFromDateKey,
  PURCHASE_ACTION_ROLLUP_FIELDS,
  PURCHASE_WEEKDAYS,
} = {}) => {
  const actionKeys = PURCHASE_ACTION_ROLLUP_FIELDS.map((field) => field.key);
  const buildEmptyCounts = () =>
    actionKeys.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});

  const ensureDay = (byDayMap, dateKey) => {
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

  const addCount = (byDayMap, dateKey, actionKey, amount = 1) => {
    if (!actionKey) return;
    const entry = ensureDay(byDayMap, dateKey);
    if (!entry) return;
    entry[actionKey] = Number(entry[actionKey] || 0) + Number(amount || 0);
  };

  const buildByDay = (byDayMap) =>
    [...byDayMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const weekdayOrder = [
    PURCHASE_WEEKDAYS[1],
    PURCHASE_WEEKDAYS[2],
    PURCHASE_WEEKDAYS[3],
    PURCHASE_WEEKDAYS[4],
    PURCHASE_WEEKDAYS[5],
    PURCHASE_WEEKDAYS[6],
    PURCHASE_WEEKDAYS[0],
  ].filter(Boolean);

  const buildByWeekday = (byDay) => {
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
    return weekdayOrder.map((weekday) => byWeekdayMap.get(weekday));
  };

  const buildTotals = (byDay) => {
    const totals = buildEmptyCounts();
    byDay.forEach((entry) => {
      actionKeys.forEach((key) => {
        totals[key] += Number(entry[key] || 0);
      });
    });
    return totals;
  };

  return {
    actionKeys,
    buildEmptyCounts,
    ensureDay,
    addCount,
    buildByDay,
    buildByWeekday,
    buildTotals,
    weekdayOrder,
  };
};

module.exports = { createRollupState };
