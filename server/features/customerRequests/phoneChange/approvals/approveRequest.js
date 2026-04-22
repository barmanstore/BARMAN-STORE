const createPhoneChangeApprove = (deps = {}) => {
  const {
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    parsePhoneInput,
    normalizePhone,
    normalizePhoneChangeRequestStatus,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_DECISION_ADMIN,
    getPhoneMergeImpactSummary,
    movePhoneLinkedIdentityRecords,
  } = deps;

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
    const source =
      String(decisionSource || '')
        .trim()
        .toUpperCase() === PHONE_CHANGE_DECISION_AUTO
        ? PHONE_CHANGE_DECISION_AUTO
        : PHONE_CHANGE_DECISION_ADMIN;

    return dbTxAsync(async () => {
      const requestRow = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [
        requestId,
      ]);
      if (!requestRow) return null;
      if (
        normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING
      ) {
        const err = new Error(`Cannot approve request in status "${requestRow.status}"`);
        err.status = 400;
        throw err;
      }

      const owner = await dbGetAsync('SELECT id, phone FROM users WHERE id = ?', [
        requestRow.user_id,
      ]);
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
      if (
        source === PHONE_CHANGE_DECISION_ADMIN &&
        conflictUserId &&
        !allowConflictMerge
      ) {
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

      const updatedRequest = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [
        requestId,
      ]);
      const updatedUser = await dbGetAsync('SELECT * FROM users WHERE id = ?', [owner.id]);
      return {
        request: updatedRequest,
        user: updatedUser,
        conflict_user_id: conflictUserId,
        merge_impact: mergeImpact,
        merge_identity_applied: Boolean(conflictUserId && allowConflictMerge),
      };
    });
  };

  return { approvePhoneChangeRequest };
};

module.exports = { createPhoneChangeApprove };
