const createRequestAuth = ({
  getBearerTokenFromRequest,
  verifyToken,
  sanitizeUser,
  dbGetAsync,
  normalizeEmail,
  supabaseAuthProvider,
  isSupabaseEmailAuthUsable,
  getSupabaseUserMetadata,
  isSupabaseEmailVerified,
  syncLocalUserFromSupabaseAuth,
} = {}) => {
  const getAuthUserFromRequest = async (req) => {
    const token = getBearerTokenFromRequest(req);
    if (!token) return null;
    const payload = verifyToken(token);
    if (payload) {
      const user = sanitizeUser(
        await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [payload.uid])
      );
      return user || null;
    }

    if (!isSupabaseEmailAuthUsable()) return null;
    if (
      !supabaseAuthProvider.shouldUseClientAuth() &&
      supabaseAuthProvider.shouldUseAccessTokenDecodeFallback()
    ) {
      const decoded = supabaseAuthProvider.decodeAccessTokenUnsafe({ accessToken: token });
      const normalizedEmail = normalizeEmail(decoded?.email);
      if (!normalizedEmail) return null;
      const synced = await syncLocalUserFromSupabaseAuth({
        email: normalizedEmail,
        metadata: decoded?.metadata || {},
        emailVerified: true,
      });
      return sanitizeUser(synced) || null;
    }
    try {
      const supabaseUser = await supabaseAuthProvider.getUser({ accessToken: token });
      const normalizedEmail = normalizeEmail(supabaseUser?.email);
      if (!normalizedEmail) return null;
      const synced = await syncLocalUserFromSupabaseAuth({
        email: normalizedEmail,
        metadata: getSupabaseUserMetadata(supabaseUser),
        emailVerified: isSupabaseEmailVerified(supabaseUser),
      });
      return sanitizeUser(synced);
    } catch (_) {
      return null;
    }
  };

  return { getAuthUserFromRequest };
};

module.exports = { createRequestAuth };
