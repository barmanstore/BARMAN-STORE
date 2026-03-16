const createPhoneChangeQueue = (deps = {}) => {
  const {
    dbGetAsync,
    dbRunAsync,
    parsePhoneInput,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_AUTO_APPROVE_DELAY_MS,
    PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS,
  } = deps;

  const normalizePhoneChangeRequestStatus = (value, fallback = PHONE_CHANGE_STATUS_PENDING) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (
      normalized === PHONE_CHANGE_STATUS_PENDING
      || normalized === PHONE_CHANGE_STATUS_APPROVED
      || normalized === PHONE_CHANGE_STATUS_REJECTED
    ) return normalized;
    return fallback;
  };

  const serializePhoneChangeRequest = (row) => {
    if (!row) return null;
    return {
      id: Number(row.id || 0),
      user_id: Number(row.user_id || 0),
      old_phone: row.old_phone || null,
      new_phone: row.new_phone || null,
      status: normalizePhoneChangeRequestStatus(row.status),
      needs_admin_review: Number(row.needs_admin_review || 0) === 1,
      conflict_user_id: Number(row.conflict_user_id || 0) || null,
      requested_by: Number(row.requested_by || 0) || null,
      requested_from_ip: row.requested_from_ip || null,
      auto_check_at: row.auto_check_at || null,
      final_due_at: row.final_due_at || null,
      admin_notified_at: row.admin_notified_at || null,
      decision_source: row.decision_source || null,
      admin_note: row.admin_note || null,
      rejection_reason: row.rejection_reason || null,
      reviewed_by: Number(row.reviewed_by || 0) || null,
      reviewed_at: row.reviewed_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  };

  const getOpenPhoneChangeRequestForUser = async (userId) => dbGetAsync(
    `SELECT *
     FROM phone_change_requests
     WHERE user_id = ? AND status = ?
     ORDER BY id DESC
     LIMIT 1`,
    [Number(userId || 0), PHONE_CHANGE_STATUS_PENDING]
  );

  const getLatestPhoneChangeRequestForUser = async (userId) => dbGetAsync(
    `SELECT *
     FROM phone_change_requests
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [Number(userId || 0)]
  );

  const queuePhoneChangeRequest = async ({
    userId,
    oldPhone = null,
    newPhone,
    requestedBy = null,
    requestedFromIp = null,
  }) => {
    const normalizedUserId = Number(userId || 0);
    const parsedOldPhone = parsePhoneInput(oldPhone);
    const parsedNewPhone = parsePhoneInput(newPhone, { required: true });
    if (!normalizedUserId || parsedNewPhone.error) return null;

    const oldPhoneValue = parsedOldPhone.value || null;
    const newPhoneValue = parsedNewPhone.value;
    const now = Date.now();
    const autoCheckAt = new Date(now + PHONE_CHANGE_AUTO_APPROVE_DELAY_MS).toISOString();
    const finalDueAt = new Date(
      now + (PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    ).toISOString();
    const existing = await getOpenPhoneChangeRequestForUser(normalizedUserId);
    if (existing) {
      await dbRunAsync(
        `UPDATE phone_change_requests
         SET old_phone = ?,
             new_phone = ?,
             status = ?,
             requested_by = ?,
             requested_from_ip = ?,
             needs_admin_review = 0,
             conflict_user_id = NULL,
             auto_check_at = ?,
             final_due_at = ?,
             admin_notified_at = NULL,
             decision_source = NULL,
             admin_note = NULL,
             rejection_reason = NULL,
             reviewed_by = NULL,
             reviewed_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          oldPhoneValue,
          newPhoneValue,
          PHONE_CHANGE_STATUS_PENDING,
          Number(requestedBy || 0) || null,
          requestedFromIp ? String(requestedFromIp) : null,
          autoCheckAt,
          finalDueAt,
          existing.id,
        ]
      );
      return (await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [existing.id])) || null;
    }

    const inserted = await dbRunAsync(
      `INSERT INTO phone_change_requests
       (user_id, old_phone, new_phone, status, requested_by, requested_from_ip, needs_admin_review, conflict_user_id, auto_check_at, final_due_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      [
        normalizedUserId,
        oldPhoneValue,
        newPhoneValue,
        PHONE_CHANGE_STATUS_PENDING,
        Number(requestedBy || 0) || null,
        requestedFromIp ? String(requestedFromIp) : null,
        autoCheckAt,
        finalDueAt,
      ]
    );
    const insertedId = Number(inserted.lastInsertRowid || 0);
    return insertedId
      ? (await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [insertedId])) || null
      : null;
  };

  return {
    normalizePhoneChangeRequestStatus,
    serializePhoneChangeRequest,
    getOpenPhoneChangeRequestForUser,
    getLatestPhoneChangeRequestForUser,
    queuePhoneChangeRequest,
  };
};

module.exports = { createPhoneChangeQueue };
