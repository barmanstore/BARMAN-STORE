const { createBootstrapWorkers } = require('./core/bootstrap/workers');
const { createCore } = require('./appFactory/createCore');
const { createDomainServices } = require('./appFactory/createDomainServices');
const { registerFeatures } = require('./appFactory/registerFeatures');

const createAppContext = () => {
  const core = createCore();
  const domain = createDomainServices({ core });

  registerFeatures({ core, domain });

  const { startWorkers, stopWorkers } = createBootstrapWorkers({
    startPhoneChangeWorker: domain.phoneChangeService.startPhoneChangeWorker,
    startAppNotificationPurgeWorker: domain.notificationRetentionWorker.start,
    startCustomerRequestPurgeWorker: domain.customerRequestRetentionWorker.start,
    startPurchaseOperationsNotificationWorker: domain.purchaseOperations.startPurchaseOperationsNotificationWorker,
    startCatalogBulkJobWorker: domain.catalogBulkJobs?.startBulkJobRunner,
    stopPhoneChangeWorker: domain.phoneChangeService.stopPhoneChangeWorker,
    stopAppNotificationPurgeWorker: domain.notificationRetentionWorker.stop,
    stopCustomerRequestPurgeWorker: domain.customerRequestRetentionWorker.stop,
    stopPurchaseOperationsNotificationWorker: domain.purchaseOperations.stopPurchaseOperationsNotificationWorker,
    stopCatalogBulkJobWorker: domain.catalogBulkJobs?.stopBulkJobRunner,
    env: process.env,
  });

  return {
    app: core.app,
    runtime: {
      port: core.configValues.PORT,
      isVercelRuntime: core.configValues.IS_VERCEL_RUNTIME,
      ensureRuntimeReady: core.db.ensureRuntimeReady,
      startWorkers,
      stopWorkers,
      closePostgresScaffold: core.db.closePostgresScaffold,
    },
  };
};

module.exports = { createAppContext };
