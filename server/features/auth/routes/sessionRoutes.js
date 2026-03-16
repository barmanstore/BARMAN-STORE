const registerAuthSessionRoutes = (deps) => {
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

};

module.exports = { registerAuthSessionRoutes };
