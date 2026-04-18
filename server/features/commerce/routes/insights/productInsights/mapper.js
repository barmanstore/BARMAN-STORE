const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapProductInsightsRows = (rows, deriveStockoutRisk) =>
  (rows || []).map((row) => {
    const latestCost = Number(row.latest_cost || 0);
    const previousCost = Number(row.previous_cost || 0);
    const costDelta = previousCost ? latestCost - previousCost : null;
    const costDeltaPct = previousCost ? (costDelta / previousCost) * 100 : null;
    const rawSeries = Array.isArray(row.cost_series)
      ? row.cost_series
      : typeof row.cost_series === 'string' && row.cost_series.startsWith('{')
        ? row.cost_series.slice(1, -1).split(',')
        : [];
    const costSeries = rawSeries
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(0, 12)
      .reverse();
    const availableDistributors = parseJsonArray(row.available_distributors)
      .map((entry) => ({
        id: Number(entry?.id || 0),
        name: String(entry?.name || '').trim(),
      }))
      .filter((entry) => entry.id > 0 && entry.name);
    const avgDaysBetween = row.avg_days_between === null ? null : Number(row.avg_days_between || 0);
    const sellingPrice = row.price == null ? null : Number(row.price || 0);
    const mrpPrice = row.mrp == null ? null : Number(row.mrp || 0);
    const effectivePrice =
      sellingPrice != null && sellingPrice > 0
        ? sellingPrice
        : mrpPrice != null && mrpPrice > 0
          ? mrpPrice
          : null;
    const marginAmount =
      effectivePrice != null && latestCost > 0 ? effectivePrice - latestCost : null;
    const marginPct =
      marginAmount != null && latestCost > 0 ? (marginAmount / latestCost) * 100 : null;
    const stockLevel =
      row.stock === null || row.stock === undefined ? null : Number(row.stock || 0);
    return {
      product_id: Number(row.product_id || 0),
      product_name: row.product_name,
      category: row.category,
      subcategory: row.subcategory,
      stock: stockLevel,
      price: sellingPrice,
      mrp: mrpPrice,
      margin_amount: marginAmount,
      margin_pct: marginPct,
      latest_cost: latestCost || null,
      latest_distributor_id: row.latest_distributor_id ? Number(row.latest_distributor_id) : null,
      latest_distributor_name: row.latest_distributor_name || null,
      latest_at: row.latest_at || null,
      previous_cost: previousCost || null,
      cost_change: costDelta,
      cost_change_pct: costDeltaPct,
      avg_cost: row.avg_cost === null ? null : Number(row.avg_cost || 0),
      min_cost: row.min_cost === null ? null : Number(row.min_cost || 0),
      max_cost: row.max_cost === null ? null : Number(row.max_cost || 0),
      price_volatility: row.price_volatility === null ? null : Number(row.price_volatility || 0),
      purchase_count: Number(row.purchase_count || 0),
      avg_days_between: avgDaysBetween,
      avg_lead_time: row.avg_lead_time === null ? null : Number(row.avg_lead_time || 0),
      on_time_rate: row.on_time_rate === null ? null : Number(row.on_time_rate || 0),
      best_distributor_id: row.best_distributor_id ? Number(row.best_distributor_id) : null,
      best_distributor_name: row.best_distributor_name || null,
      best_distributor_avg_cost:
        row.best_distributor_avg_cost === null ? null : Number(row.best_distributor_avg_cost || 0),
      available_distributors: availableDistributors,
      stockout_risk: deriveStockoutRisk(avgDaysBetween, stockLevel),
      cost_series: costSeries,
    };
  });

module.exports = { mapProductInsightsRows };
