const createBootstrapWorkers = ({
  startPhoneChangeWorker,
  startAppNotificationPurgeWorker,
  startCustomerRequestPurgeWorker,
  startPurchaseOperationsNotificationWorker,
  stopPhoneChangeWorker,
  stopAppNotificationPurgeWorker,
  stopCustomerRequestPurgeWorker,
  stopPurchaseOperationsNotificationWorker,
  env,
} = {}) => {
  const isTestEnv = String(env?.NODE_ENV || process.env.NODE_ENV || '').trim().toLowerCase() === 'test';
  const startWorkers = () => {
    if (isTestEnv) return;
    startPhoneChangeWorker();
    startAppNotificationPurgeWorker();
    startCustomerRequestPurgeWorker();
    startPurchaseOperationsNotificationWorker();
  };

  const stopWorkers = () => {
    if (isTestEnv) return;
    stopPhoneChangeWorker();
    stopAppNotificationPurgeWorker();
    stopCustomerRequestPurgeWorker();
    stopPurchaseOperationsNotificationWorker();
  };

  return { startWorkers, stopWorkers };
};

module.exports = { createBootstrapWorkers };
