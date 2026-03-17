const registerPhoneChangeAdminRejectRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    normalizePhoneChangeRequestStatus,
    rejectPhoneChangeRequest,
    notifyPhoneChangeRejected,
    logAdminAuditAsync,
    serializePhoneChangeRequest,
    PHONE_CHANGE_STATUS_PENDING,
  } = deps;

  app.post('/api/admin/phone-change-requests/:id/reject', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [requestId]);
      if (!requestRow) return res.status(404).json({ error: 'Phone change request not found' });
      if (normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING) {
        return res.status(400).json({ error: `Cannot reject request in status "${requestRow.status}"` });
      }

      const adminNote = String(req.body?.admin_note || '').trim() || null;
      const rejectionReason = String(req.body?.rejection_reason || '').trim() || null;
      const rejected = await rejectPhoneChangeRequest({
        id: requestId,
        reviewedBy: Number(req.authUser?.id || 0) || null,
        adminNote: adminNote || 'Rejected by admin',
        rejectionReason,
      });
      if (!rejected) return res.status(404).json({ error: 'Phone change request not found' });

      const serialized = serializePhoneChangeRequest(rejected);
      await notifyPhoneChangeRejected({
        userId: Number(serialized?.user_id || 0),
        requestId,
        reason: rejectionReason || adminNote,
      });
      await logAdminAuditAsync(req, {
        action: 'phone_change.reject',
        entityType: 'phone_change_request',
        entityId: requestId,
        details: {
          user_id: serialized?.user_id || null,
          new_phone: serialized?.new_phone || null,
          reason: rejectionReason || adminNote || null,
        },
      });
      return res.json({
        success: true,
        message: 'Phone change request rejected',
        request: serialized,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to reject phone change request' });
    }
  });
};

module.exports = { registerPhoneChangeAdminRejectRoutes };
