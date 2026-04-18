const {
  createNotificationRetentionUtils,
  createNotificationRetentionWorker,
} = require('../../features/notifications');
const {
  createCustomerRequestRetentionUtils,
  createCustomerRequestRetentionWorker,
} = require('../../features/customerRequests');

const createRetentionSupport = ({
  dbRunAsync,
  APP_NOTIFICATION_RETENTION_DAYS,
  APP_NOTIFICATION_PURGE_BATCH_LIMIT,
  APP_NOTIFICATION_PURGE_INTERVAL_MS,
  PHONE_CHANGE_STATUS_APPROVED,
  PHONE_CHANGE_STATUS_REJECTED,
  CUSTOMER_REQUEST_RETENTION_DAYS,
  CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
  CUSTOMER_REQUEST_PURGE_INTERVAL_MS,
  IS_VERCEL_RUNTIME,
} = {}) => {
  const { purgeOldAppNotificationsAsync, runAppNotificationPurge } =
    createNotificationRetentionUtils({
      dbRunAsync,
      APP_NOTIFICATION_RETENTION_DAYS,
      APP_NOTIFICATION_PURGE_BATCH_LIMIT,
    });
  const { start: startAppNotificationPurgeWorker, stop: stopAppNotificationPurgeWorker } =
    createNotificationRetentionWorker({
      runAppNotificationPurge,
      intervalMs: APP_NOTIFICATION_PURGE_INTERVAL_MS,
      isVercelRuntime: IS_VERCEL_RUNTIME,
    });

  const { purgeOldCustomerRequestsAsync, runCustomerRequestPurge } =
    createCustomerRequestRetentionUtils({
      dbRunAsync,
      PHONE_CHANGE_STATUS_APPROVED,
      PHONE_CHANGE_STATUS_REJECTED,
      CUSTOMER_REQUEST_RETENTION_DAYS,
      CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
    });
  const { start: startCustomerRequestPurgeWorker, stop: stopCustomerRequestPurgeWorker } =
    createCustomerRequestRetentionWorker({
      runCustomerRequestPurge,
      intervalMs: CUSTOMER_REQUEST_PURGE_INTERVAL_MS,
      isVercelRuntime: IS_VERCEL_RUNTIME,
    });

  return {
    purgeOldAppNotificationsAsync,
    runAppNotificationPurge,
    startAppNotificationPurgeWorker,
    stopAppNotificationPurgeWorker,
    purgeOldCustomerRequestsAsync,
    runCustomerRequestPurge,
    startCustomerRequestPurgeWorker,
    stopCustomerRequestPurgeWorker,
  };
};

module.exports = { createRetentionSupport };
