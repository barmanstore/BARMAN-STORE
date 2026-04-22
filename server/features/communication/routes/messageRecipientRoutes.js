const registerMessageRecipientRoutes = (deps) => {
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

  app.get('/api/notifications/message-recipients', requireAdmin, async (req, res) => {
    try {
      const q = String(req.query?.q || '').trim();
      const requestedLimit = Number(req.query?.limit || 20);
      const limit = Math.max(
        1,
        Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20)
      );
      const like = `%${q}%`;
      const rows = q
        ? await dbAllAsync(
            `SELECT id, name, email, phone
           FROM users
           WHERE role = 'customer'
             AND (
               LOWER(COALESCE(name, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(email, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(phone, '')) LIKE LOWER(?)
             )
           ORDER BY name ASC
           LIMIT ?`,
            [like, like, like, limit]
          )
        : await dbAllAsync(
            `SELECT id, name, email, phone
           FROM users
           WHERE role = 'customer'
           ORDER BY name ASC
           LIMIT ?`,
            [limit]
          );
      return res.json(rows || []);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load recipients' });
    }
  });
};

module.exports = { registerMessageRecipientRoutes };
