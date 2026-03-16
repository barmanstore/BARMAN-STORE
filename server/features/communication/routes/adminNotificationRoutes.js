const registerAdminNotificationRoutes = (deps) => {
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

  app.post('/api/admin/notifications/email/prepare', requireAdmin, async (req, res) => {
    try {
      const type = String(req.body?.type || '').trim().toLowerCase();
      if (type !== 'email_verification') {
        return res.status(400).json({ error: 'Unsupported notification type' });
      }

      const targetUserId = Number(req.body?.user_id || 0);
      const targetEmail = normalizeEmail(req.body?.email);
      let user = null;

      if (targetUserId) {
        user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE id = ?`, [targetUserId]);
      } else if (targetEmail) {
        user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE email = ?`, [targetEmail]);
      } else {
        return res.status(400).json({ error: 'user_id or email is required' });
      }

      if (!user || !normalizeEmail(user.email)) {
        return res.status(404).json({ error: 'User with valid email not found' });
      }

      if (Number(user.email_verified || 0) === 1) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      const delivery = await sendEmailVerificationChallenge({
        userId: user.id,
        email: normalizeEmail(user.email),
        recipientName: user.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
        exposeTemplate: true,
        deliveryModeOverride: 'manual',
      });

      return res.status(201).json({
        success: true,
        type,
        user: {
          id: user.id,
          name: user.name,
          email: normalizeEmail(user.email),
        },
        delivery,
        prepared_email: delivery.email || null,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to prepare notification' });
    }
  });

  app.post('/api/admin/notifications/whatsapp/prepare', requireAdmin, async (req, res) => {
    try {
      const type = String(req.body?.type || '').trim().toLowerCase();
      if (type !== 'phone_verification') {
        return res.status(400).json({ error: 'Unsupported notification type' });
      }

      const targetUserId = Number(req.body?.user_id || 0);
      const phoneParsed = parsePhoneInput(req.body?.phone);
      if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
      const targetPhone = phoneParsed.value;
      let user = null;

      if (targetUserId) {
        user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE id = ?`, [targetUserId]);
      } else if (targetPhone) {
        user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE phone = ?`, [targetPhone]);
      } else {
        return res.status(400).json({ error: 'user_id or phone is required' });
      }

      if (!user || !normalizePhone(user.phone)) {
        return res.status(404).json({ error: 'User with valid phone not found' });
      }

      if (Number(user.phone_verified || 0) === 1) {
        return res.status(400).json({ error: 'Phone is already verified' });
      }

      const delivery = await sendPhoneVerificationChallenge({
        userId: user.id,
        phone: normalizePhone(user.phone),
        recipientName: user.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
        exposeTemplate: true,
        deliveryModeOverride: 'manual',
      });

      return res.status(201).json({
        success: true,
        type,
        user: {
          id: user.id,
          name: user.name,
          phone: normalizePhone(user.phone),
        },
        delivery,
        prepared_whatsapp: delivery.whatsapp || null,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to prepare notification' });
    }
  });

  app.post('/api/admin/notifications/:id/mark-sent', requireAdmin, async (req, res) => {
    try {
      const eventId = Number(req.params.id || 0);
      if (!eventId) return res.status(400).json({ error: 'Invalid notification id' });
      const row = await dbGetAsync(`SELECT id FROM notification_events WHERE id = ?`, [eventId]);
      if (!row) return res.status(404).json({ error: 'Notification event not found' });
      await updateNotificationEventStatus(eventId, {
        status: 'sent',
        sentBy: Number(req.authUser?.id || 0) || null,
      });
      return res.json({ success: true, id: eventId, status: 'sent' });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update notification status' });
    }
  });

};

module.exports = { registerAdminNotificationRoutes };
