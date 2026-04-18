const { validateMessagePayload, resolveSenderName } = require('./messageToCustomer/validation');
const { fetchMessageRecipients, mapRecipientNames } = require('./messageToCustomer/recipients');
const {
  findExistingBatch,
  createSendBatch,
  finalizeSendBatch,
} = require('./messageToCustomer/batches');
const {
  sendCustomerNotifications,
  sendSenderReceipt,
} = require('./messageToCustomer/notifications');

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
      const senderName = resolveSenderName(req.authUser);
      const payload = validateMessagePayload({
        message: req.body?.message,
        recipientUserIds: req.body?.recipient_user_ids,
      });
      if (payload.error) return res.status(400).json({ error: payload.error });

      if (clientRequestId) {
        const existingBatch = await findExistingBatch({
          dbGetAsync,
          clientRequestId,
          senderId,
          parseJsonText,
        });
        if (existingBatch) {
          return res.json({
            success: true,
            deduplicated: true,
            sent_count: existingBatch.sent_count,
            recipient_names: existingBatch.recipient_names,
          });
        }
      }

      const recipients = await fetchMessageRecipients({
        dbAllAsync,
        recipientIds: payload.recipientIds,
      });
      if (!recipients.length) {
        return res.status(400).json({ error: 'No valid customer recipients found' });
      }
      const recipientNames = mapRecipientNames(recipients);
      const sendResult = await dbTxAsync(async () => {
        const batchId = await createSendBatch({
          dbRunAsync,
          clientRequestId,
          senderId,
          message: payload.message,
          recipientIds: payload.recipientIds,
          recipientNames,
          safeSerializeJson,
        });

        await sendCustomerNotifications({
          recipients,
          senderId,
          senderName,
          message: payload.message,
          clientRequestId,
          createAppNotification,
          crypto,
        });

        await sendSenderReceipt({
          senderId,
          senderName,
          message: payload.message,
          recipientCount: recipients.length,
          clientRequestId,
          createAppNotification,
          crypto,
        });

        await finalizeSendBatch({
          dbRunAsync,
          batchId,
          sentCount: recipients.length,
        });

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
        const existingBatch = await findExistingBatch({
          dbGetAsync,
          clientRequestId,
          senderId,
          parseJsonText,
        });
        if (existingBatch) {
          return res.json({
            success: true,
            deduplicated: true,
            sent_count: existingBatch.sent_count,
            recipient_names: existingBatch.recipient_names,
          });
        }
      }
      return res.status(500).json({ error: error.message || 'Failed to send messages' });
    }
  });
};

module.exports = { registerMessageToCustomerRoutes };
