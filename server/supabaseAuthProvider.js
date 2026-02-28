const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const isPlaceholderValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^<[^>]+>$/.test(raw)) return true;
  return /<your-|your-project-ref|your-anon-key|your-service-role-key/i.test(raw);
};

const normalizeBaseUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw || isPlaceholderValue(raw)) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return '';
  }
};
const normalizeSecretValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw || isPlaceholderValue(raw)) return '';
  return raw;
};

const deriveSupabaseUrlFromDbUrl = (dbUrl) => {
  const raw = String(dbUrl || '').trim();
  if (!raw) return '';
  const match = raw.match(/postgres\.([a-z0-9-]+):/i);
  if (!match || !match[1]) return '';
  return `https://${match[1]}.supabase.co`;
};

const parseErrorMessage = (payload, fallback = 'Supabase Auth request failed') => {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(
    payload.error_description
    || payload.msg
    || payload.error
    || payload.message
    || fallback
  );
};

const createSupabaseAuthProvider = ({
  enabled = false,
  mode = 'hybrid',
  supabaseUrl = '',
  supabaseDbUrl = '',
  anonKey = '',
  serviceRoleKey = '',
  passwordResetRedirectTo = '',
  emailRedirectTo = '',
  allowAccessTokenDecodeFallback = false,
} = {}) => {
  const resolvedMode = String(mode || '').trim().toLowerCase() === 'strict' ? 'strict' : 'hybrid';
  const derivedUrl = deriveSupabaseUrlFromDbUrl(supabaseDbUrl);
  const baseUrl = normalizeBaseUrl(supabaseUrl) || normalizeBaseUrl(derivedUrl);
  const normalizedAnonKey = normalizeSecretValue(anonKey);
  const normalizedServiceRoleKey = normalizeSecretValue(serviceRoleKey);
  const normalizedPasswordResetRedirect = String(passwordResetRedirectTo || '').trim();
  const normalizedEmailRedirect = String(emailRedirectTo || '').trim();
  const isEnabled = Boolean(enabled);
  const clientReady = Boolean(isEnabled && baseUrl && normalizedAnonKey);
  const adminReady = Boolean(isEnabled && baseUrl && normalizedServiceRoleKey);
  const oauthReady = Boolean(isEnabled && baseUrl);
  const accessTokenDecodeFallbackAllowed = Boolean(
    oauthReady && !clientReady && allowAccessTokenDecodeFallback
  );

  const decodeAccessTokenUnsafe = ({ accessToken = '' } = {}) => {
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

  const requestAuth = async ({
    path,
    method = 'GET',
    body = null,
    useServiceRole = false,
    accessToken = '',
  }) => {
    const key = useServiceRole ? normalizedServiceRoleKey : normalizedAnonKey;
    if (!isEnabled) throw new Error('Supabase Auth is disabled');
    if (!baseUrl) throw new Error('SUPABASE_URL is required for Supabase Auth');
    if (!key) {
      const missing = useServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY';
      throw new Error(`${missing} is required for Supabase Auth`);
    }

    const headers = {
      apikey: key,
      'Content-Type': 'application/json',
      Authorization: accessToken
        ? `Bearer ${accessToken}`
        : `Bearer ${key}`,
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `Supabase Auth failed (${response.status})`));
    }
    return payload || {};
  };

  return {
    isEnabled,
    mode: resolvedMode,
    clientReady,
    adminReady,
    oauthReady,
    baseUrl,
    passwordResetRedirectTo: normalizedPasswordResetRedirect,
    emailRedirectTo: normalizedEmailRedirect,
    isStrictMode: () => resolvedMode === 'strict',
    shouldUseClientAuth: () => isEnabled && clientReady,
    shouldUseOAuth: () => oauthReady,
    shouldUseAccessTokenDecodeFallback: () => accessTokenDecodeFallbackAllowed,
    decodeAccessTokenUnsafe,
    shouldUseAdminAuth: () => isEnabled && adminReady,
    getUser: async ({ accessToken }) => requestAuth({
      path: '/auth/v1/user',
      method: 'GET',
      accessToken,
      useServiceRole: false,
    }),
    signUp: async ({ email, password, data = {} }) => requestAuth({
      path: '/auth/v1/signup',
      method: 'POST',
      useServiceRole: false,
      body: {
        email,
        password,
        data,
        ...(normalizedEmailRedirect ? { options: { emailRedirectTo: normalizedEmailRedirect } } : {}),
      },
    }),
    signInWithPassword: async ({ email, password }) => requestAuth({
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      useServiceRole: false,
      body: { email, password },
    }),
    requestEmailOtp: async ({ email, shouldCreateUser = false }) => requestAuth({
      path: '/auth/v1/otp',
      method: 'POST',
      useServiceRole: false,
      body: {
        email,
        create_user: Boolean(shouldCreateUser),
        ...(normalizedEmailRedirect ? { email_redirect_to: normalizedEmailRedirect } : {}),
      },
    }),
    verifySignInOtp: async ({ email, token = '', tokenHash = '' }) => requestAuth({
      path: '/auth/v1/verify',
      method: 'POST',
      useServiceRole: false,
      body: {
        type: 'email',
        email,
        ...(String(tokenHash || '').trim()
          ? { token_hash: String(tokenHash || '').trim() }
          : { token: String(token || '').trim() }),
      },
    }),
    resendSignupVerification: async ({ email }) => requestAuth({
      path: '/auth/v1/resend',
      method: 'POST',
      useServiceRole: false,
      body: {
        type: 'signup',
        email,
        ...(normalizedEmailRedirect ? { options: { emailRedirectTo: normalizedEmailRedirect } } : {}),
      },
    }),
    recoverPassword: async ({ email }) => requestAuth({
      path: '/auth/v1/recover',
      method: 'POST',
      useServiceRole: false,
      body: {
        email,
        ...(normalizedPasswordResetRedirect ? { options: { redirectTo: normalizedPasswordResetRedirect } } : {}),
      },
    }),
    verifyEmailOtp: async ({ email, token = '', tokenHash = '' }) => requestAuth({
      path: '/auth/v1/verify',
      method: 'POST',
      useServiceRole: false,
      body: {
        type: 'signup',
        email,
        ...(String(tokenHash || '').trim()
          ? { token_hash: String(tokenHash || '').trim() }
          : { token: String(token || '').trim() }),
      },
    }),
    updatePassword: async ({ accessToken, password }) => requestAuth({
      path: '/auth/v1/user',
      method: 'PUT',
      useServiceRole: false,
      accessToken,
      body: { password },
    }),
  };
};

module.exports = {
  createSupabaseAuthProvider,
  deriveSupabaseUrlFromDbUrl,
  parseBooleanEnv,
};
