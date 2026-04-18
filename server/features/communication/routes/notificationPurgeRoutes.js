const registerNotificationPurgeRoutes = (deps) => {
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

  app.post('/api/internal/notifications/purge', requireCronSecret, async (req, res) => {
    try {
      const rawDays = Number(
        req.body?.older_than_days ?? req.query?.older_than_days ?? APP_NOTIFICATION_RETENTION_DAYS
      );
      const days = Number.isFinite(rawDays)
        ? Math.max(1, Math.min(365, Math.floor(rawDays)))
        : APP_NOTIFICATION_RETENTION_DAYS;
      const rawLimit = Number(
        req.body?.limit ?? req.query?.limit ?? APP_NOTIFICATION_PURGE_BATCH_LIMIT
      );
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(50000, Math.floor(rawLimit)))
        : APP_NOTIFICATION_PURGE_BATCH_LIMIT;
      const result = await purgeOldAppNotificationsAsync({
        olderThanDays: days,
        limit,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to purge old notifications' });
    }
  });
};

module.exports = { registerNotificationPurgeRoutes };
