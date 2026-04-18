const {
  deriveSupabaseUrlFromDbUrl,
  normalizeBaseUrl,
  normalizeSecretValue,
  parseBooleanEnv,
} = require('./supabaseAuth/utils');
const { createAccessTokenDecoder } = require('./supabaseAuth/accessTokenFallback');
const { createRequestAuth } = require('./supabaseAuth/requestAuth');

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
  const resolvedMode =
    String(mode || '')
      .trim()
      .toLowerCase() === 'strict'
      ? 'strict'
      : 'hybrid';
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

  const decodeAccessTokenUnsafe = createAccessTokenDecoder({
    accessTokenDecodeFallbackAllowed,
    baseUrl,
  });
  const requestAuth = createRequestAuth({
    isEnabled,
    baseUrl,
    normalizedAnonKey,
    normalizedServiceRoleKey,
  });

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
    getUser: async ({ accessToken }) =>
      requestAuth({
        path: '/auth/v1/user',
        method: 'GET',
        accessToken,
        useServiceRole: false,
      }),
    signUp: async ({ email, password, data = {} }) =>
      requestAuth({
        path: '/auth/v1/signup',
        method: 'POST',
        useServiceRole: false,
        body: {
          email,
          password,
          data,
          ...(normalizedEmailRedirect
            ? { options: { emailRedirectTo: normalizedEmailRedirect } }
            : {}),
        },
      }),
    signInWithPassword: async ({ email, password }) =>
      requestAuth({
        path: '/auth/v1/token?grant_type=password',
        method: 'POST',
        useServiceRole: false,
        body: { email, password },
      }),
    requestEmailOtp: async ({ email, shouldCreateUser = false }) =>
      requestAuth({
        path: '/auth/v1/otp',
        method: 'POST',
        useServiceRole: false,
        body: {
          email,
          create_user: Boolean(shouldCreateUser),
          ...(normalizedEmailRedirect ? { email_redirect_to: normalizedEmailRedirect } : {}),
        },
      }),
    verifySignInOtp: async ({ email, token = '', tokenHash = '' }) =>
      requestAuth({
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
    resendSignupVerification: async ({ email }) =>
      requestAuth({
        path: '/auth/v1/resend',
        method: 'POST',
        useServiceRole: false,
        body: {
          type: 'signup',
          email,
          ...(normalizedEmailRedirect
            ? { options: { emailRedirectTo: normalizedEmailRedirect } }
            : {}),
        },
      }),
    recoverPassword: async ({ email }) =>
      requestAuth({
        path: '/auth/v1/recover',
        method: 'POST',
        useServiceRole: false,
        body: {
          email,
          ...(normalizedPasswordResetRedirect
            ? { options: { redirectTo: normalizedPasswordResetRedirect } }
            : {}),
        },
      }),
    verifyEmailOtp: async ({ email, token = '', tokenHash = '' }) =>
      requestAuth({
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
    updatePassword: async ({ accessToken, password }) =>
      requestAuth({
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
