const registerContactVerificationAdminApproveRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    normalizeEmail,
    normalizePhone,
    normalizeContactVerificationRequestType,
    completeContactVerificationRequests,
    sendEmailVerificationChallenge,
    markContactVerificationRequestSent,
    sendPhoneVerificationChallenge,
  } = deps;

  app.post('/api/admin/contact-verification-requests/:id/approve-send', requireAdmin, async (req, res) => {
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
      const requestRow = await dbGetAsync('SELECT * FROM contact_verification_requests WHERE id = ?', [requestId]);
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
          const updated = await dbGetAsync('SELECT * FROM contact_verification_requests WHERE id = ?', [requestId]);
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
        const updated = await dbGetAsync('SELECT * FROM contact_verification_requests WHERE id = ?', [requestId]);
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
};

module.exports = { registerContactVerificationAdminApproveRoutes };
