const createSupabaseAuthHelpers = ({ supabaseAuthProvider, parsePhoneInput } = {}) => {
  const isSupabaseEmailAuthUsable = () =>
    supabaseAuthProvider.shouldUseClientAuth() ||
    supabaseAuthProvider.shouldUseAccessTokenDecodeFallback();
  const isSupabaseAuthStrictMode = () => supabaseAuthProvider.isStrictMode();
  const isSupabaseEmailVerified = (user = null) =>
    Boolean(user?.email_confirmed_at || user?.confirmed_at);
  const toSupabaseSessionPayload = (session = null) => {
    if (!session || typeof session !== 'object') return null;
    const accessToken = String(session.access_token || '').trim();
    if (!accessToken) return null;
    return {
      access_token: accessToken,
      refresh_token: String(session.refresh_token || '').trim() || null,
      token_type: String(session.token_type || '').trim() || 'bearer',
      expires_in: Number(session.expires_in || 0) || null,
    };
  };
  const getSupabaseUserMetadata = (user = null) => {
    const meta = user?.user_metadata;
    return meta && typeof meta === 'object' ? meta : {};
  };

  const getVerifiedPhoneFromMetadata = (metadata = {}) => {
    const candidate = metadata.phone || metadata.phone_number || null;
    const parsed = parsePhoneInput(candidate);
    return parsed.error ? null : parsed.value;
  };

  return {
    isSupabaseEmailAuthUsable,
    isSupabaseAuthStrictMode,
    isSupabaseEmailVerified,
    toSupabaseSessionPayload,
    getSupabaseUserMetadata,
    getVerifiedPhoneFromMetadata,
  };
};

module.exports = { createSupabaseAuthHelpers };
