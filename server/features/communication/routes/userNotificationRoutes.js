const registerUserNotificationRoutes = (deps) => {
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

  app.get('/api/notifications/me', requireAuth, async (req, res) => {
    try {
      const userId = Number(req.authUser?.id || 0);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const unreadOnly = parseBooleanEnv(req.query?.unread_only, false);
      const rawBeforeId = Number(req.query?.before_id || 0);
      const beforeId =
        Number.isFinite(rawBeforeId) && rawBeforeId > 0 ? Math.floor(rawBeforeId) : 0;
      const requestedLimit = Number(req.query?.limit || 20);
      const limit = Math.max(
        1,
        Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20)
      );
      const params = [userId];
      let sql = `SELECT *
        FROM app_notifications
        WHERE user_id = ?`;
      if (unreadOnly) {
        sql += ` AND COALESCE(is_read, 0) = 0`;
      }
      if (beforeId > 0) {
        sql += ` AND id < ?`;
        params.push(beforeId);
      }
      sql += ` ORDER BY id DESC LIMIT ?`;
      params.push(limit);

      const rows = await dbAllAsync(sql, params);
      const items = (rows || []).map((row) => ({
        ...row,
        is_read: Number(row?.is_read || 0) === 1,
        metadata: parseJsonText(row?.metadata, null),
      }));
      const nextBeforeId =
        items.length === limit ? Number(items[items.length - 1]?.id || 0) || null : null;
      return res.json({
        items,
        paging: {
          limit,
          next_before_id: nextBeforeId,
          has_more: Boolean(nextBeforeId),
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load notifications' });
    }
  });

  app.get('/api/notifications/me/unread-count', requireAuth, async (req, res) => {
    try {
      const userId = Number(req.authUser?.id || 0);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const row = await dbGetAsync(
        `SELECT COUNT(*) AS count
         FROM app_notifications
         WHERE user_id = ? AND COALESCE(is_read, 0) = 0`,
        [userId]
      );
      return res.json({ count: Number(row?.count || 0) });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to load unread notification count' });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      const notificationId = Number(req.params.id || 0);
      if (!notificationId) return res.status(400).json({ error: 'Invalid notification id' });
      const row = await dbGetAsync(`SELECT * FROM app_notifications WHERE id = ? AND user_id = ?`, [
        notificationId,
        Number(req.authUser?.id || 0),
      ]);
      if (!row) return res.status(404).json({ error: 'Notification not found' });
      await dbRunAsync(
        `UPDATE app_notifications
         SET is_read = 1, read_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [notificationId, Number(req.authUser?.id || 0)]
      );
      return res.json({ success: true, id: notificationId, is_read: true });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to mark notification as read' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
      await dbRunAsync(
        `UPDATE app_notifications
         SET is_read = 1, read_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND COALESCE(is_read, 0) = 0`,
        [Number(req.authUser?.id || 0)]
      );
      return res.json({ success: true });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to mark notifications as read' });
    }
  });
};

module.exports = { registerUserNotificationRoutes };
