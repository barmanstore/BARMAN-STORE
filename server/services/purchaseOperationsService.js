const { createPurchaseOperationsReminders } = require('./purchaseOperations/reminders');
const { createPurchaseOperationsRollups } = require('./purchaseOperations/rollups');
const { createPurchaseOperationsSummary } = require('./purchaseOperations/summary');
const { createPurchaseOperationsWorker } = require('./purchaseOperations/worker');

const createPurchaseOperationsService = (deps) => {
  const reminders = createPurchaseOperationsReminders(deps);
  const rollups = createPurchaseOperationsRollups(deps);
  const summary = createPurchaseOperationsSummary({ ...deps, ...rollups });
  const worker = createPurchaseOperationsWorker({ ...deps, ...reminders, ...summary });

  return {
    runPurchaseOperationNotificationsAsync: reminders.runPurchaseOperationNotificationsAsync,
    handlePurchaseOperationsSummary: summary.handlePurchaseOperationsSummary,
    startPurchaseOperationsNotificationWorker: worker.startPurchaseOperationsNotificationWorker,
    stopPurchaseOperationsNotificationWorker: worker.stopPurchaseOperationsNotificationWorker,
    saveDistributorPurchaseReminderAsync: reminders.saveDistributorPurchaseReminderAsync,
  };
};

module.exports = { createPurchaseOperationsService };
