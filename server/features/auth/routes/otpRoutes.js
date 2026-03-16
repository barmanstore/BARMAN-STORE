const registerOtpRoutes = (deps) => {
  const {
    app,
    requireAuth,
    authIpLimiter,
    emailVerificationLimiter,
    requireInternalCron,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    normalizeEmail,
    parsePhoneInput,
    normalizePhone,
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
    syncLocalUserFromSupabaseAuth,
    getSupabaseUserMetadata,
    sanitizeUser,
    generateToken,
    toSupabaseSessionPayload,
    verifyPassword,
    isSupabaseAuthStrictMode,
    queueContactVerificationRequest,
    getRequestIp,
    syncLocalEmailVerifiedFromSupabase,
    completeContactVerificationRequests,
    EMAIL_VERIFY_MAX_ATTEMPTS,
    hashVerificationToken,
    getBearerTokenFromRequest,
    isSupabaseEmailVerified,
    EMAIL_VERIFICATION_MODE,
    SUPABASE_AUTH_MODE,
    WHATSAPP_DELIVERY_MODE,
    whatsappProvider,
    processPendingPhoneChangeRequests,
    getLatestPhoneChangeRequestForUser,
    serializePhoneChangeRequest,
    getOpenPhoneChangeRequestForUser,
    rejectPhoneChangeRequest,
    createAppNotification,
    PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_AUTO_BATCH_SIZE,
    normalizeContactVerificationRequestType,
    AUTH_FLOW_MODE,
    OTP_PROVIDER,
    OTP_DELIVERY_MODE,
    OTP_VERIFY_SESSION_TTL_SECONDS,
    PHONE_VERIFICATION_REQUIRED,
    WHATSAPP_PROVIDER,
    SUPABASE_EMAIL_VERIFY_REDIRECT,
    PHONE_VERIFY_MAX_ATTEMPTS,
    hashOpaqueToken
  } = deps;

app.post('/api/auth/otp/request', authIpLimiter, async (req, res) => {
  try {
    const authMode = String(req.body?.mode || req.body?.purpose || 'login').trim().toLowerCase() === 'register'
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
      return res.status(400).json({ error: 'Phone OTP login is not enabled. Use email OTP or OAuth login.' });
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

    let user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

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
        user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [created.lastInsertRowid]);
      } catch (error) {
        if (!isUniqueViolationError(error)) throw error;
        user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
      }
    }
    if (!user) {
      return res.status(500).json({ error: 'Unable to prepare OTP login for this account' });
    }

    const otpCode = generateOtpCode(6);
    const otpHash = hashPassword(otpCode);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
    await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE email = ? AND used = 0`, [normalizedEmail]);
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

app.post('/api/auth/otp/verify', authIpLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const phoneParsed = parsePhoneInput(req.body?.phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const otpCode = String(req.body?.otp || req.body?.code || '').trim();
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (normalizedEmail && normalizedPhone) {
      return res.status(400).json({ error: 'Provide either email or phone, not both' });
    }
    if (normalizedPhone) {
      return res.status(400).json({ error: 'Phone OTP login is not enabled. Use email OTP or OAuth login.' });
    }
    if (!otpCode) return res.status(400).json({ error: 'OTP is required' });

    if (isSupabaseEmailAuthUsable()) {
      try {
        const verification = await supabaseAuthProvider.verifySignInOtp({
          email: normalizedEmail,
          token: otpCode,
        });
        const supabaseUser = verification?.user || null;
        const resolvedEmail = normalizeEmail(supabaseUser?.email) || normalizedEmail;
        const synced = await syncLocalUserFromSupabaseAuth({
          email: resolvedEmail,
          metadata: getSupabaseUserMetadata(supabaseUser),
          emailVerified: true,
        });
        if (!synced) {
          return res.status(401).json({ error: 'Unable to sync account after OTP verification' });
        }
        return res.json({
          success: true,
          user: sanitizeUser(synced),
          token: generateToken(synced),
          auth_provider: 'supabase_otp',
          supabase_session: toSupabaseSessionPayload(verification?.session),
        });
      } catch (error) {
        return res.status(400).json({ error: error.message || 'Invalid or expired OTP' });
      }
    }

    const user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const otpRow = await dbGetAsync(
      `SELECT * FROM auth_login_otps
       WHERE user_id = ?
         AND COALESCE(email, '') = COALESCE(?, '')
         AND COALESCE(phone, '') = ''
         AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedEmail || null]
    );
    if (!otpRow) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const now = Date.now();
    const expiresAt = new Date(otpRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    if (Number(otpRow.attempts || 0) >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
      return res.status(400).json({ error: 'OTP attempt limit reached' });
    }

    const otpOk = verifyPassword(otpCode, { password_hash: otpRow.otp_hash });
    if (!otpOk) {
      const nextAttempts = Number(otpRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE auth_login_otps SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(otpRow.used || 0), otpRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
    await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE id = ?`, [user.id]);
    const freshUser = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [user.id]);
    return res.json({
      success: true,
      user: sanitizeUser(freshUser),
      token: generateToken(freshUser),
      auth_provider: 'otp',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

  const PASSWORD_AUTH_DISABLED_ERROR = 'Password-based authentication is disabled. Use OTP or OAuth login.';
  const respondPasswordAuthDisabled = (_, res) =>
    res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR });

[
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/change-password',
  '/api/auth/request-password-reset',
  '/api/auth/password/recovery/complete',
  '/api/auth/reset-password/otp/verify',
  '/api/auth/reset-password/otp/complete',
].forEach((routePath) => {
  app.post(routePath, authIpLimiter, respondPasswordAuthDisabled);
});

};

module.exports = { registerOtpRoutes };
