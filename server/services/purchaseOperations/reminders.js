const { createPurchaseOperationsReminderQueries } = require('./reminders/queries');
const { createPurchaseOperationsReminderBuilders } = require('./reminders/builders');
const { createPurchaseOperationsReminderDispatch } = require('./reminders/dispatch');

const createPurchaseOperationsReminders = (deps) => {
  const queries = createPurchaseOperationsReminderQueries(deps);
  const builders = createPurchaseOperationsReminderBuilders(deps);
  const dispatch = createPurchaseOperationsReminderDispatch(deps);

  const loadPurchaseOperationAlertsAsync = async ({ date = null, distributorId = null } = {}) => {
    const data = await queries.loadPurchaseOperationReminderDataAsync({
      date,
      distributorId,
    });
    return builders.buildPurchaseOperationAlerts(data);
  };

  const runPurchaseOperationNotificationsAsync = async ({
    date = null,
    distributorId = null,
    createdBy = null,
  } = {}) => {
    const alertState = await loadPurchaseOperationAlertsAsync({
      date,
      distributorId,
    });
    const emitted = await dispatch.emitPurchaseOperationNotificationsAsync({
      todayKey: alertState.todayKey,
      reminders: alertState.reminders,
      payables: alertState.payables,
      createdBy,
    });
    return {
      today: alertState.todayKey,
      tomorrow: alertState.tomorrowKey,
      reminders_scanned: Number(alertState.reminders?.length || 0),
      payables_scanned: Number(
        alertState.payables?.filter((entry) => entry.payment_due_date <= alertState.todayKey)
          .length || 0
      ),
      ...emitted,
    };
  };

  return {
    saveDistributorPurchaseReminderAsync: dispatch.saveDistributorPurchaseReminderAsync,
    emitPurchaseOperationNotificationsAsync: dispatch.emitPurchaseOperationNotificationsAsync,
    loadPurchaseOperationAlertsAsync,
    runPurchaseOperationNotificationsAsync,
  };
};

module.exports = { createPurchaseOperationsReminders };
