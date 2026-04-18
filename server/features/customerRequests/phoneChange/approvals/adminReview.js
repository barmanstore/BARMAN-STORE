const createPhoneChangeAdminReview = (deps = {}) => {
  const { dbGetAsync, dbRunAsync, normalizePhoneChangeRequestStatus, PHONE_CHANGE_STATUS_PENDING } =
    deps;

  const movePhoneChangeRequestToAdminReview = async ({ requestId, conflictUserId = null }) => {
    const id = Number(requestId || 0);
    if (!id) return null;
    const current = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [id]);
    if (!current) return null;
    if (normalizePhoneChangeRequestStatus(current.status, '') !== PHONE_CHANGE_STATUS_PENDING)
      return current;

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
    const updated = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [id]);
    return {
      row: updated,
      notifyAdmins: shouldStampAdminNotification,
    };
  };

  return { movePhoneChangeRequestToAdminReview };
};

module.exports = { createPhoneChangeAdminReview };
