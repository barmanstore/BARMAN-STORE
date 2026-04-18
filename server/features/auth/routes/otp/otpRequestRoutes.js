const registerOtpRequestRoutes = (deps) => {
  const {
    app,
    authIpLimiter,
    dbGetAsync,
    dbRunAsync,
    normalizeEmail,
    parsePhoneInput,
    hashPassword,
    generateTemporaryPassword,
    isUniqueViolationError,
    generateOtpCode,
    OTP_TTL_SECONDS,
    OTP_MAX_ATTEMPTS,
    notificationService,
    createNotificationEvent,
    EMAIL_DELIVERY_MODE,
    emailVerificationProvider,
    updateNotificationEventStatus,
    AUTH_LOGIN_OTP_EXPOSE_CODE,
    isSupabaseEmailAuthUsable,
    supabaseAuthProvider,
  } = deps;

  app.post('/api/auth/otp/request', authIpLimiter, async (req, res) => {
    try {
      const authMode =
        String(req.body?.mode || req.body?.purpose || 'login')
          .trim()
          .toLowerCase() === 'register'
          ? 'register'
          : 'login';
      const normalizedEmail = normalizeEmail(req.body?.email);
      const phoneParsed = parsePhoneInput(req.body?.phone);
      if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
      const normalizedPhone = phoneParsed.value;
      if (!normalizedEmail && !normalizedPhone) {
        return res.status(400).json({ error: 'Email is required' });
      }
      if (normalizedEmail && normalizedPhone) {
        return res.status(400).json({ error: 'Provide either email or phone, not both' });
      }
      if (normalizedPhone) {
        return res
          .status(400)
          .json({ error: 'Phone OTP login is not enabled. Use email OTP or OAuth login.' });
      }

      if (isSupabaseEmailAuthUsable()) {
        try {
          await supabaseAuthProvider.requestEmailOtp({
            email: normalizedEmail,
            shouldCreateUser: authMode === 'register',
          });
          return res.status(201).json({
            success: true,
            message: 'OTP sent to email.',
            delivery_channel: 'email',
            delivery_mode: 'supabase',
            otp_ttl_seconds: OTP_TTL_SECONDS,
            provider: 'supabase',
          });
        } catch (error) {
          return res.status(400).json({ error: error.message || 'Failed to send email OTP' });
        }
      }

      let user = await dbGetAsync('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

      if (authMode === 'login' && !user) {
        return res.status(404).json({
          error: 'Account not found. Please register first.',
          register_required: true,
        });
      }
      if (authMode === 'register' && user) {
        return res.status(409).json({
          error: 'Account already exists. Please sign in.',
          login_required: true,
        });
      }

      if (authMode === 'register' && !user) {
        const displayName = normalizedEmail.split('@')[0];
        try {
          const created = await dbRunAsync(
            `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              'customer',
              displayName,
              normalizedEmail || null,
              0,
              null,
              0,
              null,
              hashPassword(generateTemporaryPassword()),
              0,
            ]
          );
          user = await dbGetAsync('SELECT * FROM users WHERE id = ?', [created.lastInsertRowid]);
        } catch (error) {
          if (!isUniqueViolationError(error)) throw error;
          user = await dbGetAsync('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
        }
      }
      if (!user) {
        return res.status(500).json({ error: 'Unable to prepare OTP login for this account' });
      }

      const otpCode = generateOtpCode(6);
      const otpHash = hashPassword(otpCode);
      const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
      await dbRunAsync('UPDATE auth_login_otps SET used = 1 WHERE email = ? AND used = 0', [
        normalizedEmail,
      ]);
      await dbRunAsync(
        `INSERT INTO auth_login_otps (user_id, email, phone, otp_hash, expires_at, attempts, max_attempts, used)
         VALUES (?, ?, ?, ?, ?, 0, ?, 0)`,
        [user.id, normalizedEmail || null, null, otpHash, expiresAt, OTP_MAX_ATTEMPTS]
      );

      const responsePayload = {
        success: true,
        message: 'OTP sent to email.',
        delivery_channel: 'email',
        otp_ttl_seconds: OTP_TTL_SECONDS,
      };
      const preparedEmail = notificationService.prepareEmail({
        type: 'auth_login_otp',
        to: normalizedEmail,
        payload: {
          recipientName: user.name,
          code: otpCode,
          expiresAt,
        },
      });
      const eventId = await createNotificationEvent({
        type: 'auth_login_otp',
        channel: 'email',
        recipient: preparedEmail.to,
        recipientUserId: Number(user.id || 0) || null,
        subject: preparedEmail.subject,
        body: preparedEmail.body,
        metadata: {
          mode: EMAIL_DELIVERY_MODE,
          expires_at: expiresAt,
          mailto_url: preparedEmail.mailto_url,
        },
        status: 'prepared',
      });

      if (EMAIL_DELIVERY_MODE === 'auto') {
        if (!emailVerificationProvider?.isReady) {
          await updateNotificationEventStatus(eventId, {
            status: 'failed',
            errorMessage: 'Email provider is not configured',
          });
          return res.status(503).json({ error: 'Email provider is not configured' });
        }
        await emailVerificationProvider.sendVerification({
          to: normalizedEmail,
          token: otpCode,
          link: '',
          expiresAt,
          subject: preparedEmail.subject,
          body: preparedEmail.body,
        });
        await updateNotificationEventStatus(eventId, { status: 'sent' });
      }

      responsePayload.delivery_mode = EMAIL_DELIVERY_MODE;
      responsePayload.prepared_event_id = eventId;
      if (AUTH_LOGIN_OTP_EXPOSE_CODE) {
        responsePayload.dev_otp_code = otpCode;
        responsePayload.manual_email = {
          subject: preparedEmail.subject,
          body: preparedEmail.body,
          mailto_url: preparedEmail.mailto_url,
        };
      }
      return res.status(201).json(responsePayload);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to request OTP' });
    }
  });
};

module.exports = { registerOtpRequestRoutes };
