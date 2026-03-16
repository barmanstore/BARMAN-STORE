const registerContactVerificationRoutes = (deps) => {
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

};

module.exports = { registerContactVerificationRoutes };
