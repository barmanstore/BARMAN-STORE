const crypto = require('crypto');

const timingSafeEqualString = (left, right) => {
  const leftValue = String(left || '');
  const rightValue = String(right || '');
  if (!leftValue || !rightValue) return false;
  const leftBuffer = Buffer.from(leftValue);
  const rightBuffer = Buffer.from(rightValue);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const registerPhoneVerificationRoutes = (deps) => {
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
    if (!timingSafeEqualString(providedHash, tokenRow.token_hash)) {
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

};

module.exports = { registerPhoneVerificationRoutes };
