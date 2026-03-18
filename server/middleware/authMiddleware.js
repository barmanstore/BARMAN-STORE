const { createSupabaseAuthHelpers } = require('./auth/supabaseHelpers');
const { createLocalAuthSync } = require('./auth/localSync');
const { createRequestAuth } = require('./auth/requestAuth');
const { createAuthGuards } = require('./auth/guards');
const { userHasCapability } = require('./auth/capabilities');

const createAuthMiddleware = (deps) => {
  const {
    parsePhoneInput,
    normalizeEmail,
    dbGetAsync,
    dbRunAsync,
    hashPassword,
    generateTemporaryPassword,
    getBearerTokenFromRequest,
    verifyToken,
    sanitizeUser,
    supabaseAuthProvider,
    PHONE_CHANGE_CRON_SECRET,
    PHONE_CHANGE_CRON_ENABLED,
  } = deps;

  const supabaseHelpers = createSupabaseAuthHelpers({ supabaseAuthProvider, parsePhoneInput });
  const localSync = createLocalAuthSync({
    normalizeEmail,
    dbGetAsync,
    dbRunAsync,
    hashPassword,
    generateTemporaryPassword,
    getVerifiedPhoneFromMetadata: supabaseHelpers.getVerifiedPhoneFromMetadata,
  });
  const requestAuth = createRequestAuth({
    getBearerTokenFromRequest,
    verifyToken,
    sanitizeUser,
    dbGetAsync,
    normalizeEmail,
    supabaseAuthProvider,
    isSupabaseEmailAuthUsable: supabaseHelpers.isSupabaseEmailAuthUsable,
    getSupabaseUserMetadata: supabaseHelpers.getSupabaseUserMetadata,
    isSupabaseEmailVerified: supabaseHelpers.isSupabaseEmailVerified,
    syncLocalUserFromSupabaseAuth: localSync.syncLocalUserFromSupabaseAuth,
  });
  const guards = createAuthGuards({
    getAuthUserFromRequest: requestAuth.getAuthUserFromRequest,
    PHONE_CHANGE_CRON_SECRET,
    PHONE_CHANGE_CRON_ENABLED,
  });

  return {
    ...supabaseHelpers,
    ...localSync,
    ...requestAuth,
    ...guards,
    userHasCapability,
  };
};

module.exports = { createAuthMiddleware };
