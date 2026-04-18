const registerMessageToAdminRoutes = (deps) => {
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

  app.post('/api/notifications/messages/to-admin', requireAuth, async (req, res) => {
    try {
      const senderId = Number(req.authUser?.id || 0);
      if (!senderId) return res.status(401).json({ error: 'Unauthorized' });
      const senderRole = String(req.authUser?.role || '')
        .trim()
        .toLowerCase();
      if (senderRole === 'admin') {
        return res.status(400).json({ error: 'Admins should use customer message endpoint' });
      }
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Message is required' });
      if (message.length > 1000)
        return res.status(400).json({ error: 'Message is too long (max 1000 characters)' });
      const senderName = String(req.authUser?.name || '').trim() || `User #${senderId}`;

      await notifyAdmins({
        title: `Message from ${senderName}`,
        message,
        level: 'info',
        entityType: 'conversation',
        metadata: {
          kind: 'chat_message',
          direction: 'customer_to_admin',
          from_user_id: senderId,
          from_user_name: senderName,
          route: '/admin?tab=users',
        },
        createdBy: senderId,
      });

      await createAppNotification({
        userId: senderId,
        title: 'Message sent',
        message: 'Your message was sent to admin inbox.',
        level: 'success',
        entityType: 'conversation',
        metadata: {
          kind: 'chat_message',
          direction: 'outbound',
          route: '/profile',
        },
        createdBy: senderId,
      });

      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to send message' });
    }
  });
};

module.exports = { registerMessageToAdminRoutes };
