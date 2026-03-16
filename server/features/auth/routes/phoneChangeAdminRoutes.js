const registerPhoneChangeAdminRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    normalizeEmail,
    parsePhoneInput,
    normalizePhone,
    parseBooleanEnv,
    runCustomerRequestPurge,
    processPendingPhoneChangeRequests,
    getPhoneMergeImpactSummary,
    serializePhoneChangeRequest,
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    normalizePhoneChangeRequestStatus,
    approvePhoneChangeRequest,
    PHONE_CHANGE_DECISION_ADMIN,
    notifyPhoneChangeApproved,
    notifyPhoneChangeSubmitted,
    logAdminAuditAsync,
    rejectPhoneChangeRequest,
    notifyPhoneChangeRejected,
    normalizeContactVerificationRequestType,
    completeContactVerificationRequests,
    sendEmailVerificationChallenge,
    markContactVerificationRequestSent,
    sendPhoneVerificationChallenge,
    rejectContactVerificationRequest,
    createNotificationEvent,
    sanitizeUser,
    generateTemporaryPassword,
    hashPassword,
    queuePhoneChangeRequest,
    getRequestIp,
    parseDataUrlImage,
    PROFILE_IMAGE_ALLOWED_MIME,
    PROFILE_IMAGE_MAX_BYTES,
    mimeToExt,
    buildProfileImagePath,
    deleteManagedProfileImage,
    PROFILE_UPLOAD_DIR,
    crypto,
    path,
    fs,
    validateCustomerProfile,
  } = deps;

  app.get('/api/admin/phone-change-requests', requireAdmin, async (req, res) => {
    try {
      await runCustomerRequestPurge();
      await processPendingPhoneChangeRequests();
      const statusFilter = String(req.query?.status || 'open').trim().toLowerCase();
      const params = [];
      let whereClause = '';
      if (statusFilter === 'open') {
        whereClause = `WHERE pcr.status = ? AND COALESCE(pcr.needs_admin_review, 0) = 1`;
        params.push(PHONE_CHANGE_STATUS_PENDING);
      } else if (statusFilter === 'pending_validation') {
        whereClause = `WHERE pcr.status = ?`;
        params.push(PHONE_CHANGE_STATUS_PENDING);
      } else if (statusFilter === 'approved') {
        whereClause = `WHERE pcr.status = ?`;
        params.push(PHONE_CHANGE_STATUS_APPROVED);
      } else if (statusFilter === 'rejected') {
        whereClause = `WHERE pcr.status = ?`;
        params.push(PHONE_CHANGE_STATUS_REJECTED);
      } else if (statusFilter !== 'all') {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
  
      const rows = await dbAllAsync(
        `SELECT pcr.*,
                u.name AS user_name,
                u.email AS user_email,
                u.phone AS user_phone,
                cu.name AS conflict_user_name,
                cu.email AS conflict_user_email,
                r.name AS reviewed_by_name
         FROM phone_change_requests pcr
         LEFT JOIN users u ON u.id = pcr.user_id
         LEFT JOIN users cu ON cu.id = pcr.conflict_user_id
         LEFT JOIN users r ON r.id = pcr.reviewed_by
         ${whereClause}
         ORDER BY
           CASE pcr.status
             WHEN '${PHONE_CHANGE_STATUS_PENDING}' THEN 0
             WHEN '${PHONE_CHANGE_STATUS_APPROVED}' THEN 1
             WHEN '${PHONE_CHANGE_STATUS_REJECTED}' THEN 2
             ELSE 9
           END,
           COALESCE(pcr.needs_admin_review, 0) DESC,
           pcr.created_at DESC,
           pcr.id DESC`,
        params
      );
      const payload = await Promise.all((rows || []).map(async (row) => {
        const conflictUserId = Number(row?.conflict_user_id || 0) || null;
        const mergeImpact = conflictUserId ? await getPhoneMergeImpactSummary(conflictUserId) : null;
        return {
          ...serializePhoneChangeRequest(row),
          user_name: row.user_name || null,
          user_email: row.user_email || null,
          user_phone: row.user_phone || null,
          conflict_user_name: row.conflict_user_name || null,
          conflict_user_email: row.conflict_user_email || null,
          reviewed_by_name: row.reviewed_by_name || null,
          merge_impact: mergeImpact,
        };
      }));
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load phone change requests' });
    }
  });
  
  app.post('/api/admin/phone-change-requests/:id/approve', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
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
  
  app.post('/api/admin/phone-change-requests/:id/reject', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
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

module.exports = { registerPhoneChangeAdminRoutes };
