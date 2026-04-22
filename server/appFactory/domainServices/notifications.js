const { createCommerceNotificationUtils } = require('../../features/commerce');
const {
  createNotificationUtils,
  createVerificationUtils,
  createContactVerificationUtils,
} = require('../../features/notifications');
const { PO_PAYMENT_UNPAID } = require('../../features/purchase');

const createNotificationServices = ({ core, domainCore }) => {
  const { db, authSupport, providers, requestUtils, constants, configValues } = core;
  const { purchaseHelpers, contactUtils } = domainCore;

  const notificationUtils = createNotificationUtils({
    dbRunAsync: db.dbRunAsync,
    dbGetAsync: db.dbGetAsync,
    dbAllAsync: db.dbAllAsync,
    normalizeClientRequestId: requestUtils.normalizeClientRequestId,
    safeSerializeJson: requestUtils.safeSerializeJson,
    isUniqueViolationError: constants.isUniqueViolationError,
  });

  const commerceNotifications = createCommerceNotificationUtils({
    dbGetAsync: db.dbGetAsync,
    dbAllAsync: db.dbAllAsync,
    normalizeTransactionDate: purchaseHelpers.normalizeTransactionDate,
    normalizePoPaymentStatus: purchaseHelpers.normalizePoPaymentStatus,
    PO_PAYMENT_UNPAID,
    createNotificationEvent: notificationUtils.createNotificationEvent,
    updateNotificationEventStatus: notificationUtils.updateNotificationEventStatus,
    notificationService: providers.notificationService,
    whatsappProvider: providers.whatsappProvider,
    WHATSAPP_DELIVERY_MODE: configValues.WHATSAPP_DELIVERY_MODE,
    getDistributorWhatsappPhone: contactUtils.getDistributorWhatsappPhone,
  });

  const verificationUtils = createVerificationUtils({
    dbRunAsync: db.dbRunAsync,
    notificationService: providers.notificationService,
    createNotificationEvent: notificationUtils.createNotificationEvent,
    updateNotificationEventStatus: notificationUtils.updateNotificationEventStatus,
    emailVerificationProvider: providers.emailVerificationProvider,
    whatsappProvider: providers.whatsappProvider,
    generateEmailVerificationToken: authSupport.generateEmailVerificationToken,
    hashVerificationToken: authSupport.hashVerificationToken,
    generatePhoneVerificationCode: authSupport.generatePhoneVerificationCode,
    hashOpaqueToken: authSupport.hashOpaqueToken,
    EMAIL_VERIFY_TTL_SECONDS: configValues.EMAIL_VERIFY_TTL_SECONDS,
    EMAIL_VERIFY_MAX_ATTEMPTS: configValues.EMAIL_VERIFY_MAX_ATTEMPTS,
    PHONE_VERIFY_TTL_SECONDS: configValues.PHONE_VERIFY_TTL_SECONDS,
    PHONE_VERIFY_MAX_ATTEMPTS: configValues.PHONE_VERIFY_MAX_ATTEMPTS,
    EMAIL_DELIVERY_MODE: configValues.EMAIL_DELIVERY_MODE,
    WHATSAPP_DELIVERY_MODE: configValues.WHATSAPP_DELIVERY_MODE,
    EMAIL_VERIFY_BASE_URL: configValues.EMAIL_VERIFY_BASE_URL,
    PHONE_VERIFY_BASE_URL: configValues.PHONE_VERIFY_BASE_URL,
  });

  const contactVerificationUtils = createContactVerificationUtils({
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
  });

  return {
    notificationUtils,
    commerceNotifications,
    verificationUtils,
    contactVerificationUtils,
  };
};

module.exports = { createNotificationServices };
