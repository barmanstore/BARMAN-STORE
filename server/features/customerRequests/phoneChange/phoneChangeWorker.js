const createPhoneChangeWorker = (deps = {}) => {
  const {
    dbAllAsync,
    dbGetAsync,
    parsePhoneInput,
    approvePhoneChangeRequest,
    rejectPhoneChangeRequest,
    movePhoneChangeRequestToAdminReview,
    notifyPhoneChangeAdminReview,
    notifyPhoneChangeApproved,
    notifyPhoneChangeRejected,
    notifyAdminsPhoneChangeReview,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_AUTO_BATCH_SIZE,
    PHONE_CHANGE_PROCESS_INTERVAL_MS,
    PHONE_CHANGE_EXPIRED_REASON,
    IS_VERCEL_RUNTIME,
  } = deps;

  let phoneChangeWorkerTimer = null;
  let phoneChangeWorkerRunning = false;

  const processPendingPhoneChangeRequests = async ({ limit = PHONE_CHANGE_AUTO_BATCH_SIZE } = {}) => {
    if (phoneChangeWorkerRunning) return null;
    phoneChangeWorkerRunning = true;
    const stats = {
      auto_approved: 0,
      escalated_admin_review: 0,
      auto_rejected_invalid: 0,
      auto_rejected_missing_user: 0,
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
          const message = String(error?.message || '');
          if (error?.status === 404 || message.includes('User not found for this phone change request')) {
            const rejected = await rejectPhoneChangeRequest({
              id: requestId,
              reviewedBy: null,
              adminNote: 'Auto-rejected: user not found',
              rejectionReason: 'User not found for this phone change request',
            });
            if (rejected) {
              stats.auto_rejected_missing_user += 1;
            }
            continue;
          }
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
    processPendingPhoneChangeRequests,
    startPhoneChangeWorker,
    stopPhoneChangeWorker,
  };
};

module.exports = { createPhoneChangeWorker };
