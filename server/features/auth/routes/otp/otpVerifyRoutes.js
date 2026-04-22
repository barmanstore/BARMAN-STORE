const registerOtpVerifyRoutes = (deps) => {
  const {
    app,
    authIpLimiter,
    dbGetAsync,
    dbRunAsync,
    normalizeEmail,
    parsePhoneInput,
    OTP_MAX_ATTEMPTS,
    isSupabaseEmailAuthUsable,
    supabaseAuthProvider,
    syncLocalUserFromSupabaseAuth,
    getSupabaseUserMetadata,
    sanitizeUser,
    generateToken,
    toSupabaseSessionPayload,
    verifyPassword,
  } = deps;

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
        return res
          .status(400)
          .json({ error: 'Phone OTP login is not enabled. Use email OTP or OAuth login.' });
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

      const user = await dbGetAsync('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
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
        await dbRunAsync('UPDATE auth_login_otps SET used = 1 WHERE id = ?', [otpRow.id]);
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }
      if (Number(otpRow.attempts || 0) >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS)) {
        await dbRunAsync('UPDATE auth_login_otps SET used = 1 WHERE id = ?', [otpRow.id]);
        return res.status(400).json({ error: 'OTP attempt limit reached' });
      }

      const otpOk = verifyPassword(otpCode, { password_hash: otpRow.otp_hash });
      if (!otpOk) {
        const nextAttempts = Number(otpRow.attempts || 0) + 1;
        const exhausted = nextAttempts >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS);
        await dbRunAsync('UPDATE auth_login_otps SET attempts = ?, used = ? WHERE id = ?', [
          nextAttempts,
          exhausted ? 1 : Number(otpRow.used || 0),
          otpRow.id,
        ]);
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }

      await dbRunAsync('UPDATE auth_login_otps SET used = 1 WHERE id = ?', [otpRow.id]);
      await dbRunAsync('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
      const freshUser = await dbGetAsync('SELECT * FROM users WHERE id = ?', [user.id]);
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
};

module.exports = { registerOtpVerifyRoutes };
