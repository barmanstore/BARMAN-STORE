const { createPurchaseOperationsSummaryDataFetch } = require('./summaryDataFetch');
const { createPurchaseOperationsSummaryMetrics } = require('./summaryMetrics');
const { createPurchaseOperationsSummaryInsights } = require('./summaryInsights');
const { createPurchaseOperationsSummaryResponse } = require('./summaryResponse');

const createPurchaseOperationsSummary = (deps) => {
  const dataFetch = createPurchaseOperationsSummaryDataFetch(deps);
  const metrics = createPurchaseOperationsSummaryMetrics(deps);
  const insights = createPurchaseOperationsSummaryInsights(deps);
  const responseBuilder = createPurchaseOperationsSummaryResponse(deps);

  const handlePurchaseOperationsSummary = async (req, res, { persistSnapshots = true } = {}) => {
    try {
      const baseData = await dataFetch.fetchPurchaseOperationsSummaryData(req);
      const metricsData = metrics.buildPurchaseOperationsMetrics(baseData);
      const insightsData = insights.buildPurchaseOperationsInsights(baseData, metricsData);
      const payload = await responseBuilder.buildPurchaseOperationsResponse({
        baseData,
        insights: insightsData,
        persistSnapshots,
      });
      return res.json(payload);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to load purchase operations summary' });
    }
  };

  const collectPurchaseAnalyticsSnapshotsAsync = async ({
    date = null,
    distributorId = null,
  } = {}) => {
    if (typeof handlePurchaseOperationsSummary !== 'function') return null;
    const req = { query: {} };
    if (date) req.query.date = date;
    if (distributorId) req.query.distributor_id = distributorId;
    const res = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return payload;
      },
    };
    await handlePurchaseOperationsSummary(req, res, { persistSnapshots: true });
    if (res.statusCode >= 400) {
      throw new Error(res.payload?.error || 'Failed to collect purchase analytics snapshots');
    }
    return res.payload;
  };

  return {
    handlePurchaseOperationsSummary,
    collectPurchaseAnalyticsSnapshotsAsync,
  };
};

module.exports = { createPurchaseOperationsSummary };
