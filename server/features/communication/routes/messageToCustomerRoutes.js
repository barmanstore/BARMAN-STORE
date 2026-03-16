const registerMessageToCustomerRoutes = (deps) => {
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

  app.post('/api/notifications/messages/to-customers', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const senderId = Number(req.authUser?.id || 0);
      const idempotency = resolveClientRequestId(req);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.value;
      const senderName = String(req.authUser?.name || '').trim() || 'Admin';
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Message is required' });
      if (message.length > 1000) return res.status(400).json({ error: 'Message is too long (max 1000 characters)' });
      if (clientRequestId) {
        const existingBatch = await dbGetAsync(
          `SELECT id, sent_count, recipient_names, recipient_count
           FROM notification_send_batches
           WHERE client_request_id = ? AND sender_user_id = ?
           LIMIT 1`,
          [clientRequestId, senderId]
        );
        if (existingBatch) {
          return res.json({
            success: true,
            deduplicated: true,
            sent_count: Number(existingBatch.sent_count || 0),
            recipient_names: parseJsonText(existingBatch.recipient_names, []) || [],
          });
        }
      }
      const recipientIds = Array.from(new Set(
        (Array.isArray(req.body?.recipient_user_ids) ? req.body.recipient_user_ids : [])
          .map((value) => Number(value || 0))
          .filter((value) => value > 0)
      ));
      if (!recipientIds.length) {
        return res.status(400).json({ error: 'Select at least one customer' });
      }
      if (recipientIds.length > 100) {
        return res.status(400).json({ error: 'Too many recipients (max 100)' });
      }

      const placeholders = recipientIds.map(() => '?').join(', ');
      const recipients = await dbAllAsync(
        `SELECT id, name
         FROM users
         WHERE role = 'customer'
           AND id IN (${placeholders})
         ORDER BY name ASC`,
        recipientIds
      );
      if (!recipients.length) {
        return res.status(400).json({ error: 'No valid customer recipients found' });
      }
      const recipientNames = recipients.map((row) => String(row?.name || '').trim()).filter(Boolean);
      const sendResult = await dbTxAsync(async () => {
        let batchId = null;
        if (clientRequestId) {
          const inserted = await dbRunAsync(
            `INSERT INTO notification_send_batches
            (client_request_id, sender_user_id, message, recipient_user_ids, recipient_names, recipient_count, sent_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              clientRequestId,
              senderId,
              message,
              safeSerializeJson(recipientIds),
              safeSerializeJson(recipientNames),
              recipients.length,
              0,
              'processing',
            ]
          );
          batchId = Number(inserted.lastInsertRowid || 0) || null;
        }

        for (const recipient of recipients) {
          const recipientId = Number(recipient?.id || 0);
          if (!recipientId) continue;
          const recipientRequestId = clientRequestId
            ? `notif:${crypto.createHash('sha1').update(`${clientRequestId}:${recipientId}`).digest('hex').slice(0, 32)}`
            : null;
          await createAppNotification({
            userId: recipientId,
            title: `Message from ${senderName}`,
            message,
            level: 'info',
            entityType: 'conversation',
            metadata: {
              kind: 'chat_message',
              direction: 'admin_to_customer',
              from_user_id: senderId,
              from_user_name: senderName,
              route: '/profile',
            },
            createdBy: senderId,
            clientRequestId: recipientRequestId,
          });
        }

        const senderRequestId = clientRequestId
          ? `notif:${crypto.createHash('sha1').update(`${clientRequestId}:sender`).digest('hex').slice(0, 32)}`
          : null;
        await createAppNotification({
          userId: senderId,
          title: 'Message sent',
          message: `Message sent to ${recipients.length} customer${recipients.length === 1 ? '' : 's'}.`,
          level: 'success',
          entityType: 'conversation',
          metadata: {
            kind: 'chat_message',
            direction: 'outbound',
            route: '/admin?tab=users',
          },
          createdBy: senderId,
          clientRequestId: senderRequestId,
        });

        if (batchId) {
          await dbRunAsync(
            `UPDATE notification_send_batches
             SET status = ?, sent_count = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            ['sent', recipients.length, batchId]
          );
        }

        return {
          sentCount: recipients.length,
        };
      });

      return res.json({
        success: true,
        sent_count: Number(sendResult?.sentCount || 0),
        recipient_names: recipientNames,
      });
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
        const senderId = Number(req.authUser?.id || 0);
        const existingBatch = await dbGetAsync(
          `SELECT sent_count, recipient_names
           FROM notification_send_batches
           WHERE client_request_id = ? AND sender_user_id = ?
           LIMIT 1`,
          [clientRequestId, senderId]
        );
        if (existingBatch) {
          return res.json({
            success: true,
            deduplicated: true,
            sent_count: Number(existingBatch.sent_count || 0),
            recipient_names: parseJsonText(existingBatch.recipient_names, []) || [],
          });
        }
      }
      return res.status(500).json({ error: error.message || 'Failed to send messages' });
    }
  });
};

module.exports = { registerMessageToCustomerRoutes };
