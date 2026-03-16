const createPhoneChangeService = (deps = {}) => {
  const {
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    dbTxAsync,
    parsePhoneInput,
    normalizePhone,
    createAppNotification,
    notifyAdmins,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_DECISION_ADMIN,
    PHONE_CHANGE_AUTO_APPROVE_DELAY_MS,
    PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS,
    PHONE_CHANGE_AUTO_BATCH_SIZE,
    PHONE_CHANGE_PROCESS_INTERVAL_MS,
    PHONE_CHANGE_EXPIRED_REASON,
    IS_VERCEL_RUNTIME,
  } = deps;

  let phoneChangeWorkerTimer = null;
  let phoneChangeWorkerRunning = false;

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

  const getPhoneMergeImpactSummary = async (sourceUserId) => {
    const id = Number(sourceUserId || 0);
    if (!id) return null;
    const [
      creditHistoryRow,
      creditIssueRow,
      billsRow,
      ordersRow,
      recommendationsRow,
    ] = await Promise.all([
      dbGetAsync(`SELECT COUNT(*) AS count FROM credit_history WHERE user_id = ?`, [id]),
      dbGetAsync(`SELECT COUNT(*) AS count FROM credit_entry_issues WHERE user_id = ?`, [id]),
      dbGetAsync(`SELECT COUNT(*) AS count FROM bills WHERE customer_id = ?`, [id]),
      dbGetAsync(`SELECT COUNT(*) AS count FROM orders WHERE user_id = ?`, [id]),
      dbGetAsync(`SELECT COUNT(*) AS count FROM product_recommendations WHERE user_id = ?`, [id]),
    ]);
    const summary = {
      credit_history: Number(creditHistoryRow?.count || 0),
      credit_entry_issues: Number(creditIssueRow?.count || 0),
      bills: Number(billsRow?.count || 0),
      orders: Number(ordersRow?.count || 0),
      product_recommendations: Number(recommendationsRow?.count || 0),
    };
    return {
      source_user_id: id,
      ...summary,
      total_records: Object.values(summary).reduce((total, value) => total + Number(value || 0), 0),
    };
  };

  const movePhoneLinkedIdentityRecords = async ({ fromUserId, toUserId }) => {
    const sourceId = Number(fromUserId || 0);
    const targetId = Number(toUserId || 0);
    if (!sourceId || !targetId || sourceId === targetId) return;
    await dbRunAsync(`UPDATE credit_history SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
    await dbRunAsync(`UPDATE credit_entry_issues SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
    await dbRunAsync(`UPDATE bills SET customer_id = ? WHERE customer_id = ?`, [targetId, sourceId]);
    await dbRunAsync(`UPDATE orders SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
    await dbRunAsync(`UPDATE product_recommendations SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
  };

  const approvePhoneChangeRequest = async ({
    id,
    reviewedBy = null,
    decisionSource = PHONE_CHANGE_DECISION_ADMIN,
    adminNote = null,
    allowConflictMerge = false,
  }) => {
    const requestId = Number(id || 0);
    if (!requestId) return null;
    const reviewedById = Number(reviewedBy || 0) || null;
    const source = String(decisionSource || '').trim().toUpperCase() === PHONE_CHANGE_DECISION_AUTO
      ? PHONE_CHANGE_DECISION_AUTO
      : PHONE_CHANGE_DECISION_ADMIN;

    return dbTxAsync(async () => {
      const requestRow = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
      if (!requestRow) return null;
      if (normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING) {
        const err = new Error(`Cannot approve request in status "${requestRow.status}"`);
        err.status = 400;
        throw err;
      }

      const owner = await dbGetAsync(`SELECT id, phone FROM users WHERE id = ?`, [requestRow.user_id]);
      if (!owner) {
        const err = new Error('User not found for this phone change request');
        err.status = 404;
        throw err;
      }

      const newPhoneParsed = parsePhoneInput(requestRow.new_phone, { required: true });
      if (newPhoneParsed.error) {
        const err = new Error(newPhoneParsed.error);
        err.status = 400;
        throw err;
      }
      const newPhone = newPhoneParsed.value;
      const currentOwnerPhone = normalizePhone(owner.phone);
      const conflictUser = await dbGetAsync(
        `SELECT id
         FROM users
         WHERE phone = ? AND id <> ?
         LIMIT 1`,
        [newPhone, owner.id]
      );

      if (source === PHONE_CHANGE_DECISION_AUTO && conflictUser) {
        const err = new Error('Conflict detected, requires admin review');
        err.status = 409;
        throw err;
      }

      const conflictUserId = Number(conflictUser?.id || 0) || null;
      let mergeImpact = null;
      if (conflictUserId) {
        mergeImpact = await getPhoneMergeImpactSummary(conflictUserId);
      }
      if (source === PHONE_CHANGE_DECISION_ADMIN && conflictUserId && !Boolean(allowConflictMerge)) {
        const err = new Error('Conflict detected. Confirm identity merge to approve this request.');
        err.status = 409;
        err.code = 'PHONE_CONFLICT_REQUIRES_MERGE';
        err.details = {
          requires_merge_confirmation: true,
          conflict_user_id: conflictUserId,
          merge_impact: mergeImpact,
        };
        throw err;
      }
      if (conflictUserId) {
        await movePhoneLinkedIdentityRecords({ fromUserId: conflictUserId, toUserId: owner.id });
        await dbRunAsync(
          `UPDATE users
           SET phone = NULL,
               phone_verified = 0
           WHERE id = ?`,
          [conflictUserId]
        );
      }

      if (currentOwnerPhone !== newPhone) {
        await dbRunAsync(
          `UPDATE users
           SET phone = ?, phone_verified = 0
           WHERE id = ?`,
          [newPhone, owner.id]
        );
      }

      await dbRunAsync(
        `UPDATE phone_change_requests
         SET status = ?,
             needs_admin_review = 0,
             conflict_user_id = ?,
             decision_source = ?,
             admin_note = ?,
             rejection_reason = NULL,
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          PHONE_CHANGE_STATUS_APPROVED,
          conflictUserId,
          source,
          adminNote ? String(adminNote).trim() : null,
          reviewedById,
          requestId,
        ]
      );

      const updatedRequest = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
      const updatedUser = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [owner.id]);
      return {
        request: updatedRequest,
        user: updatedUser,
        conflict_user_id: conflictUserId,
        merge_impact: mergeImpact,
        merge_identity_applied: Boolean(conflictUserId && allowConflictMerge),
      };
    });
  };

  const rejectPhoneChangeRequest = async ({
    id,
    reviewedBy = null,
    adminNote = null,
    rejectionReason = null,
  }) => {
    const requestId = Number(id || 0);
    if (!requestId) return null;
    await dbRunAsync(
      `UPDATE phone_change_requests
       SET status = ?,
           admin_note = ?,
           rejection_reason = ?,
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ?`,
      [
        PHONE_CHANGE_STATUS_REJECTED,
        adminNote ? String(adminNote).trim() : null,
        rejectionReason ? String(rejectionReason).trim() : null,
        Number(reviewedBy || 0) || null,
        requestId,
        PHONE_CHANGE_STATUS_PENDING,
      ]
    );
    const updated = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
    if (!updated) return null;
    if (normalizePhoneChangeRequestStatus(updated.status, '') !== PHONE_CHANGE_STATUS_REJECTED) return null;
    return updated;
  };

  const movePhoneChangeRequestToAdminReview = async ({ requestId, conflictUserId = null }) => {
    const id = Number(requestId || 0);
    if (!id) return null;
    const current = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [id]);
    if (!current) return null;
    if (normalizePhoneChangeRequestStatus(current.status, '') !== PHONE_CHANGE_STATUS_PENDING) return current;

    const shouldStampAdminNotification = !current.admin_notified_at;
    await dbRunAsync(
      `UPDATE phone_change_requests
       SET needs_admin_review = 1,
           conflict_user_id = ?,
           admin_notified_at = CASE WHEN admin_notified_at IS NULL THEN CURRENT_TIMESTAMP ELSE admin_notified_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [Number(conflictUserId || 0) || null, id]
    );
    const updated = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [id]);
    return {
      row: updated,
      notifyAdmins: shouldStampAdminNotification,
    };
  };

  const notifyPhoneChangeSubmitted = async ({ userId }) => {
    await createAppNotification({
      userId,
      title: 'Phone update request received',
      message: 'Phone update is pending. You will be notified once it is updated.',
      level: 'info',
      entityType: 'phone_change_request',
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_PENDING,
      },
      createdBy: Number(userId || 0) || null,
    });
  };

  const notifyPhoneChangeAdminReview = async ({ userId, requestId }) => {
    await createAppNotification({
      userId,
      title: 'Phone update under admin review',
      message: 'Phone update is pending. You will be notified once it is updated.',
      level: 'warning',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_PENDING,
        needs_admin_review: true,
      },
      createdBy: null,
    });
  };

  const notifyPhoneChangeApproved = async ({ userId, requestId, newPhone, decisionSource }) => {
    await createAppNotification({
      userId,
      title: 'Phone update approved',
      message: `Your phone number has been updated to ${newPhone}.`,
      level: 'success',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_APPROVED,
        decision_source: decisionSource,
      },
      createdBy: null,
    });
  };

  const notifyPhoneChangeRejected = async ({ userId, requestId, reason }) => {
    await createAppNotification({
      userId,
      title: 'Phone update rejected',
      message: reason
        ? `Your phone update request was rejected: ${reason}`
        : 'Your phone update request was rejected. Please contact support.',
      level: 'error',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_REJECTED,
      },
      createdBy: null,
    });
  };

  const notifyAdminsPhoneChangeReview = async ({ requestId, userName, newPhone }) => {
    await notifyAdmins({
      title: 'Phone update needs review',
      message: `${userName || 'Customer'} requested phone ${newPhone}. Review pending request #${requestId}.`,
      level: 'warning',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: {
        route: '/admin?tab=customer-requests',
        request_id: requestId,
      },
      createdBy: null,
    });
  };

  const processPendingPhoneChangeRequests = async ({ limit = PHONE_CHANGE_AUTO_BATCH_SIZE } = {}) => {
    if (phoneChangeWorkerRunning) return null;
    phoneChangeWorkerRunning = true;
    const stats = {
      auto_approved: 0,
      escalated_admin_review: 0,
      auto_rejected_invalid: 0,
      expired_rejected: 0,
      scanned_auto_candidates: 0,
      scanned_overdue_candidates: 0,
    };
    try {
      const numericLimit = Number(limit || PHONE_CHANGE_AUTO_BATCH_SIZE);
      const rows = await dbAllAsync(
        `SELECT *
         FROM phone_change_requests
         WHERE status = ?
           AND COALESCE(needs_admin_review, 0) = 0
           AND auto_check_at IS NOT NULL
           AND auto_check_at <= CURRENT_TIMESTAMP
         ORDER BY auto_check_at ASC, id ASC
         LIMIT ?`,
        [PHONE_CHANGE_STATUS_PENDING, numericLimit]
      );
      stats.scanned_auto_candidates = Array.isArray(rows) ? rows.length : 0;
      for (const row of rows || []) {
        const requestId = Number(row?.id || 0);
        const userId = Number(row?.user_id || 0);
        if (!requestId || !userId) continue;
        try {
          const parsedPhone = parsePhoneInput(row.new_phone, { required: true });
          if (parsedPhone.error) {
            const rejected = await rejectPhoneChangeRequest({
              id: requestId,
              reviewedBy: null,
              adminNote: 'Auto validation failed',
              rejectionReason: parsedPhone.error,
            });
            if (rejected) {
              stats.auto_rejected_invalid += 1;
              await notifyPhoneChangeRejected({
                userId,
                requestId,
                reason: parsedPhone.error,
              });
            }
            continue;
          }
          const conflict = await dbGetAsync(
            `SELECT id
             FROM users
             WHERE phone = ? AND id <> ?
             LIMIT 1`,
            [parsedPhone.value, userId]
          );
          if (conflict) {
            const escalated = await movePhoneChangeRequestToAdminReview({
              requestId,
              conflictUserId: conflict.id,
            });
            if (escalated?.notifyAdmins) {
              stats.escalated_admin_review += 1;
              const owner = await dbGetAsync(`SELECT id, name FROM users WHERE id = ?`, [userId]);
              await notifyAdminsPhoneChangeReview({
                requestId,
                userName: owner?.name || `User #${userId}`,
                newPhone: parsedPhone.value,
              });
              await notifyPhoneChangeAdminReview({
                userId,
                requestId,
              });
            }
            continue;
          }

          const approved = await approvePhoneChangeRequest({
            id: requestId,
            reviewedBy: null,
            decisionSource: PHONE_CHANGE_DECISION_AUTO,
            adminNote: 'Auto-approved after uniqueness validation window',
          });
          if (approved?.request) {
            stats.auto_approved += 1;
            await notifyPhoneChangeApproved({
              userId,
              requestId,
              newPhone: parsedPhone.value,
              decisionSource: PHONE_CHANGE_DECISION_AUTO,
            });
          }
        } catch (error) {
          console.warn('[PHONE_CHANGE] Failed processing request:', error?.message || error);
        }
      }
      const overdueRows = await dbAllAsync(
        `SELECT *
         FROM phone_change_requests
         WHERE status = ?
           AND COALESCE(needs_admin_review, 0) = 1
           AND final_due_at IS NOT NULL
           AND final_due_at <= CURRENT_TIMESTAMP
         ORDER BY final_due_at ASC, id ASC
         LIMIT ?`,
        [PHONE_CHANGE_STATUS_PENDING, numericLimit]
      );
      stats.scanned_overdue_candidates = Array.isArray(overdueRows) ? overdueRows.length : 0;
      for (const row of overdueRows || []) {
        const requestId = Number(row?.id || 0);
        const userId = Number(row?.user_id || 0);
        if (!requestId || !userId) continue;
        try {
          const rejected = await rejectPhoneChangeRequest({
            id: requestId,
            reviewedBy: null,
            adminNote: 'Auto-closed after review window expired',
            rejectionReason: PHONE_CHANGE_EXPIRED_REASON,
          });
          if (!rejected) continue;
          stats.expired_rejected += 1;
          await notifyPhoneChangeRejected({
            userId,
            requestId,
            reason: PHONE_CHANGE_EXPIRED_REASON,
          });
        } catch (error) {
          console.warn('[PHONE_CHANGE] Failed expiring request:', error?.message || error);
        }
      }
      return stats;
    } finally {
      phoneChangeWorkerRunning = false;
    }
  };

  const startPhoneChangeWorker = () => {
    if (IS_VERCEL_RUNTIME) return;
    if (phoneChangeWorkerTimer) return;
    phoneChangeWorkerTimer = setInterval(() => {
      void processPendingPhoneChangeRequests().catch((error) => {
        console.warn('[PHONE_CHANGE] Background worker failed:', error?.message || error);
      });
    }, PHONE_CHANGE_PROCESS_INTERVAL_MS);
    void processPendingPhoneChangeRequests().catch(() => {});
  };

  const stopPhoneChangeWorker = () => {
    if (!phoneChangeWorkerTimer) return;
    clearInterval(phoneChangeWorkerTimer);
    phoneChangeWorkerTimer = null;
  };

  return {
    normalizePhoneChangeRequestStatus,
    serializePhoneChangeRequest,
    getOpenPhoneChangeRequestForUser,
    getLatestPhoneChangeRequestForUser,
    queuePhoneChangeRequest,
    getPhoneMergeImpactSummary,
    approvePhoneChangeRequest,
    rejectPhoneChangeRequest,
    processPendingPhoneChangeRequests,
    startPhoneChangeWorker,
    stopPhoneChangeWorker,
    notifyPhoneChangeSubmitted,
    notifyPhoneChangeAdminReview,
    notifyPhoneChangeApproved,
    notifyPhoneChangeRejected,
  };
};

module.exports = { createPhoneChangeService };
