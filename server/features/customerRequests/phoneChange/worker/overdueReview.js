const processOverdueReviewRequests = async ({
  dbAllAsync,
  rejectPhoneChangeRequest,
  notifyPhoneChangeRejected,
  PHONE_CHANGE_STATUS_PENDING,
  PHONE_CHANGE_EXPIRED_REASON,
  PHONE_CHANGE_AUTO_BATCH_SIZE,
} = {}) => {
  const stats = {
    expired_rejected: 0,
    scanned_overdue_candidates: 0,
  };
  const numericLimit = Number(PHONE_CHANGE_AUTO_BATCH_SIZE || 0);
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
};

module.exports = { processOverdueReviewRequests };
