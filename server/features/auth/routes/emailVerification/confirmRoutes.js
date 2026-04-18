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

const registerEmailVerificationConfirmRoutes = (deps) => {
  const {
    app,
    authIpLimiter,
    emailVerificationLimiter,
    dbGetAsync,
    dbRunAsync,
    normalizeEmail,
    isSupabaseEmailAuthUsable,
    isSupabaseAuthStrictMode,
    supabaseAuthProvider,
    syncLocalUserFromSupabaseAuth,
    getSupabaseUserMetadata,
    syncLocalEmailVerifiedFromSupabase,
    completeContactVerificationRequests,
    EMAIL_VERIFY_MAX_ATTEMPTS,
    hashVerificationToken,
  } = deps;

  app.post(
    '/api/auth/email/verification/confirm',
    authIpLimiter,
    emailVerificationLimiter,
    async (req, res) => {
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
            const userToComplete =
              synced ||
              (await dbGetAsync('SELECT id FROM users WHERE email = ?', [normalizedEmail]));
            if (userToComplete?.id) {
              await completeContactVerificationRequests({
                userId: userToComplete.id,
                requestType: 'email',
              });
            }
            return res.json({
              success: true,
              provider: 'supabase',
              message: 'Email verified successfully',
            });
          } catch (error) {
            if (isSupabaseAuthStrictMode()) {
              return res
                .status(400)
                .json({ error: error.message || 'Invalid or expired verification token' });
            }
          }
        }

        if (!token) {
          return res.status(400).json({ error: 'Email and token are required' });
        }
        const user = await dbGetAsync('SELECT id, email_verified FROM users WHERE email = ?', [
          normalizedEmail,
        ]);
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
        if (!tokenRow)
          return res.status(400).json({ error: 'Invalid or expired verification token' });

        const now = Date.now();
        const expiresAt = new Date(tokenRow.expires_at).getTime();
        if (!Number.isFinite(expiresAt) || now > expiresAt) {
          await dbRunAsync('UPDATE email_verification_tokens SET used = 1 WHERE id = ?', [
            tokenRow.id,
          ]);
          return res.status(400).json({ error: 'Invalid or expired verification token' });
        }
        if (
          Number(tokenRow.attempts || 0) >=
          Number(tokenRow.max_attempts || EMAIL_VERIFY_MAX_ATTEMPTS)
        ) {
          await dbRunAsync('UPDATE email_verification_tokens SET used = 1 WHERE id = ?', [
            tokenRow.id,
          ]);
          return res.status(400).json({ error: 'Verification token attempt limit reached' });
        }

        const providedHash = hashVerificationToken(token);
        if (!timingSafeEqualString(providedHash, tokenRow.token_hash)) {
          const nextAttempts = Number(tokenRow.attempts || 0) + 1;
          const exhausted =
            nextAttempts >= Number(tokenRow.max_attempts || EMAIL_VERIFY_MAX_ATTEMPTS);
          await dbRunAsync(
            'UPDATE email_verification_tokens SET attempts = ?, used = ? WHERE id = ?',
            [nextAttempts, exhausted ? 1 : Number(tokenRow.used || 0), tokenRow.id]
          );
          return res.status(400).json({ error: 'Invalid or expired verification token' });
        }

        await dbRunAsync('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
        await dbRunAsync(
          'UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND email = ? AND used = 0',
          [user.id, normalizedEmail]
        );
        await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
        return res.json({ success: true, message: 'Email verified successfully' });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );
};

module.exports = { registerEmailVerificationConfirmRoutes };
