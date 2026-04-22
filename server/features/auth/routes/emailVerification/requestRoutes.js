const registerEmailVerificationRequestRoutes = (deps) => {
  const {
    app,
    authIpLimiter,
    emailVerificationLimiter,
    dbGetAsync,
    normalizeEmail,
    isSupabaseEmailAuthUsable,
    isSupabaseAuthStrictMode,
    supabaseAuthProvider,
    queueContactVerificationRequest,
    getRequestIp,
  } = deps;

  app.post(
    '/api/auth/email/verification/request',
    authIpLimiter,
    emailVerificationLimiter,
    async (req, res) => {
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
              return res
                .status(400)
                .json({ error: error.message || 'Failed to send verification email' });
            }
          }
        }

        const user = await dbGetAsync(
          'SELECT id, name, email, email_verified FROM users WHERE email = ?',
          [normalizedEmail]
        );
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
    }
  );
};

module.exports = { registerEmailVerificationRequestRoutes };
