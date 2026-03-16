const registerEmailVerificationRoutes = (deps) => {
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

};

module.exports = { registerEmailVerificationRoutes };
