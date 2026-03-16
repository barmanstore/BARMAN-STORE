const registerPurchaseOperationNotificationRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    requireCronSecret,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    dbTxAsync,
    normalizeEmail,
    parsePhoneInput,
    normalizePhone,
    parseBooleanEnv,
    normalizeVisitorSessionId,
    generateVisitorSessionId,
    sanitizeTrackedPath,
    sanitizeShortText,
    hashVisitorIp,
    getAuthUserFromRequest,
    SQL_UPSERT_VISITOR_SESSION,
    VISITOR_ONLINE_WINDOW_MINUTES,
    sendEmailVerificationChallenge,
    sendPhoneVerificationChallenge,
    updateNotificationEventStatus,
    createAppNotification,
    notifyAdmins,
    purgeOldAppNotificationsAsync,
    APP_NOTIFICATION_RETENTION_DAYS,
    APP_NOTIFICATION_PURGE_BATCH_LIMIT,
    runPurchaseOperationNotificationsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    resolveClientRequestId,
    parseJsonText,
    safeSerializeJson,
    isUniqueViolationError,
    crypto,
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
      return res.status(500).json({ error: error.message || 'Failed to run purchase operation notifications' });
    }
  };

  app.get('/api/internal/purchase-operations/notifications/run', requireCronSecret, handlePurchaseOperationNotificationsRun);
  app.post('/api/internal/purchase-operations/notifications/run', requireCronSecret, handlePurchaseOperationNotificationsRun);

};

module.exports = { registerPurchaseOperationNotificationRoutes };
