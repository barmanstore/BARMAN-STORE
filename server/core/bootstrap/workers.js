const createBootstrapWorkers = ({
  startPhoneChangeWorker,
  startAppNotificationPurgeWorker,
  startCustomerRequestPurgeWorker,
  startPurchaseOperationsNotificationWorker,
  startCatalogBulkJobWorker,
  stopPhoneChangeWorker,
  stopAppNotificationPurgeWorker,
  stopCustomerRequestPurgeWorker,
  stopPurchaseOperationsNotificationWorker,
  stopCatalogBulkJobWorker,
  env,
} = {}) => {
  const isTestEnv = String(env?.NODE_ENV || process.env.NODE_ENV || '').trim().toLowerCase() === 'test';
  const startWorkers = () => {
    if (isTestEnv) return;
    startPhoneChangeWorker();
    startAppNotificationPurgeWorker();
    startCustomerRequestPurgeWorker();
    startPurchaseOperationsNotificationWorker();
    startCatalogBulkJobWorker();
  };

  const stopWorkers = () => {
    if (isTestEnv) return;
    stopPhoneChangeWorker();
    stopAppNotificationPurgeWorker();
    stopCustomerRequestPurgeWorker();
    stopPurchaseOperationsNotificationWorker();
    stopCatalogBulkJobWorker();
  };

  return { startWorkers, stopWorkers };
};

module.exports = { createBootstrapWorkers };
