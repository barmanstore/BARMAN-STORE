const { createOtpProvider } = require('../../otpProvider');
const { createEmailVerificationProvider } = require('../../emailVerificationProvider');
const { createNotificationService } = require('../../notificationService');
const { createWhatsappProvider } = require('../../whatsappProvider');
const { createSupabaseAuthProvider } = require('../../supabaseAuthProvider');

const createBootstrapProviders = ({ config, env } = {}) => {
  const {
    OTP_PROVIDER,
    EMAIL_VERIFICATION_MODE,
    WHATSAPP_PROVIDER,
    BUSINESS_NAME,
    DEFAULT_COUNTRY_CODE,
    SUPABASE_AUTH_ENABLED,
    SUPABASE_AUTH_MODE,
    SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
    SUPABASE_EMAIL_VERIFY_REDIRECT,
    defaultOnlineStoreUrl,
  } = config;

  const otpProvider = createOtpProvider({
    OTP_PROVIDER,
    OTP_API_KEY: env.OTP_API_KEY,
    OTP_API_SECRET: env.OTP_API_SECRET,
    OTP_SENDER_ID: env.OTP_SENDER_ID,
  });

  const emailVerificationProvider = createEmailVerificationProvider({
    EMAIL_VERIFICATION_MODE,
    EMAIL_API_KEY: env.EMAIL_API_KEY,
    EMAIL_API_SECRET: env.EMAIL_API_SECRET,
    EMAIL_FROM: env.EMAIL_FROM,
  });

  const whatsappProvider = createWhatsappProvider({
    WHATSAPP_PROVIDER,
    WHATSAPP_API_KEY: env.WHATSAPP_API_KEY,
    WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID,
  });

  const notificationService = createNotificationService({
    businessName: BUSINESS_NAME,
    onlineStoreUrl: defaultOnlineStoreUrl,
    defaultCountryCode: DEFAULT_COUNTRY_CODE,
  });

  const supabaseAuthProvider = createSupabaseAuthProvider({
    enabled: SUPABASE_AUTH_ENABLED,
    mode: SUPABASE_AUTH_MODE,
    supabaseUrl: env.SUPABASE_URL,
    supabaseDbUrl: env.SUPABASE_DB_URL || env.DATABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    emailRedirectTo: SUPABASE_EMAIL_VERIFY_REDIRECT,
    allowAccessTokenDecodeFallback: SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
  });

  return {
    otpProvider,
    emailVerificationProvider,
    whatsappProvider,
    notificationService,
    supabaseAuthProvider,
  };
};

module.exports = { createBootstrapProviders };
