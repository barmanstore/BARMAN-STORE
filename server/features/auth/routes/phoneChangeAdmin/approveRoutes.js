const registerPhoneChangeAdminApproveRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    parseBooleanEnv,
    normalizePhoneChangeRequestStatus,
    approvePhoneChangeRequest,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_DECISION_ADMIN,
    notifyPhoneChangeApproved,
    logAdminAuditAsync,
    serializePhoneChangeRequest,
    sanitizeUser,
  } = deps;

  app.post('/api/admin/phone-change-requests/:id/approve', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync('SELECT * FROM phone_change_requests WHERE id = ?', [requestId]);
      if (!requestRow) return res.status(404).json({ error: 'Phone change request not found' });
      if (normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING) {
        return res.status(400).json({ error: `Cannot approve request in status "${requestRow.status}"` });
      }

      const adminId = Number(req.authUser?.id || 0) || null;
      const adminNote = String(req.body?.admin_note || '').trim() || null;
      const mergeIdentity = parseBooleanEnv(req.body?.merge_identity, false);
      const approved = await approvePhoneChangeRequest({
        id: requestId,
        reviewedBy: adminId,
        decisionSource: PHONE_CHANGE_DECISION_ADMIN,
        adminNote: adminNote || 'Approved by admin',
        allowConflictMerge: mergeIdentity,
      });
      if (!approved?.request) {
        return res.status(404).json({ error: 'Phone change request not found' });
      }
      const serialized = serializePhoneChangeRequest(approved.request);
      await notifyPhoneChangeApproved({
        userId: Number(serialized?.user_id || 0),
        requestId,
        newPhone: serialized?.new_phone || '',
        decisionSource: PHONE_CHANGE_DECISION_ADMIN,
      });
      await logAdminAuditAsync(req, {
        action: 'phone_change.approve',
        entityType: 'phone_change_request',
        entityId: requestId,
        details: {
          user_id: serialized?.user_id || null,
          new_phone: serialized?.new_phone || null,
          conflict_user_id: approved?.conflict_user_id || null,
          merge_identity_applied: Boolean(approved?.merge_identity_applied),
          merge_impact: approved?.merge_impact || null,
        },
      });
      return res.json({
        success: true,
        message: 'Phone change request approved',
        request: serialized,
        user: sanitizeUser(approved.user),
        merge_identity_applied: Boolean(approved?.merge_identity_applied),
        merge_impact: approved?.merge_impact || null,
      });
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      return res.status(status).json({
        error: error.message || 'Failed to approve phone change request',
        code: error?.code || null,
        ...(error?.details && typeof error.details === 'object' ? error.details : {}),
      });
    }
  });
};

module.exports = { registerPhoneChangeAdminApproveRoutes };
