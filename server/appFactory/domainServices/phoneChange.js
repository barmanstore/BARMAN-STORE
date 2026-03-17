const { createPhoneChangeService } = require('../../features/customerRequests');

const createPhoneChangeServices = ({ core, notificationUtils }) => {
  const { db, authSupport, configValues } = core;

  return createPhoneChangeService({
    dbGetAsync: db.dbGetAsync,
    dbAllAsync: db.dbAllAsync,
    dbRunAsync: db.dbRunAsync,
    dbTxAsync: db.dbTxAsync,
    parsePhoneInput: authSupport.parsePhoneInput,
    normalizePhone: authSupport.normalizePhone,
    createAppNotification: notificationUtils.createAppNotification,
    notifyAdmins: notificationUtils.notifyAdmins,
    PHONE_CHANGE_STATUS_PENDING: configValues.PHONE_CHANGE_STATUS_PENDING,
    PHONE_CHANGE_STATUS_APPROVED: configValues.PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED: configValues.PHONE_CHANGE_STATUS_REJECTED,
    PHONE_CHANGE_DECISION_AUTO: configValues.PHONE_CHANGE_DECISION_AUTO,
    PHONE_CHANGE_DECISION_ADMIN: configValues.PHONE_CHANGE_DECISION_ADMIN,
    PHONE_CHANGE_AUTO_APPROVE_DELAY_MS: configValues.PHONE_CHANGE_AUTO_APPROVE_DELAY_MS,
    PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS: configValues.PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS,
    PHONE_CHANGE_AUTO_BATCH_SIZE: configValues.PHONE_CHANGE_AUTO_BATCH_SIZE,
    PHONE_CHANGE_PROCESS_INTERVAL_MS: configValues.PHONE_CHANGE_PROCESS_INTERVAL_MS,
    PHONE_CHANGE_EXPIRED_REASON: configValues.PHONE_CHANGE_EXPIRED_REASON,
    IS_VERCEL_RUNTIME: configValues.IS_VERCEL_RUNTIME,
  });
};

module.exports = { createPhoneChangeServices };
