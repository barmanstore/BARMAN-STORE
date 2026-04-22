const createContactVerificationUtils = (deps = {}) => {
  const { dbGetAsync, dbRunAsync } = deps;

  const normalizeContactVerificationRequestType = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'email' || normalized === 'phone') return normalized;
    return '';
  };

  const getOpenContactVerificationRequest = async ({ userId, requestType }) =>
    dbGetAsync(
      `SELECT *
     FROM contact_verification_requests
     WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'sent')
     ORDER BY id DESC
     LIMIT 1`,
      [Number(userId || 0), normalizeContactVerificationRequestType(requestType)]
    );

  const queueContactVerificationRequest = async ({
    userId,
    requestType,
    requestedBy = null,
    requestedFromIp = null,
  }) => {
    const normalizedType = normalizeContactVerificationRequestType(requestType);
    const normalizedUserId = Number(userId || 0);
    if (!normalizedUserId || !normalizedType) return null;

    const existing = await getOpenContactVerificationRequest({
      userId: normalizedUserId,
      requestType: normalizedType,
    });
    if (existing) {
      await dbRunAsync(
        `UPDATE contact_verification_requests
         SET status = 'pending',
             requested_from_ip = ?,
             requested_by = ?,
             admin_note = NULL,
             prepared_event_id = NULL,
             processed_by = NULL,
             processed_at = NULL,
             completed_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          requestedFromIp ? String(requestedFromIp) : null,
          Number(requestedBy || 0) || null,
          existing.id,
        ]
      );
      return (
        (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [
          existing.id,
        ])) || null
      );
    }

    const result = await dbRunAsync(
      `INSERT INTO contact_verification_requests
       (user_id, request_type, status, requested_from_ip, requested_by, admin_note, prepared_event_id, processed_by, processed_at, completed_at)
       VALUES (?, ?, 'pending', ?, ?, NULL, NULL, NULL, NULL, NULL)`,
      [
        normalizedUserId,
        normalizedType,
        requestedFromIp ? String(requestedFromIp) : null,
        Number(requestedBy || 0) || null,
      ]
    );
    const id = Number(result.lastInsertRowid || 0);
    return id
      ? (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [id])) || null
      : null;
  };

  const markContactVerificationRequestSent = async ({
    id,
    preparedEventId,
    processedBy = null,
    adminNote = null,
  }) => {
    const requestId = Number(id || 0);
    if (!requestId) return null;
    await dbRunAsync(
      `UPDATE contact_verification_requests
       SET status = 'sent',
           prepared_event_id = ?,
           processed_by = ?,
           processed_at = ?,
           admin_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        Number(preparedEventId || 0) || null,
        Number(processedBy || 0) || null,
        new Date().toISOString(),
        adminNote ? String(adminNote) : null,
        requestId,
      ]
    );
    return (
      (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId])) ||
      null
    );
  };

  const rejectContactVerificationRequest = async ({ id, processedBy = null, adminNote = null }) => {
    const requestId = Number(id || 0);
    if (!requestId) return null;
    await dbRunAsync(
      `UPDATE contact_verification_requests
       SET status = 'rejected',
           processed_by = ?,
           processed_at = ?,
           admin_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        Number(processedBy || 0) || null,
        new Date().toISOString(),
        adminNote ? String(adminNote) : null,
        requestId,
      ]
    );
    return (
      (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId])) ||
      null
    );
  };

  const completeContactVerificationRequests = async ({ userId, requestType }) => {
    const normalizedType = normalizeContactVerificationRequestType(requestType);
    const normalizedUserId = Number(userId || 0);
    if (!normalizedUserId || !normalizedType) return;
    await dbRunAsync(
      `UPDATE contact_verification_requests
       SET status = 'completed',
           completed_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'sent')`,
      [new Date().toISOString(), normalizedUserId, normalizedType]
    );
  };

  return {
    normalizeContactVerificationRequestType,
    getOpenContactVerificationRequest,
    queueContactVerificationRequest,
    markContactVerificationRequestSent,
    rejectContactVerificationRequest,
    completeContactVerificationRequests,
  };
};

module.exports = { createContactVerificationUtils };
