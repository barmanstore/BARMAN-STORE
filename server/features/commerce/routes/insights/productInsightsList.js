const { buildProductInsightsQuery } = require('./productInsights/query');
const { mapProductInsightsRows } = require('./productInsights/mapper');

const registerProductInsightsListRoutes = (deps) => {
  const { app, requireAdmin, dbAllAsync, deriveStockoutRisk, resolveInsightDateRange } = deps;

  app.get('/api/insights/products', requireAdmin, async (req, res) => {
    try {
      const distributorId = Number(req.query?.distributor_id || 0) || null;
      const category = String(req.query?.category || '').trim();
      const { startDate, endExclusive } = resolveInsightDateRange({
        startDate: req.query?.start_date || req.query?.date_from || null,
        endDate: req.query?.end_date || req.query?.date_to || null,
      });

      const { sql, params } = buildProductInsightsQuery({
        distributorId,
        category,
        startDate,
        endExclusive,
      });
      const rows = await dbAllAsync(sql, params);
      const payload = mapProductInsightsRows(rows, deriveStockoutRisk);

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductInsightsListRoutes };
