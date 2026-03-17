const createAuthConfig = ({
  env,
  parseBooleanEnv,
  defaultOnlineStoreUrl,
} = {}) => {
  const SALT_ROUNDS = Number(env.BCRYPT_SALT_ROUNDS || 10);
  const VISITOR_ONLINE_WINDOW_MINUTES = Math.max(1, Number(env.VISITOR_ONLINE_WINDOW_MINUTES || 2));

  const AUTH_FLOW_MODE = String(env.AUTH_FLOW_MODE || 'manual').trim().toLowerCase() === 'provider'
    ? 'provider'
    : 'manual';
  const PASSWORD_RESET_MODE = String(
    env.PASSWORD_RESET_MODE || (AUTH_FLOW_MODE === 'provider' ? 'otp' : 'admin')
  ).trim().toLowerCase() === 'otp'
    ? 'otp'
    : 'admin';
  const PHONE_VERIFICATION_REQUIRED = parseBooleanEnv(env.PHONE_VERIFICATION_REQUIRED, false);
  const OTP_PROVIDER = String(env.OTP_PROVIDER || 'twilio').trim().toLowerCase();
  const OTP_TTL_SECONDS = Math.max(60, Number(env.OTP_TTL_SECONDS || 300));
  const OTP_MAX_ATTEMPTS = Math.max(1, Number(env.OTP_MAX_ATTEMPTS || 5));
  const AUTH_LOGIN_OTP_EXPOSE_CODE_REQUESTED = parseBooleanEnv(
    env.AUTH_LOGIN_OTP_EXPOSE_CODE,
    env.NODE_ENV === 'test'
  );
  const AUTH_LOGIN_OTP_EXPOSE_CODE = env.NODE_ENV === 'production'
    ? false
    : AUTH_LOGIN_OTP_EXPOSE_CODE_REQUESTED;
  const OTP_DELIVERY_MODE = String(
    env.OTP_DELIVERY_MODE || (AUTH_FLOW_MODE === 'provider' ? 'auto' : 'manual')
  ).trim().toLowerCase() === 'auto'
    ? 'auto'
    : 'manual';
  const EMAIL_DELIVERY_MODE = String(env.EMAIL_DELIVERY_MODE || 'manual').trim().toLowerCase() === 'auto'
    ? 'auto'
    : 'manual';
  const EMAIL_VERIFICATION_MODE = String(env.EMAIL_VERIFICATION_MODE || 'stub').trim().toLowerCase() === 'provider'
    ? 'provider'
    : 'stub';
  const WHATSAPP_DELIVERY_MODE = String(env.WHATSAPP_DELIVERY_MODE || 'manual').trim().toLowerCase() === 'auto'
    ? 'auto'
    : 'manual';
  const WHATSAPP_PROVIDER = String(env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase();
  const SUPABASE_AUTH_ENABLED = parseBooleanEnv(env.SUPABASE_AUTH_ENABLED, false);
  const SUPABASE_AUTH_MODE = String(env.SUPABASE_AUTH_MODE || 'hybrid').trim().toLowerCase() === 'strict'
    ? 'strict'
    : 'hybrid';
  const SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK = parseBooleanEnv(
    env.SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
    false
  );
  const SUPABASE_EMAIL_VERIFY_REDIRECT = String(env.SUPABASE_EMAIL_VERIFY_REDIRECT || '').trim();
  const EMAIL_VERIFY_BASE_URL = String(env.EMAIL_VERIFY_BASE_URL || 'http://localhost/login').trim();
  const PHONE_VERIFY_BASE_URL = String(env.PHONE_VERIFY_BASE_URL || `${defaultOnlineStoreUrl}/login`).trim();
  const EMAIL_VERIFY_TTL_SECONDS = Math.max(60, Number(env.EMAIL_VERIFY_TTL_SECONDS || 900));
  const EMAIL_VERIFY_MAX_ATTEMPTS = Math.max(1, Number(env.EMAIL_VERIFY_MAX_ATTEMPTS || 5));
  const PHONE_VERIFY_TTL_SECONDS = Math.max(60, Number(env.PHONE_VERIFY_TTL_SECONDS || 900));
  const PHONE_VERIFY_MAX_ATTEMPTS = Math.max(1, Number(env.PHONE_VERIFY_MAX_ATTEMPTS || 5));
  const OTP_VERIFY_SESSION_TTL_SECONDS = Math.max(60, Number(env.OTP_VERIFY_SESSION_TTL_SECONDS || 900));
  const CREDIT_ENTRY_DEDUP_WINDOW_MS = Math.max(0, Number(env.CREDIT_ENTRY_DEDUP_WINDOW_MS || 15000));

  return {
    SALT_ROUNDS,
    VISITOR_ONLINE_WINDOW_MINUTES,
    AUTH_FLOW_MODE,
    PASSWORD_RESET_MODE,
    PHONE_VERIFICATION_REQUIRED,
    OTP_PROVIDER,
    OTP_TTL_SECONDS,
    OTP_MAX_ATTEMPTS,
    AUTH_LOGIN_OTP_EXPOSE_CODE,
    OTP_DELIVERY_MODE,
    EMAIL_DELIVERY_MODE,
    EMAIL_VERIFICATION_MODE,
    WHATSAPP_DELIVERY_MODE,
    WHATSAPP_PROVIDER,
    SUPABASE_AUTH_ENABLED,
    SUPABASE_AUTH_MODE,
    SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
    SUPABASE_EMAIL_VERIFY_REDIRECT,
    EMAIL_VERIFY_BASE_URL,
    PHONE_VERIFY_BASE_URL,
    EMAIL_VERIFY_TTL_SECONDS,
    EMAIL_VERIFY_MAX_ATTEMPTS,
    PHONE_VERIFY_TTL_SECONDS,
    PHONE_VERIFY_MAX_ATTEMPTS,
    OTP_VERIFY_SESSION_TTL_SECONDS,
    CREDIT_ENTRY_DEDUP_WINDOW_MS,
  };
};

module.exports = { createAuthConfig };
