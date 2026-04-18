const registerEmailVerificationStatusRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbGetAsync,
    normalizeEmail,
    getBearerTokenFromRequest,
    isSupabaseEmailAuthUsable,
    isSupabaseEmailVerified,
    supabaseAuthProvider,
    syncLocalEmailVerifiedFromSupabase,
    completeContactVerificationRequests,
    EMAIL_VERIFICATION_MODE,
    emailVerificationProvider,
    SUPABASE_AUTH_MODE,
  } = deps;

  app.get('/api/auth/email/verification/status', requireAuth, async (req, res) => {
    try {
      let user = await dbGetAsync('SELECT id, email, email_verified FROM users WHERE id = ?', [
        req.authUser.id,
      ]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isSupabaseEmailAuthUsable() && user.email) {
        const bearerToken = getBearerTokenFromRequest(req);
        if (bearerToken) {
          try {
            const supabaseUser = await supabaseAuthProvider.getUser({ accessToken: bearerToken });
            if (isSupabaseEmailVerified(supabaseUser) && Number(user.email_verified || 0) !== 1) {
              await syncLocalEmailVerifiedFromSupabase(user.email);
              user =
                (await dbGetAsync('SELECT id, email, email_verified FROM users WHERE id = ?', [
                  req.authUser.id,
                ])) || user;
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
};

module.exports = { registerEmailVerificationStatusRoutes };
