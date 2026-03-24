const registerUserVerificationAdminRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    normalizeEmail,
    normalizePhone,
    completeContactVerificationRequests,
    createNotificationEvent,
    sanitizeUser,
  } = deps;

  app.post('/api/admin/users/:id/email/verify', requireAdmin, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id || 0);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const normalizedEmail = normalizeEmail(user.email);
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'User does not have an email to verify' });
      }
  
      if (Number(user.email_verified || 0) !== 1) {
        await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE id = ?`, [targetUserId]);
      }
      await dbRunAsync(
        `UPDATE email_verification_tokens
         SET used = 1
         WHERE user_id = ? AND email = ? AND used = 0`,
        [targetUserId, normalizedEmail]
      );
      await completeContactVerificationRequests({ userId: targetUserId, requestType: 'email' });
      await createNotificationEvent({
        type: 'email_verification_admin_override',
        channel: 'admin_action',
        recipient: normalizedEmail,
        recipientUserId: targetUserId,
        subject: 'Email verified by admin',
        body: `Admin #${Number(req.authUser?.id || 0)} manually marked email as verified.`,
        metadata: {
          action: 'mark_email_verified',
        },
        status: 'sent',
        preparedBy: Number(req.authUser?.id || 0) || null,
        sentBy: Number(req.authUser?.id || 0) || null,
      });
      const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]));
      return res.json({ success: true, user: updated, message: 'Email marked as verified by admin' });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to verify email' });
    }
  });
  
  app.post('/api/admin/users/:id/phone/verify', requireAdmin, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id || 0);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const normalizedPhone = normalizePhone(user.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'User does not have a phone to verify' });
      }
      if (Number(user.phone_verified || 0) !== 1) {
        await dbRunAsync(`UPDATE users SET phone_verified = 1 WHERE id = ?`, [targetUserId]);
      }
      await dbRunAsync(
        `UPDATE phone_verification_tokens
         SET used = 1
         WHERE user_id = ? AND phone = ? AND used = 0`,
        [targetUserId, normalizedPhone]
      );
      await completeContactVerificationRequests({ userId: targetUserId, requestType: 'phone' });
      await createNotificationEvent({
        type: 'phone_verification_admin_override',
        channel: 'admin_action',
        recipient: normalizedPhone,
        recipientUserId: targetUserId,
        subject: 'Phone verified by admin',
        body: `Admin #${Number(req.authUser?.id || 0)} manually marked phone as verified.`,
        metadata: {
          action: 'mark_phone_verified',
        },
        status: 'sent',
        preparedBy: Number(req.authUser?.id || 0) || null,
        sentBy: Number(req.authUser?.id || 0) || null,
      });
      const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]));
      return res.json({ success: true, user: updated, message: 'Phone marked as verified by admin' });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to verify phone' });
    }
  });

  app.get('/api/admin/password-reset-requests', requireAdmin, async (_, res) =>
    res.status(410).json({ error: 'Password-based authentication is disabled. Use OTP or OAuth login.' })
  );
  app.put('/api/admin/password-reset-requests/:id', requireAdmin, async (_, res) =>
    res.status(410).json({ error: 'Password-based authentication is disabled. Use OTP or OAuth login.' })
  );
};

module.exports = { registerUserVerificationAdminRoutes };
