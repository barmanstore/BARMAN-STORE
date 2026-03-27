const registerCreditPaymentIntelligenceJobRoutes = (deps) => {
  const {
    app,
    requireCronSecret,
    rebuildAllCustomerPaymentIntelligence,
  } = deps;

  const handleRun = async (_req, res) => {
    try {
      const result = await rebuildAllCustomerPaymentIntelligence({ nowMs: Date.now() });
      return res.json(result);
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      return res.status(status).json({ error: error?.message || 'Failed to rebuild customer payment intelligence' });
    }
  };

  app.get('/api/internal/credits/payment-intelligence/run', requireCronSecret, handleRun);
  app.post('/api/internal/credits/payment-intelligence/run', requireCronSecret, handleRun);
};

module.exports = { registerCreditPaymentIntelligenceJobRoutes };
