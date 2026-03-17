const {
  createNotificationRetentionUtils,
  createNotificationRetentionWorker,
} = require('../../features/notifications');
const {
  createCustomerRequestRetentionUtils,
  createCustomerRequestRetentionWorker,
} = require('../../features/customerRequests');

const createRetentionServices = ({ core }) => {
  const { db, configValues } = core;

  const notificationRetention = createNotificationRetentionUtils({
    dbRunAsync: db.dbRunAsync,
    APP_NOTIFICATION_RETENTION_DAYS: configValues.APP_NOTIFICATION_RETENTION_DAYS,
    APP_NOTIFICATION_PURGE_BATCH_LIMIT: configValues.APP_NOTIFICATION_PURGE_BATCH_LIMIT,
  });
  const notificationRetentionWorker = createNotificationRetentionWorker({
    runAppNotificationPurge: notificationRetention.runAppNotificationPurge,
    intervalMs: configValues.APP_NOTIFICATION_PURGE_INTERVAL_MS,
    isVercelRuntime: configValues.IS_VERCEL_RUNTIME,
  });

  const customerRequestRetention = createCustomerRequestRetentionUtils({
    dbRunAsync: db.dbRunAsync,
    PHONE_CHANGE_STATUS_APPROVED: configValues.PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED: configValues.PHONE_CHANGE_STATUS_REJECTED,
    CUSTOMER_REQUEST_RETENTION_DAYS: configValues.CUSTOMER_REQUEST_RETENTION_DAYS,
    CUSTOMER_REQUEST_PURGE_BATCH_LIMIT: configValues.CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
  });
  const customerRequestRetentionWorker = createCustomerRequestRetentionWorker({
    runCustomerRequestPurge: customerRequestRetention.runCustomerRequestPurge,
    intervalMs: configValues.CUSTOMER_REQUEST_PURGE_INTERVAL_MS,
    isVercelRuntime: configValues.IS_VERCEL_RUNTIME,
  });

  return {
    notificationRetention,
    notificationRetentionWorker,
    customerRequestRetention,
    customerRequestRetentionWorker,
  };
};

module.exports = { createRetentionServices };
