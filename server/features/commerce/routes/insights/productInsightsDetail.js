const { fetchProductCostHistory } = require('./productDetail/fetchHistory');
const { computeHistoryMetrics } = require('./productDetail/computeMetrics');
const { loadProductDistributorInsights } = require('./productDetail/loadDistributors');
const { selectBestSupplier } = require('./productDetail/selectBestSupplier');

const registerProductInsightsDetailRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    computeAverageDays,
    computeAverageGapDays,
    computeStdDev,
    deriveStockoutRisk,
    resolveInsightDateRange,
  } = deps;

  app.get('/api/insights/products/:id(\\d+)', requireAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id || 0);
      if (!productId) return res.status(400).json({ error: 'Invalid product id' });

      const { startDate, endExclusive } = resolveInsightDateRange({
        startDate: req.query?.start_date || req.query?.date_from || null,
        endDate: req.query?.end_date || req.query?.date_to || null,
      });

      const product = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const historyRows = await fetchProductCostHistory({
        dbAllAsync,
        productId,
        startDate,
        endExclusive,
      });

      const metrics = computeHistoryMetrics({
        historyRows,
        computeAverageGapDays,
        computeStdDev,
        computeAverageDays,
      });

      const { distributors } = await loadProductDistributorInsights({
        dbAllAsync,
        productId,
      });

      const bestSupplier = selectBestSupplier({ distributors });

      return res.json({
        product,
        latest_cost: metrics.latestCost,
        previous_cost: metrics.previousCost,
        cost_change: metrics.costDelta,
        cost_change_pct: metrics.costDeltaPct,
        purchase_count: historyRows.length,
        avg_days_between: metrics.avgDaysBetween,
        avg_lead_time: metrics.avgLeadTime,
        on_time_rate: metrics.onTimeRate,
        price_volatility: metrics.priceVolatility,
        stockout_risk: deriveStockoutRisk(metrics.avgDaysBetween, product?.stock),
        history: historyRows,
        distributors,
        best_supplier: bestSupplier,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductInsightsDetailRoutes };
