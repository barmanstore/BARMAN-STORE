const registerUserRoleRoutes = (deps) => {
  const {
    app,
    requireCapability,
    dbGetAsync,
    dbRunAsync,
    normalizeEmail,
    parsePhoneInput,
    generateTemporaryPassword,
    hashPassword,
    sendEmailVerificationChallenge,
    sendPhoneVerificationChallenge,
    sanitizeUser,
    logAdminAuditAsync,
  } = deps;

  app.post(
    '/api/users',
    requireCapability('manage_users', 'User management access required'),
    async (req, res) => {
      try {
        const { name, email, phone, address, role } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        const phoneParsed = parsePhoneInput(phone);
        const creditLimitRaw = req.body?.credit_limit;
        if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
        const normalizedPhone = phoneParsed.value;
        let normalizedCreditLimit = 0;
        if (
          creditLimitRaw !== undefined &&
          creditLimitRaw !== null &&
          String(creditLimitRaw).trim() !== ''
        ) {
          const parsedCreditLimit = Number(creditLimitRaw);
          if (!Number.isFinite(parsedCreditLimit) || parsedCreditLimit < 0) {
            return res
              .status(400)
              .json({ error: 'Credit limit must be a number greater than or equal to 0' });
          }
          normalizedCreditLimit = parsedCreditLimit;
        }
        if (!name || String(name).trim().length < 2) {
          return res.status(400).json({ error: 'Name must be at least 2 characters' });
        }
        if (!normalizedEmail && !normalizedPhone) {
          return res.status(400).json({ error: 'Email or phone number is required' });
        }
        if (
          normalizedEmail &&
          (await dbGetAsync('SELECT id FROM users WHERE email = ?', [normalizedEmail]))
        ) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        if (
          normalizedPhone &&
          (await dbGetAsync('SELECT id FROM users WHERE phone = ?', [normalizedPhone]))
        ) {
          return res.status(400).json({ error: 'Phone number already registered' });
        }
        const userRole = role === 'admin' ? 'admin' : 'customer';
        const nextPassword = generateTemporaryPassword();
        const requestedEmailVerified = Number(req.body?.email_verified || 0) === 1;
        const requestedPhoneVerified = Number(req.body?.phone_verified || 0) === 1;
        const emailVerifiedValue = normalizedEmail ? (requestedEmailVerified ? 1 : 0) : 0;
        const phoneVerifiedValue = normalizedPhone ? (requestedPhoneVerified ? 1 : 0) : 0;
        const result = await dbRunAsync(
          `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userRole,
            String(name).trim(),
            normalizedEmail,
            emailVerifiedValue,
            normalizedPhone,
            phoneVerifiedValue,
            address || null,
            hashPassword(nextPassword),
            0,
            normalizedCreditLimit,
          ]
        );
        const user = sanitizeUser(
          await dbGetAsync('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid])
        );
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
    }
  );

  app.delete(
    '/api/users/:id',
    requireCapability('manage_users', 'User management access required'),
    async (req, res) => {
      try {
        const user = await dbGetAsync('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'admin')
          return res.status(400).json({ error: 'Cannot delete admin user' });
        await dbRunAsync('DELETE FROM users WHERE id = ?', [req.params.id]);
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
    }
  );
};

module.exports = { registerUserRoleRoutes };
