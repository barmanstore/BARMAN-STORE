const createPhoneChangeApprovals = (deps = {}) => {
  const {
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    dbTxAsync,
    parsePhoneInput,
    normalizePhone,
    normalizePhoneChangeRequestStatus,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_DECISION_ADMIN,
  } = deps;

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

  return {
    getPhoneMergeImpactSummary,
    approvePhoneChangeRequest,
    rejectPhoneChangeRequest,
    movePhoneChangeRequestToAdminReview,
  };
};

module.exports = { createPhoneChangeApprovals };
