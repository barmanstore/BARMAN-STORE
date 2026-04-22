const createRangeUtils = ({ normalizeTransactionDate, addDaysToDateKey }) => {
  const resolveRollupRange = ({ startDate, endDate, days = 30 } = {}) => {
    const normalizedEnd =
      normalizeTransactionDate(endDate || new Date().toISOString()) ||
      new Date().toISOString().slice(0, 10);
    let normalizedStart = normalizeTransactionDate(startDate || null);
    const normalizedDays = Math.max(1, Number(days || 30));
    if (!normalizedStart) {
      normalizedStart = addDaysToDateKey(normalizedEnd, -(normalizedDays - 1)) || normalizedEnd;
    }
    if (normalizedStart > normalizedEnd) {
      return { startDate: normalizedEnd, endDate: normalizedStart };
    }
    return { startDate: normalizedStart, endDate: normalizedEnd };
  };

  const resolveInsightDateRange = ({ startDate, endDate } = {}) => {
    const normalizedStart = normalizeTransactionDate(startDate || null);
    const normalizedEnd = normalizeTransactionDate(endDate || null);
    const endExclusive = normalizedEnd ? addDaysToDateKey(normalizedEnd, 1) : null;
    return {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      endExclusive,
    };
  };

  return { resolveRollupRange, resolveInsightDateRange };
};

module.exports = { createRangeUtils };
