const registerAuthRoutes = (deps) => {
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

app.get('/api/auth/session', requireAuth, async (req, res) => {
  try {
    const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.authUser.id]));
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      success: true,
      user,
      token: generateToken(user),
      auth_provider: isSupabaseEmailAuthUsable() ? 'supabase' : 'legacy',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch session' });
  }
});

const PASSWORD_AUTH_DISABLED_ERROR = 'Password-based authentication is disabled. Use OTP or OAuth login.';
const respondPasswordAuthDisabled = (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR });

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

app.post('/api/auth/email/verification/request', authIpLimiter, emailVerificationLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        await supabaseAuthProvider.resendSignupVerification({ email: normalizedEmail });
        return res.status(201).json({
          success: true,
          provider: 'supabase',
          message: 'If the account exists, a verification email was sent.',
        });
      } catch (error) {
        if (isSupabaseAuthStrictMode()) {
          return res.status(400).json({ error: error.message || 'Failed to send verification email' });
        }
      }
    }

    const user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE email = ?`, [normalizedEmail]);
    if (!user) {
      return res.status(201).json({
        success: true,
        message: 'If the account exists, verification request was submitted for admin review.',
      });
    }
    if (Number(user.email_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Email is already verified' });
    }
    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestType: 'email',
      requestedFromIp: getRequestIp(req),
    });
    return res.status(201).json({
      success: true,
      message: 'Email verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/email/verification/confirm', authIpLimiter, emailVerificationLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || '').trim();
    const tokenHash = String(req.body?.token_hash || req.body?.tokenHash || '').trim();
    if (!normalizedEmail || (!token && !tokenHash)) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        const verificationResult = await supabaseAuthProvider.verifyEmailOtp({
          email: normalizedEmail,
          token,
          tokenHash,
        });
        const supabaseUser = verificationResult?.user || null;
        const synced = await syncLocalUserFromSupabaseAuth({
          email: normalizeEmail(supabaseUser?.email) || normalizedEmail,
          metadata: getSupabaseUserMetadata(supabaseUser),
          emailVerified: true,
        });
        if (!synced) {
          await syncLocalEmailVerifiedFromSupabase(normalizedEmail);
        }
        const userToComplete = synced
          || await dbGetAsync(`SELECT id FROM users WHERE email = ?`, [normalizedEmail]);
        if (userToComplete?.id) {
          await completeContactVerificationRequests({ userId: userToComplete.id, requestType: 'email' });
        }
        return res.json({
          success: true,
          provider: 'supabase',
          message: 'Email verified successfully',
        });
      } catch (error) {
        if (isSupabaseAuthStrictMode()) {
          return res.status(400).json({ error: error.message || 'Invalid or expired verification token' });
        }
      }
    }

    if (!token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }
    const user = await dbGetAsync(`SELECT id, email_verified FROM users WHERE email = ?`, [normalizedEmail]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification token' });
    if (Number(user.email_verified || 0) === 1) {
      await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
      return res.json({ success: true, message: 'Email is already verified' });
    }

    const tokenRow = await dbGetAsync(
      `SELECT * FROM email_verification_tokens
       WHERE user_id = ? AND email = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedEmail]
    );
    if (!tokenRow) return res.status(400).json({ error: 'Invalid or expired verification token' });

    const now = Date.now();
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    if (Number(tokenRow.attempts || 0) >= Number(tokenRow.max_attempts || EMAIL_VERIFY_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Verification token attempt limit reached' });
    }

    const providedHash = hashVerificationToken(token);
    if (providedHash !== String(tokenRow.token_hash || '')) {
      const nextAttempts = Number(tokenRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(tokenRow.max_attempts || EMAIL_VERIFY_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE email_verification_tokens SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(tokenRow.used || 0), tokenRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE id = ?`, [user.id]);
    await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND email = ? AND used = 0`, [user.id, normalizedEmail]);
    await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
    return res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/email/verification/status', requireAuth, async (req, res) => {
  try {
    let user = await dbGetAsync(`SELECT id, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (isSupabaseEmailAuthUsable() && user.email) {
      const bearerToken = getBearerTokenFromRequest(req);
      if (bearerToken) {
        try {
          const supabaseUser = await supabaseAuthProvider.getUser({ accessToken: bearerToken });
          if (isSupabaseEmailVerified(supabaseUser) && Number(user.email_verified || 0) !== 1) {
            await syncLocalEmailVerifiedFromSupabase(user.email);
            user = await dbGetAsync(`SELECT id, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]) || user;
            await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
          }
        } catch (_) {
          // Ignore token mismatch (legacy token) and keep local status.
        }
      }
    }
    return res.json({
      email: user.email || null,
      email_verified: Number(user.email_verified || 0) === 1,
      mode: EMAIL_VERIFICATION_MODE,
      provider_ready: Boolean(emailVerificationProvider?.isReady),
      provider: isSupabaseEmailAuthUsable() ? 'supabase' : 'legacy',
      supabase_auth_enabled: Boolean(supabaseAuthProvider?.isEnabled),
      supabase_auth_mode: SUPABASE_AUTH_MODE,
      supabase_client_ready: Boolean(supabaseAuthProvider?.clientReady),
      supabase_admin_ready: Boolean(supabaseAuthProvider?.adminReady),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/email/verification/request-self', requireAuth, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'No email is set on your profile' });
    }
    if (Number(user.email_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Email is already verified' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        await supabaseAuthProvider.resendSignupVerification({ email: normalizedEmail });
        return res.status(201).json({
          success: true,
          provider: 'supabase',
          message: 'Verification email sent.',
        });
      } catch (error) {
        if (isSupabaseAuthStrictMode()) {
          return res.status(400).json({ error: error.message || 'Failed to send verification email' });
        }
      }
    }

    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestedBy: Number(req.authUser?.id || 0) || null,
      requestedFromIp: getRequestIp(req),
      requestType: 'email',
    });
    return res.status(201).json({
      success: true,
      message: 'Email verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/phone/verification/request', authIpLimiter, async (req, res) => {
  try {
    const phoneParsed = parsePhoneInput(req.body?.phone, { required: true });
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE phone = ?`, [normalizedPhone]);
    if (!user) {
      return res.status(201).json({
        success: true,
        message: 'If the account exists, verification request was submitted for admin review.',
      });
    }
    if (Number(user.phone_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Phone is already verified' });
    }
    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestType: 'phone',
      requestedFromIp: getRequestIp(req),
    });
    return res.status(201).json({
      success: true,
      message: 'Phone verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/phone/verification/confirm', authIpLimiter, async (req, res) => {
  try {
    const phoneParsed = parsePhoneInput(req.body?.phone, { required: true });
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const code = String(req.body?.code || req.body?.token || '').trim();
    if (!code) return res.status(400).json({ error: 'Phone and code are required' });
    const user = await dbGetAsync(`SELECT id, phone_verified FROM users WHERE phone = ?`, [normalizedPhone]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification code' });
    if (Number(user.phone_verified || 0) === 1) {
      await completeContactVerificationRequests({ userId: user.id, requestType: 'phone' });
      return res.json({ success: true, message: 'Phone is already verified' });
    }

    const tokenRow = await dbGetAsync(
      `SELECT * FROM phone_verification_tokens
       WHERE user_id = ? AND phone = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedPhone]
    );
    if (!tokenRow) return res.status(400).json({ error: 'Invalid or expired verification code' });

    const now = Date.now();
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    if (Number(tokenRow.attempts || 0) >= Number(tokenRow.max_attempts || PHONE_VERIFY_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Verification code attempt limit reached' });
    }

    const providedHash = hashOpaqueToken(code);
    if (providedHash !== String(tokenRow.token_hash || '')) {
      const nextAttempts = Number(tokenRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(tokenRow.max_attempts || PHONE_VERIFY_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE phone_verification_tokens SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(tokenRow.used || 0), tokenRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    await dbRunAsync(`UPDATE users SET phone_verified = 1 WHERE id = ?`, [user.id]);
    await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0`, [user.id, normalizedPhone]);
    await completeContactVerificationRequests({ userId: user.id, requestType: 'phone' });
    return res.json({ success: true, message: 'Phone verified successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/phone/verification/status', requireAuth, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT id, phone, phone_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      phone: user.phone || null,
      phone_verified: Number(user.phone_verified || 0) === 1,
      mode: WHATSAPP_DELIVERY_MODE,
      provider_ready: Boolean(whatsappProvider?.isReady),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/phone-change-request/status', requireAuth, async (req, res) => {
  try {
    await processPendingPhoneChangeRequests({ limit: 10 });
    const row = await getLatestPhoneChangeRequestForUser(req.authUser.id);
    if (!row) {
      return res.json({
        request: null,
      });
    }
    return res.json({
      request: serializePhoneChangeRequest(row),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load phone change request status' });
  }
});

app.post('/api/auth/phone-change-request/cancel', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const openRequest = await getOpenPhoneChangeRequestForUser(userId);
    if (!openRequest) {
      return res.status(404).json({ error: 'No pending phone change request found' });
    }
    const reason = String(req.body?.reason || '').trim() || 'Cancelled by user';
    const cancelled = await rejectPhoneChangeRequest({
      id: openRequest.id,
      reviewedBy: userId,
      adminNote: 'Cancelled by user',
      rejectionReason: reason,
    });
    if (!cancelled) {
      return res.status(404).json({ error: 'No pending phone change request found' });
    }
    await createAppNotification({
      userId,
      title: 'Phone update request cancelled',
      message: 'Your pending phone update request has been cancelled.',
      level: 'info',
      entityType: 'phone_change_request',
      entityId: Number(cancelled.id || 0) || null,
      metadata: {
        route: '/profile',
        status: PHONE_CHANGE_STATUS_REJECTED,
      },
      createdBy: userId,
    });
    return res.json({
      success: true,
      message: 'Pending phone update request cancelled',
      request: serializePhoneChangeRequest(cancelled),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to cancel phone change request' });
  }
});

const handleInternalPhoneChangeProcess = async (req, res) => {
  try {
    const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? PHONE_CHANGE_AUTO_BATCH_SIZE);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(250, Math.floor(rawLimit)))
      : PHONE_CHANGE_AUTO_BATCH_SIZE;
    const result = await processPendingPhoneChangeRequests({ limit });
    return res.json({
      success: true,
      limit,
      result: result || {
        auto_approved: 0,
        escalated_admin_review: 0,
        auto_rejected_invalid: 0,
        expired_rejected: 0,
        scanned_auto_candidates: 0,
        scanned_overdue_candidates: 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to process phone change queue' });
  }
};

app.get('/api/internal/phone-change/process', requireInternalCron, handleInternalPhoneChangeProcess);
app.post('/api/internal/phone-change/process', requireInternalCron, handleInternalPhoneChangeProcess);

app.get('/api/auth/contact-verification/status', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await dbAllAsync(
      `SELECT id, request_type, status, admin_note, processed_at, completed_at, created_at, updated_at
       FROM contact_verification_requests
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );

    const latest = { email: null, phone: null };
    rows.forEach((row) => {
      const type = normalizeContactVerificationRequestType(row?.request_type);
      if (!type || latest[type]) return;
      latest[type] = row;
    });

    return res.json(latest);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load verification request status' });
  }
});

app.post('/api/auth/phone/verification/request-self', requireAuth, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const normalizedPhone = normalizePhone(user.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'No phone is set on your profile' });
    }
    if (Number(user.phone_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Phone is already verified' });
    }
    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestedBy: Number(req.authUser?.id || 0) || null,
      requestedFromIp: getRequestIp(req),
      requestType: 'phone',
    });
    return res.status(201).json({
      success: true,
      message: 'Phone verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/reset-mode', (_, res) => {
  return res.json({
    auth_flow_mode: AUTH_FLOW_MODE,
    mode: 'otp_login_only',
    auth_methods: {
      otp: true,
      oauth: Boolean(supabaseAuthProvider?.shouldUseOAuth?.()),
      password: false,
    },
    otp_provider: OTP_PROVIDER,
    otp_delivery_mode: OTP_DELIVERY_MODE,
    otp_ready: true,
    otp_verify_session_ttl_seconds: OTP_VERIFY_SESSION_TTL_SECONDS,
    phone_verification_required: PHONE_VERIFICATION_REQUIRED,
    whatsapp_delivery_mode: WHATSAPP_DELIVERY_MODE,
    whatsapp_provider: WHATSAPP_PROVIDER,
    whatsapp_provider_ready: Boolean(whatsappProvider?.isReady),
    email_verification_mode: EMAIL_VERIFICATION_MODE,
    email_delivery_mode: EMAIL_DELIVERY_MODE,
    email_provider_ready: Boolean(emailVerificationProvider?.isReady),
    supabase_auth_enabled: Boolean(supabaseAuthProvider?.isEnabled),
    supabase_auth_mode: SUPABASE_AUTH_MODE,
    supabase_client_ready: Boolean(supabaseAuthProvider?.clientReady),
    supabase_oauth_ready: Boolean(supabaseAuthProvider?.oauthReady),
    supabase_admin_ready: Boolean(supabaseAuthProvider?.adminReady),
    supabase_url: supabaseAuthProvider?.baseUrl || null,
    supabase_email_verify_redirect: SUPABASE_EMAIL_VERIFY_REDIRECT || null,
  });
});
};

module.exports = {
  registerAuthRoutes,
};
