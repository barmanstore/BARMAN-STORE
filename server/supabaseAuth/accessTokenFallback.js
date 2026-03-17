const createAccessTokenDecoder = ({ accessTokenDecodeFallbackAllowed, baseUrl }) => {
  return ({ accessToken = '' } = {}) => {
    if (!accessTokenDecodeFallbackAllowed) return null;
    const rawToken = String(accessToken || '').trim();
    if (!rawToken) return null;
    const parts = rawToken.split('.');
    if (parts.length < 2) return null;
    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);
      const exp = Number(payload?.exp || 0);
      if (!exp || Date.now() >= exp * 1000) return null;
      const issuer = String(payload?.iss || '').trim();
      if (baseUrl && issuer && !issuer.startsWith(`${baseUrl}/auth/v1`)) return null;
      const email = String(payload?.email || '').trim().toLowerCase();
      if (!email) return null;
      const metadata = payload?.user_metadata && typeof payload.user_metadata === 'object'
        ? payload.user_metadata
        : {};
      return {
        email,
        metadata,
        emailVerified: true,
        provider: 'supabase_access_token_decode_fallback',
      };
    } catch (_) {
      return null;
    }
  };
};

module.exports = { createAccessTokenDecoder };
