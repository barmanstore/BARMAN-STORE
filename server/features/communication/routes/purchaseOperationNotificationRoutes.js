const registerPurchaseOperationNotificationRoutes = (deps) => {
  const {
    app,
    requireCronSecret,
    runPurchaseOperationNotificationsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
  } = deps;

  const handlePurchaseOperationNotificationsRun = async (req, res) => {
    try {
      if (!PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED) {
        return res.status(503).json({ error: 'Purchase operation notifications are disabled' });
      }
      const result = await runPurchaseOperationNotificationsAsync({
        date: req.body?.date || req.query?.date || null,
        distributorId: req.body?.distributor_id || req.query?.distributor_id || null,
        createdBy: null,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to run purchase operation notifications' });
    }
  };

  app.get(
    '/api/internal/purchase-operations/notifications/run',
    requireCronSecret,
    handlePurchaseOperationNotificationsRun
  );
  app.post(
    '/api/internal/purchase-operations/notifications/run',
    requireCronSecret,
    handlePurchaseOperationNotificationsRun
  );
};

module.exports = { registerPurchaseOperationNotificationRoutes };
