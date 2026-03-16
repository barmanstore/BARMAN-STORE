const createPurchaseOperationsWorker = (deps) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    normalizeTransactionDate,
    addDaysToDateKey,
    normalizeBooleanFlag,
    getDistributorOrderScheduleDay,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    getWeekdayFromDateKey,
    parseDistributorProductsSupplied,
    mergeDistributorProductKnowledge,
    getDistributorPaymentPlan,
    computeAverageDays,
    computeAverageGapDays,
    computeStdDev,
    deriveStockoutRisk,
    getPurchaseOrderPaymentAnchorDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getDaysBetweenDateKeys,
    pickLatestDateKey,
    pickEarliestDateKey,
    normalizePoPaymentStatus,
    getEffectivePurchaseDueDateKey,
    resolveRollupRange,
    buildDateSeries,
    normalizePoLifecycleStatus,
    resolveInsightDateRange,
    notifyAdmins,
    PURCHASE_ACTION_ROLLUP_FIELDS,
    PURCHASE_ACTION_STATUS_MAP,
    PURCHASE_WEEKDAYS,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
    derivePurchaseNextAction,
    buildPurchaseActionRollupsAsync,
    persistPurchaseAnalyticsSnapshotsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
    IS_VERCEL_RUNTIME,
    runPurchaseOperationNotificationsAsync,
    collectPurchaseAnalyticsSnapshotsAsync,
  } = deps;

  let purchaseOperationsNotificationTimer = null;

  const runPurchaseOperationsNotificationWorker = async () => {
    let result = null;
    try {
      if (PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED) {
        result = await runPurchaseOperationNotificationsAsync();
        const totalNotifications = Number(result?.reminder_notifications || 0) + Number(result?.payment_notifications || 0);
        if (totalNotifications > 0) {
          console.log(
            `[PURCHASE_OPS] Generated ${totalNotifications} purchase notifications for ${result.today}`
          );
        }
      }
      await collectPurchaseAnalyticsSnapshotsAsync();
      return result;
    } catch (error) {
      console.warn('[PURCHASE_OPS] Notification worker failed:', error?.message || error);
      return null;
    }
  };

  const startPurchaseOperationsNotificationWorker = () => {
    if (IS_VERCEL_RUNTIME) return;
    if (purchaseOperationsNotificationTimer) return;
    purchaseOperationsNotificationTimer = setInterval(() => {
      void runPurchaseOperationsNotificationWorker();
    }, PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS);
    void runPurchaseOperationsNotificationWorker();
  };

  const stopPurchaseOperationsNotificationWorker = () => {
    if (!purchaseOperationsNotificationTimer) return;
    clearInterval(purchaseOperationsNotificationTimer);
    purchaseOperationsNotificationTimer = null;
  };



  return {
    runPurchaseOperationsNotificationWorker,
    startPurchaseOperationsNotificationWorker,
    stopPurchaseOperationsNotificationWorker,
  };
};

module.exports = { createPurchaseOperationsWorker };
