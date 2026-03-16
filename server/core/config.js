const createServerConfig = ({
  env,
  baseDir,
  path,
  parseBooleanEnv,
  normalizeExecutionMode,
  defaultOnlineStoreUrl,
} = {}) => {
  const PORT = env.PORT || 5000;
  const DB_EXECUTION_MODE = normalizeExecutionMode(env.DB_EXECUTION_MODE || env.DB_CLIENT || 'postgres');
  const UPLOADS_DIR = env.UPLOADS_DIR || path.join(baseDir, 'uploads');
  const PROFILE_UPLOAD_DIR = path.join(UPLOADS_DIR, 'profiles');
  const POSTGRES_MIGRATIONS_DIR = env.POSTGRES_MIGRATIONS_DIR || path.join(baseDir, '..', 'supabase', 'migrations');
  const IS_VERCEL_RUNTIME = parseBooleanEnv(env.VERCEL, false) || env.NOW_REGION;
  const CANONICAL_HOST = String(env.CANONICAL_HOST || 'barmanstore.vercel.app').trim().toLowerCase();
  const LEGACY_HOSTS = new Set(
    String(env.LEGACY_HOSTS || 'barman-store.vercel.app')
      .split(',')
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const PURCHASE_STOCK_CAP_RAW = Number(env.PURCHASE_STOCK_CAP || 50);
  const PURCHASE_STOCK_CAP = Number.isFinite(PURCHASE_STOCK_CAP_RAW) && PURCHASE_STOCK_CAP_RAW >= 0
    ? PURCHASE_STOCK_CAP_RAW
    : 50;

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

  const PHONE_CHANGE_STATUS_PENDING = 'PENDING_VALIDATION';
  const PHONE_CHANGE_STATUS_APPROVED = 'APPROVED';
  const PHONE_CHANGE_STATUS_REJECTED = 'REJECTED';
  const PHONE_CHANGE_DECISION_AUTO = 'AUTO';
  const PHONE_CHANGE_DECISION_ADMIN = 'ADMIN';
  const PHONE_CHANGE_EXPIRED_REASON = 'Admin review window expired';
  const PHONE_CHANGE_CRON_SECRET = String(
    env.PHONE_CHANGE_CRON_SECRET || env.CRON_SECRET || ''
  ).trim();
  const PHONE_CHANGE_CRON_ENABLED = parseBooleanEnv(
    env.PHONE_CHANGE_CRON_ENABLED,
    Boolean(PHONE_CHANGE_CRON_SECRET)
  );
  const PHONE_CHANGE_MIN_AUTO_APPROVE_DELAY_MS = env.NODE_ENV === 'test' ? 500 : 5 * 60 * 1000;
  const PHONE_CHANGE_AUTO_APPROVE_DELAY_MS = Math.max(
    PHONE_CHANGE_MIN_AUTO_APPROVE_DELAY_MS,
    Number(env.PHONE_CHANGE_AUTO_APPROVE_DELAY_MS || 60 * 60 * 1000)
  );
  const PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS_RAW = Number(env.PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS || 5);
  const PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS = env.NODE_ENV === 'test'
    ? Math.max(0, PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS_RAW)
    : Math.max(1, Math.min(14, PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS_RAW));
  const PHONE_CHANGE_PROCESS_INTERVAL_MS = Math.max(
    30 * 1000,
    Number(env.PHONE_CHANGE_PROCESS_INTERVAL_MS || 60 * 1000)
  );
  const PHONE_CHANGE_AUTO_BATCH_SIZE = Math.max(
    1,
    Math.min(100, Number(env.PHONE_CHANGE_AUTO_BATCH_SIZE || 25))
  );

  const PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED = parseBooleanEnv(
    env.PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    true
  );
  const PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS = Math.max(
    5 * 60 * 1000,
    Number(env.PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS || 60 * 60 * 1000)
  );
  const APP_NOTIFICATION_RETENTION_DAYS = Math.max(
    1,
    Math.min(365, Number(env.APP_NOTIFICATION_RETENTION_DAYS || 60))
  );
  const APP_NOTIFICATION_PURGE_BATCH_LIMIT = Math.max(
    1,
    Math.min(50000, Number(env.APP_NOTIFICATION_PURGE_BATCH_LIMIT || 2000))
  );
  const APP_NOTIFICATION_PURGE_INTERVAL_MS = Math.max(
    5 * 60 * 1000,
    Number(env.APP_NOTIFICATION_PURGE_INTERVAL_MS || 6 * 60 * 60 * 1000)
  );
  const CUSTOMER_REQUEST_RETENTION_DAYS = Math.max(
    1,
    Math.min(365, Number(env.CUSTOMER_REQUEST_RETENTION_DAYS || 60))
  );
  const CUSTOMER_REQUEST_PURGE_BATCH_LIMIT = Math.max(
    1,
    Math.min(50000, Number(env.CUSTOMER_REQUEST_PURGE_BATCH_LIMIT || 2000))
  );
  const CUSTOMER_REQUEST_PURGE_INTERVAL_MS = Math.max(
    5 * 60 * 1000,
    Number(env.CUSTOMER_REQUEST_PURGE_INTERVAL_MS || 6 * 60 * 60 * 1000)
  );

  const BUSINESS_NAME = String(env.BUSINESS_NAME || 'BARMAN STORE').trim() || 'BARMAN STORE';
  const DEFAULT_COUNTRY_CODE = String(env.DEFAULT_COUNTRY_CODE || '91').trim() || '91';
  const AUTH_TOKEN_SECRET = env.AUTH_TOKEN_SECRET || 'barman-store-local-secret';
  const TOKEN_TTL_MS = Number(env.AUTH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);

  if (env.NODE_ENV === 'production' && !env.AUTH_TOKEN_SECRET) {
    throw new Error('AUTH_TOKEN_SECRET must be set in production');
  }

  return {
    PORT,
    DB_EXECUTION_MODE,
    UPLOADS_DIR,
    PROFILE_UPLOAD_DIR,
    POSTGRES_MIGRATIONS_DIR,
    IS_VERCEL_RUNTIME,
    CANONICAL_HOST,
    LEGACY_HOSTS,
    PURCHASE_STOCK_CAP,
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
    PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_DECISION_ADMIN,
    PHONE_CHANGE_EXPIRED_REASON,
    PHONE_CHANGE_CRON_SECRET,
    PHONE_CHANGE_CRON_ENABLED,
    PHONE_CHANGE_AUTO_APPROVE_DELAY_MS,
    PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS,
    PHONE_CHANGE_PROCESS_INTERVAL_MS,
    PHONE_CHANGE_AUTO_BATCH_SIZE,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
    APP_NOTIFICATION_RETENTION_DAYS,
    APP_NOTIFICATION_PURGE_BATCH_LIMIT,
    APP_NOTIFICATION_PURGE_INTERVAL_MS,
    CUSTOMER_REQUEST_RETENTION_DAYS,
    CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
    CUSTOMER_REQUEST_PURGE_INTERVAL_MS,
    BUSINESS_NAME,
    DEFAULT_COUNTRY_CODE,
    AUTH_TOKEN_SECRET,
    TOKEN_TTL_MS,
  };
};

module.exports = { createServerConfig };
