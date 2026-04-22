const computeHistoryMetrics = ({
  historyRows,
  computeAverageGapDays,
  computeStdDev,
  computeAverageDays,
}) => {
  const costValues = historyRows
    .map((row) => Number(row.unit_cost_incl_tax || 0))
    .filter((value) => Number.isFinite(value));
  const timestamps = historyRows.map((row) => row.transaction_ts).filter(Boolean);
  const avgDaysBetween = computeAverageGapDays(timestamps);
  const priceVolatility = computeStdDev(costValues);

  const latestEntry = historyRows[0] || null;
  const previousEntry = historyRows[1] || null;
  const latestCost = latestEntry ? Number(latestEntry.unit_cost_incl_tax || 0) : null;
  const previousCost = previousEntry ? Number(previousEntry.unit_cost_incl_tax || 0) : null;
  const costDelta = previousCost ? latestCost - previousCost : null;
  const costDeltaPct = previousCost ? (costDelta / previousCost) * 100 : null;

  const leadTimes = historyRows
    .map((row) => {
      if (!row.received_at) return null;
      const orderAnchor = row.planned_order_date || row.created_at;
      if (!orderAnchor) return null;
      const diff = new Date(row.received_at).getTime() - new Date(orderAnchor).getTime();
      return Number.isFinite(diff) ? diff / 86400000 : null;
    })
    .filter((value) => Number.isFinite(value));
  const avgLeadTime = computeAverageDays(leadTimes);
  const onTimeRate = (() => {
    const evaluated = historyRows.filter((row) => row.received_at && row.expected_delivery);
    if (!evaluated.length) return null;
    const onTime = evaluated.filter(
      (row) => new Date(row.received_at) <= new Date(row.expected_delivery)
    ).length;
    return onTime / evaluated.length;
  })();

  return {
    avgDaysBetween,
    priceVolatility,
    latestCost,
    previousCost,
    costDelta,
    costDeltaPct,
    avgLeadTime,
    onTimeRate,
  };
};

module.exports = { computeHistoryMetrics };
