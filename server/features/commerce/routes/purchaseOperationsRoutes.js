const registerPurchaseOperationsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireCronSecret,
    handlePurchaseOperationsSummary,
  } = deps;

  const respondPurchaseOperationsSummary = (req, res) =>
    handlePurchaseOperationsSummary(req, res);

  const runPurchaseOperationsAnalytics = (req, res) =>
    handlePurchaseOperationsSummary(req, res, { persistSnapshots: true });

  app.get('/api/purchase-operations/summary', requireAdmin, respondPurchaseOperationsSummary);
  app.get('/api/internal/purchase-operations/analytics/run', requireCronSecret, runPurchaseOperationsAnalytics);
  app.post('/api/internal/purchase-operations/analytics/run', requireCronSecret, runPurchaseOperationsAnalytics);
};

module.exports = { registerPurchaseOperationsRoutes };
