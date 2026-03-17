const { createAuthMiddleware } = require('../../middleware/authMiddleware');
const { createDistributorUtils } = require('../../features/commerce');
const { sanitizeUser } = require('../../features/auth');

const createAuthServices = ({ core }) => {
  const { db, authSupport, providers, configValues } = core;

  const authMiddleware = createAuthMiddleware({
    parsePhoneInput: authSupport.parsePhoneInput,
    normalizeEmail: authSupport.normalizeEmail,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    hashPassword: authSupport.hashPassword,
    generateTemporaryPassword: authSupport.generateTemporaryPassword,
    getBearerTokenFromRequest: authSupport.getBearerTokenFromRequest,
    verifyToken: authSupport.verifyToken,
    sanitizeUser,
    supabaseAuthProvider: providers.supabaseAuthProvider,
    PHONE_CHANGE_CRON_SECRET: configValues.PHONE_CHANGE_CRON_SECRET,
    PHONE_CHANGE_CRON_ENABLED: configValues.PHONE_CHANGE_CRON_ENABLED,
  });

  const distributorUtils = createDistributorUtils({
    dbGetAsync: db.dbGetAsync,
  });

  return {
    authMiddleware,
    distributorUtils,
    sanitizeUser,
  };
};

module.exports = { createAuthServices };
