const {
  registerAuthFeature,
  registerCommunicationFeature,
  registerCatalogFeature,
  registerSalesFeature,
  registerCommerceFeature,
  registerCreditFeature,
} = require('../../features');

const buildBaseDeps = ({ core, domain }) => {
  const {
    app,
    configValues,
    requestUtils,
    db,
    http,
    constants,
    libs,
    validateCustomerProfile,
  } = core;
  const { notificationRetention, purchaseOperations, authMiddleware, notificationUtils } = domain;

  return {
    app,
    registerAuthFeature,
    registerCommunicationFeature,
    registerCatalogFeature,
    registerSalesFeature,
    registerCreditFeature,
    registerCommerceFeature,
    requireAuth: authMiddleware.requireAuth,
    requireAdmin: authMiddleware.requireAdmin,
    requireCronSecret: authMiddleware.requireCronSecret,
    requireInternalCron: authMiddleware.requireInternalCron,
    authIpLimiter: http.authIpLimiter,
    emailVerificationLimiter: http.emailVerificationLimiter,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    dbAllAsync: db.dbAllAsync,
    dbTxAsync: db.dbTxAsync,
    crypto: libs.crypto,
    path: libs.path,
    fs: libs.fs,
    validateCustomerProfile,
    normalizeVisitorSessionId: requestUtils.normalizeVisitorSessionId,
    generateVisitorSessionId: requestUtils.generateVisitorSessionId,
    sanitizeTrackedPath: requestUtils.sanitizeTrackedPath,
    sanitizeShortText: requestUtils.sanitizeShortText,
    hashVisitorIp: requestUtils.hashVisitorIp,
    getAuthUserFromRequest: authMiddleware.getAuthUserFromRequest,
    SQL_UPSERT_VISITOR_SESSION: constants.SQL_UPSERT_VISITOR_SESSION,
    VISITOR_ONLINE_WINDOW_MINUTES: configValues.VISITOR_ONLINE_WINDOW_MINUTES,
    resolveClientRequestId: requestUtils.resolveClientRequestId,
    parseJsonText: notificationUtils.parseJsonText,
    safeSerializeJson: requestUtils.safeSerializeJson,
    parseBooleanEnv: constants.parseBooleanEnv,
    purgeOldAppNotificationsAsync: notificationRetention.purgeOldAppNotificationsAsync,
    APP_NOTIFICATION_RETENTION_DAYS: configValues.APP_NOTIFICATION_RETENTION_DAYS,
    APP_NOTIFICATION_PURGE_BATCH_LIMIT: configValues.APP_NOTIFICATION_PURGE_BATCH_LIMIT,
    runPurchaseOperationNotificationsAsync: purchaseOperations.runPurchaseOperationNotificationsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED: configValues.PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
  };
};

module.exports = { buildBaseDeps };
