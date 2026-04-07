const buildSummaryFilters = ({
  req,
  normalizeTransactionDate,
  addDaysToDateKey,
  resolveRollupRange,
} = {}) => {
  const todayKey = normalizeTransactionDate(req.query?.date || new Date().toISOString())
    || new Date().toISOString().slice(0, 10);
  const tomorrowKey = addDaysToDateKey(todayKey, 1) || todayKey;
  const boardEndKey = addDaysToDateKey(todayKey, 6) || todayKey;
  const distributorIdFilter = Number(req.query?.distributor_id || 0) || null;
  const rollupRange = resolveRollupRange({
    startDate: req.query?.rollup_start_date || null,
    endDate: req.query?.rollup_end_date || null,
    days: req.query?.rollup_days || 30,
  });

  return {
    todayKey,
    tomorrowKey,
    boardEndKey,
    distributorIdFilter,
    rollupRange,
  };
};

module.exports = { buildSummaryFilters };
