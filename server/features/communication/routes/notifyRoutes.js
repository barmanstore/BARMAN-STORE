const registerNotifyRoutes = (deps) => {
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

  app.post('/api/notify-order/:orderId', requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [orderId]);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const userId = order.user_id;
      const senderId = Number(req.body?.sender_id || req.authUser?.id || userId || 0) || null;
      const action = req.body?.action || 'updated';
      const message = `Your order ${order.order_number || `#${order.id}`} was ${action}.`;
      if (userId) {
        await dbRunAsync(
          `INSERT INTO messages (sender_id, recipient_id, subject, body, read) VALUES (?, ?, ?, ?, 0)`,
          [senderId, userId, `Order ${action}`, message]
        );
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerNotifyRoutes };
