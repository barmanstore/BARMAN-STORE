const createPhoneChangeReject = (deps = {}) => {
  const {
    dbGetAsync,
    dbRunAsync,
    normalizePhoneChangeRequestStatus,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_REJECTED,
  } = deps;

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
    const updated = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [
      requestId,
    ]);
    if (!updated) return null;
    if (normalizePhoneChangeRequestStatus(updated.status, '') !== PHONE_CHANGE_STATUS_REJECTED)
      return null;
    return updated;
  };

  return { rejectPhoneChangeRequest };
};

module.exports = { createPhoneChangeReject };
