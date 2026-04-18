const registerEmailVerificationRequestSelfRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbGetAsync,
    normalizeEmail,
    isSupabaseEmailAuthUsable,
    isSupabaseAuthStrictMode,
    supabaseAuthProvider,
    queueContactVerificationRequest,
    getRequestIp,
  } = deps;

  app.post('/api/auth/email/verification/request-self', requireAuth, async (req, res) => {
    try {
      const user = await dbGetAsync(
        'SELECT id, name, email, email_verified FROM users WHERE id = ?',
        [req.authUser.id]
      );
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
            return res
              .status(400)
              .json({ error: error.message || 'Failed to send verification email' });
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

module.exports = { registerEmailVerificationRequestSelfRoutes };
