const registerUserCrudRoutes = (deps) => {
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

  app.get('/api/users', requireAdmin, async (_, res) => {
    try {
      const users = (await dbAllAsync(`SELECT * FROM users ORDER BY created_at DESC`)).map(sanitizeUser);
      return res.json(users);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/users/:id', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/users', requireAdmin, async (req, res) => {
    try {
      const { name, email, phone, address, role } = req.body || {};
      const normalizedEmail = normalizeEmail(email);
      const phoneParsed = parsePhoneInput(phone);
      if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
      const normalizedPhone = phoneParsed.value;
      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
      }
      if (!normalizedEmail && !normalizedPhone) {
        return res.status(400).json({ error: 'Email or phone number is required' });
      }
      if (normalizedEmail && await dbGetAsync(`SELECT id FROM users WHERE email = ?`, [normalizedEmail])) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (normalizedPhone && await dbGetAsync(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone])) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
      const userRole = role === 'admin' ? 'admin' : 'customer';
      const nextPassword = generateTemporaryPassword();
      const requestedEmailVerified = Number(req.body?.email_verified || 0) === 1;
      const requestedPhoneVerified = Number(req.body?.phone_verified || 0) === 1;
      const emailVerifiedValue = normalizedEmail ? (requestedEmailVerified ? 1 : 0) : 0;
      const phoneVerifiedValue = normalizedPhone ? (requestedPhoneVerified ? 1 : 0) : 0;
      const result = await dbRunAsync(
        `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userRole, String(name).trim(), normalizedEmail, emailVerifiedValue, normalizedPhone, phoneVerifiedValue, address || null, hashPassword(nextPassword), 0]
      );
      const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]));
      if (normalizedEmail && emailVerifiedValue === 0) {
        sendEmailVerificationChallenge({
          userId: user.id,
          email: normalizedEmail,
          recipientName: user.name,
          requestedBy: Number(req.authUser?.id || 0) || null,
        }).catch(() => {});
      }
      if (normalizedPhone && phoneVerifiedValue === 0) {
        sendPhoneVerificationChallenge({
          userId: user.id,
          phone: normalizedPhone,
          recipientName: user.name,
          requestedBy: Number(req.authUser?.id || 0) || null,
        }).catch(() => {});
      }
      return res.status(201).json({ success: true, user, message: 'User created successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.put('/api/users/:id', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const isAdmin = req.authUser.role === 'admin';
      const isSelf = Number(req.authUser.id) === targetUserId;
      if (!isAdmin && !isSelf) {
        return res.status(403).json({ error: 'Forbidden' });
      }
  
      const { name, email, phone, address, profile_image, role } = req.body || {};
      const current = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
      if (!current) return res.status(404).json({ error: 'User not found' });
      if (isAdmin && !isSelf) {
        if (current.role === 'admin') {
          return res.status(400).json({ error: 'Admin users cannot be modified' });
        }
        const emailVerified = Number(current.email_verified || 0) === 1;
        const phoneVerified = Number(current.phone_verified || 0) === 1;
        if (!emailVerified || !phoneVerified) {
          return res.status(403).json({ error: 'User type can be changed only when both email and phone are verified' });
        }
        const nextRole = String(role || current.role).trim().toLowerCase() === 'admin' ? 'admin' : 'customer';
        await dbRunAsync(`UPDATE users SET role = ? WHERE id = ?`, [nextRole, req.params.id]);
        const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
        return res.json(updated);
      }
  
      const phoneParsed = phone !== undefined ? parsePhoneInput(phone) : { value: current.phone, error: null };
      if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
      const requestedPhone = phoneParsed.value;
      const currentEmail = normalizeEmail(current.email);
      const currentPhone = normalizePhone(current.phone);
      const emailValue = email !== undefined ? normalizeEmail(email) : currentEmail;
      const emailChanged = email !== undefined && emailValue !== currentEmail;
      const phoneChangedRequested = phone !== undefined && requestedPhone !== currentPhone;
  
      if (emailValue) {
        const existing = await dbGetAsync(`SELECT id FROM users WHERE email = ? AND id != ?`, [emailValue, req.params.id]);
        if (existing) return res.status(400).json({ error: 'Email already in use' });
      }
  
      if (requestedPhone) {
        const existing = await dbGetAsync(`SELECT id FROM users WHERE phone = ? AND id != ?`, [requestedPhone, req.params.id]);
        if (existing) {
          const allowDeferredSelfFlow = isSelf && !isAdmin && phoneChangedRequested;
          if (!allowDeferredSelfFlow) {
            return res.status(400).json({ error: 'Phone number already in use' });
          }
        }
      }
  
      const shouldQueuePhoneChangeRequest = isSelf && !isAdmin && phoneChangedRequested && Boolean(requestedPhone);
      const persistedPhone = shouldQueuePhoneChangeRequest ? currentPhone : requestedPhone;
      let emailVerifiedValue = Number(current.email_verified || 0) === 1 ? 1 : 0;
      let phoneVerifiedValue = Number(current.phone_verified || 0) === 1 ? 1 : 0;
      const phoneChangedPersisted = phone !== undefined && persistedPhone !== currentPhone;
  
      if (!emailValue) {
        emailVerifiedValue = 0;
      } else if (emailChanged) {
        emailVerifiedValue = isAdmin && Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
      } else if (isAdmin && email !== undefined && req.body?.email_verified !== undefined) {
        emailVerifiedValue = Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
      }
      if (!persistedPhone) {
        phoneVerifiedValue = 0;
      } else if (phoneChangedPersisted) {
        phoneVerifiedValue = isAdmin && Number(req.body?.phone_verified || 0) === 1 ? 1 : 0;
      } else if (isAdmin && phone !== undefined && req.body?.phone_verified !== undefined) {
        phoneVerifiedValue = Number(req.body?.phone_verified || 0) === 1 ? 1 : 0;
      }
      await dbRunAsync(
        `UPDATE users SET name = ?, email = ?, email_verified = ?, phone = ?, phone_verified = ?, address = ?, profile_image = ?, role = ? WHERE id = ?`,
        [
          name !== undefined ? String(name).trim() : current.name,
          emailValue,
          emailVerifiedValue,
          persistedPhone,
          phoneVerifiedValue,
          address !== undefined ? address : current.address,
          profile_image !== undefined ? (String(profile_image || '').trim() || null) : current.profile_image,
          current.role,
          req.params.id,
        ]
      );
      const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
      if (emailChanged && emailValue && emailVerifiedValue === 0) {
        sendEmailVerificationChallenge({
          userId: Number(req.params.id),
          email: emailValue,
          recipientName: name !== undefined ? String(name).trim() : current.name,
          requestedBy: Number(req.authUser?.id || 0) || null,
        }).catch(() => {});
      }
      if (phoneChangedPersisted && persistedPhone && phoneVerifiedValue === 0) {
        sendPhoneVerificationChallenge({
          userId: Number(req.params.id),
          phone: persistedPhone,
          recipientName: name !== undefined ? String(name).trim() : current.name,
          requestedBy: Number(req.authUser?.id || 0) || null,
        }).catch(() => {});
      }
  
      let phoneChangeRequest = null;
      if (shouldQueuePhoneChangeRequest) {
        const queued = await queuePhoneChangeRequest({
          userId: Number(req.params.id),
          oldPhone: currentPhone,
          newPhone: requestedPhone,
          requestedBy: Number(req.authUser?.id || 0) || null,
          requestedFromIp: getRequestIp(req),
        });
        if (queued) {
          phoneChangeRequest = serializePhoneChangeRequest(queued);
          await notifyPhoneChangeSubmitted({
            userId: Number(req.params.id),
          });
        }
      }
  
      if (!phoneChangeRequest) {
        return res.json(updated);
      }
      return res.json({
        ...updated,
        phone_change_request: phoneChangeRequest,
        message: 'Phone update is pending. You will be notified once it is updated.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/users/:id/profile-image', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      const isAdmin = req.authUser.role === 'admin';
      const isSelf = Number(req.authUser.id) === targetUserId;
      if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });
  
      const user = await dbGetAsync(`SELECT id, profile_image FROM users WHERE id = ?`, [targetUserId]);
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      const parsed = parseDataUrlImage(req.body?.image_base64);
      if (!parsed) return res.status(400).json({ error: 'Valid image_base64 data URL is required' });
      if (!PROFILE_IMAGE_ALLOWED_MIME.has(parsed.mimeType)) {
        return res.status(400).json({ error: 'Allowed image types: jpeg, png, webp' });
      }
  
      const imageBuffer = Buffer.from(parsed.base64, 'base64');
      if (!imageBuffer || !imageBuffer.length) {
        return res.status(400).json({ error: 'Invalid image payload' });
      }
      if (imageBuffer.length > PROFILE_IMAGE_MAX_BYTES) {
        return res.status(400).json({ error: 'Image exceeds 2MB limit' });
      }
  
      const fileExt = mimeToExt(parsed.mimeType);
      const fileName = `user_${targetUserId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
      const absPath = path.join(PROFILE_UPLOAD_DIR, fileName);
      fs.writeFileSync(absPath, imageBuffer);
      const nextPath = buildProfileImagePath(fileName);
  
      await dbRunAsync(`UPDATE users SET profile_image = ? WHERE id = ?`, [nextPath, targetUserId]);
      if (user.profile_image && user.profile_image !== nextPath) {
        deleteManagedProfileImage(user.profile_image);
      }
  
      const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]));
      return res.json({ success: true, profile_image: nextPath, user: updated });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
  app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    try {
      const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin user' });
      await dbRunAsync(`DELETE FROM users WHERE id = ?`, [req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'user.delete',
        entityType: 'user',
        entityId: req.params.id,
        details: { role: user.role || null, email: normalizeEmail(user.email) },
      });
      return res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
};

module.exports = { registerUserCrudRoutes };
