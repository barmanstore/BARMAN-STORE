const createNotificationUtils = (deps = {}) => {
  const {
    dbRunAsync,
    dbGetAsync,
    dbAllAsync,
    normalizeClientRequestId,
    safeSerializeJson,
    isUniqueViolationError,
  } = deps;

  const createNotificationEvent = async ({
    type,
    channel = 'email',
    recipient,
    recipientUserId = null,
    subject = null,
    body = null,
    metadata = null,
    status = 'prepared',
    preparedBy = null,
    sentBy = null,
  }) => {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const result = await dbRunAsync(
      `INSERT INTO notification_events
      (type, channel, recipient, recipient_user_id, subject, body, status, error_message, metadata, prepared_by, sent_by, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        String(type || '').trim(),
        String(channel || 'email').trim() || 'email',
        String(recipient || '').trim(),
        recipientUserId || null,
        subject ? String(subject) : null,
        body ? String(body) : null,
        String(status || 'prepared').trim() || 'prepared',
        metadataJson,
        preparedBy || null,
        sentBy || null,
        status === 'sent' ? new Date().toISOString() : null,
      ]
    );
    return Number(result.lastInsertRowid || 0);
  };

  const updateNotificationEventStatus = async (
    id,
    { status, errorMessage = null, sentBy = null }
  ) => {
    const eventId = Number(id || 0);
    if (!eventId) return;
    const normalizedStatus = String(status || '')
      .trim()
      .toLowerCase();
    const sentAt = normalizedStatus === 'sent' ? new Date().toISOString() : null;
    await dbRunAsync(
      `UPDATE notification_events
       SET status = ?, error_message = ?, sent_by = ?, sent_at = ?
       WHERE id = ?`,
      [
        normalizedStatus,
        errorMessage ? String(errorMessage) : null,
        sentBy || null,
        sentAt,
        eventId,
      ]
    );
  };

  const parseJsonText = (value, fallback = null) => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  };

  const normalizeNotificationLevel = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'success' || normalized === 'warning' || normalized === 'error')
      return normalized;
    return 'info';
  };

  const createAppNotification = async ({
    userId,
    title,
    message,
    level = 'info',
    entityType = null,
    entityId = null,
    issueId = null,
    metadata = null,
    createdBy = null,
    clientRequestId = null,
  }) => {
    const normalizedUserId = Number(userId || 0);
    if (!normalizedUserId) return 0;
    const normalizedTitle = String(title || '').trim();
    const normalizedMessage = String(message || '').trim();
    if (!normalizedTitle || !normalizedMessage) return 0;
    const normalizedClientRequestId = clientRequestId
      ? normalizeClientRequestId(clientRequestId) || null
      : null;
    if (normalizedClientRequestId) {
      const existing = await dbGetAsync(
        `SELECT id
         FROM app_notifications
         WHERE client_request_id = ?
         LIMIT 1`,
        [normalizedClientRequestId]
      );
      if (existing) return Number(existing.id || 0);
    }
    try {
      const result = await dbRunAsync(
        `INSERT INTO app_notifications
        (user_id, title, message, level, entity_type, entity_id, issue_id, is_read, metadata, created_by, read_at, client_request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
        [
          normalizedUserId,
          normalizedTitle,
          normalizedMessage,
          normalizeNotificationLevel(level),
          entityType ? String(entityType).trim() : null,
          entityId ? Number(entityId || 0) : null,
          issueId ? Number(issueId || 0) : null,
          metadata ? safeSerializeJson(metadata) : null,
          createdBy ? Number(createdBy || 0) : null,
          normalizedClientRequestId,
        ]
      );
      return Number(result.lastInsertRowid || 0);
    } catch (error) {
      if (normalizedClientRequestId && isUniqueViolationError(error)) {
        const existing = await dbGetAsync(
          `SELECT id
           FROM app_notifications
           WHERE client_request_id = ?
           LIMIT 1`,
          [normalizedClientRequestId]
        );
        if (existing) return Number(existing.id || 0);
      }
      throw error;
    }
  };

  const notifyAdmins = async ({
    title,
    message,
    level = 'info',
    entityType = null,
    entityId = null,
    issueId = null,
    metadata = null,
    createdBy = null,
    clientRequestIdPrefix = null,
  }) => {
    const admins = await dbAllAsync(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC`);
    let createdCount = 0;
    for (const admin of admins || []) {
      const adminId = Number(admin?.id || 0);
      if (!adminId) continue;
      const notificationId = await createAppNotification({
        userId: adminId,
        title,
        message,
        level,
        entityType,
        entityId,
        issueId,
        metadata,
        createdBy,
        clientRequestId: clientRequestIdPrefix ? `${clientRequestIdPrefix}:${adminId}` : null,
      });
      if (Number(notificationId || 0) > 0) createdCount += 1;
    }
    return createdCount;
  };

  return {
    createNotificationEvent,
    updateNotificationEventStatus,
    parseJsonText,
    normalizeNotificationLevel,
    createAppNotification,
    notifyAdmins,
  };
};

module.exports = { createNotificationUtils };
