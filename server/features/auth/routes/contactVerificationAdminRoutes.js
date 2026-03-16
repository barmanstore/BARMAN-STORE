const registerContactVerificationAdminRoutes = (deps) => {
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

  app.get('/api/admin/contact-verification-requests', requireAdmin, async (req, res) => {
    try {
      const statusFilter = String(req.query?.status || 'open').trim().toLowerCase();
      const allowedStatuses = new Set(['pending', 'sent', 'rejected', 'completed']);
      const params = [];
      let whereClause = '';
      if (statusFilter === 'open') {
        whereClause = `WHERE cvr.status IN ('pending', 'sent')`;
      } else if (statusFilter === 'all') {
        whereClause = '';
      } else if (allowedStatuses.has(statusFilter)) {
        whereClause = `WHERE cvr.status = ?`;
        params.push(statusFilter);
      } else {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
  
      const rows = await dbAllAsync(
        `SELECT cvr.*,
                u.name AS user_name,
                u.email AS user_email,
                u.phone AS user_phone,
                u.email_verified,
                u.phone_verified,
                p.name AS processed_by_name
         FROM contact_verification_requests cvr
         LEFT JOIN users u ON u.id = cvr.user_id
         LEFT JOIN users p ON p.id = cvr.processed_by
         ${whereClause}
         ORDER BY
           CASE cvr.status
             WHEN 'pending' THEN 0
             WHEN 'sent' THEN 1
             WHEN 'rejected' THEN 2
             WHEN 'completed' THEN 3
             ELSE 9
           END,
           cvr.created_at DESC,
           cvr.id DESC`,
        params
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load verification requests' });
    }
  });
  
  app.post('/api/admin/contact-verification-requests/:id/approve-send', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
      if (!requestRow) return res.status(404).json({ error: 'Verification request not found' });
  
      const requestType = normalizeContactVerificationRequestType(requestRow.request_type);
      if (!requestType) return res.status(400).json({ error: 'Unsupported verification request type' });
      if (!['pending', 'sent'].includes(String(requestRow.status || '').toLowerCase())) {
        return res.status(400).json({ error: `Cannot approve request in status "${requestRow.status}"` });
      }
  
      const targetUser = await dbGetAsync(
        `SELECT id, name, email, phone, email_verified, phone_verified
         FROM users
         WHERE id = ?`,
        [requestRow.user_id]
      );
      if (!targetUser) return res.status(404).json({ error: 'User not found for this request' });
  
      const adminId = Number(req.authUser?.id || 0) || null;
  
      if (requestType === 'email') {
        const normalizedEmail = normalizeEmail(targetUser.email);
        if (!normalizedEmail) return res.status(400).json({ error: 'User does not have a valid email' });
        if (Number(targetUser.email_verified || 0) === 1) {
          await completeContactVerificationRequests({ userId: targetUser.id, requestType: 'email' });
          const updated = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
          return res.json({ success: true, message: 'Email is already verified', request: updated });
        }
  
        const delivery = await sendEmailVerificationChallenge({
          userId: targetUser.id,
          email: normalizedEmail,
          recipientName: targetUser.name,
          requestedBy: adminId,
          exposeTemplate: true,
          deliveryModeOverride: 'manual',
        });
        const updated = await markContactVerificationRequestSent({
          id: requestId,
          preparedEventId: delivery?.event_id,
          processedBy: adminId,
          adminNote: 'Approved by admin and verification email prepared',
        });
        return res.status(201).json({
          success: true,
          message: 'Email verification instructions prepared',
          request: updated,
          delivery,
          prepared_email: delivery?.email || null,
        });
      }
  
      const normalizedPhone = normalizePhone(targetUser.phone);
      if (!normalizedPhone) return res.status(400).json({ error: 'User does not have a valid phone number' });
      if (Number(targetUser.phone_verified || 0) === 1) {
        await completeContactVerificationRequests({ userId: targetUser.id, requestType: 'phone' });
        const updated = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
        return res.json({ success: true, message: 'Phone is already verified', request: updated });
      }
  
      const delivery = await sendPhoneVerificationChallenge({
        userId: targetUser.id,
        phone: normalizedPhone,
        recipientName: targetUser.name,
        requestedBy: adminId,
        exposeTemplate: true,
        deliveryModeOverride: 'manual',
      });
      const updated = await markContactVerificationRequestSent({
        id: requestId,
        preparedEventId: delivery?.event_id,
        processedBy: adminId,
        adminNote: 'Approved by admin and verification WhatsApp message prepared',
      });
      return res.status(201).json({
        success: true,
        message: 'Phone verification instructions prepared',
        request: updated,
        delivery,
        prepared_whatsapp: delivery?.whatsapp || null,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to approve verification request' });
    }
  });
  
  app.post('/api/admin/contact-verification-requests/:id/reject', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
      if (!requestRow) return res.status(404).json({ error: 'Verification request not found' });
  
      if (!['pending', 'sent'].includes(String(requestRow.status || '').toLowerCase())) {
        return res.status(400).json({ error: `Cannot reject request in status "${requestRow.status}"` });
      }
  
      const updated = await rejectContactVerificationRequest({
        id: requestId,
        processedBy: Number(req.authUser?.id || 0) || null,
        adminNote: String(req.body?.admin_note || '').trim() || 'Rejected by admin',
      });
      return res.json({ success: true, message: 'Verification request rejected', request: updated });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to reject verification request' });
    }
  });
  
};

module.exports = { registerContactVerificationAdminRoutes };
