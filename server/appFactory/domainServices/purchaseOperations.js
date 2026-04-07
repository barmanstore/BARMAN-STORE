const { createPurchaseOperationsService } = require('../../services/purchaseOperationsService');
const { PO_LIFECYCLE_PREPARED, PO_LIFECYCLE_SENT, PO_LIFECYCLE_REVISED, PO_LIFECYCLE_CANCELLED, PO_LIFECYCLE_FULLY_PAID, PO_LIFECYCLE_CLOSED, PO_PAYMENT_UNPAID, PURCHASE_WEEKDAYS, PURCHASE_ACTION_ROLLUP_FIELDS, PURCHASE_ACTION_STATUS_MAP } = require('../../features/purchase');

const createPurchaseOperationsServices = ({ core, domainCore, notificationUtils }) => {
  const { db, configValues } = core;
  const { purchaseHelpers } = domainCore;

  return createPurchaseOperationsService({
    dbAllAsync: db.dbAllAsync,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    normalizeTransactionDate: purchaseHelpers.normalizeTransactionDate,
    addDaysToDateKey: purchaseHelpers.addDaysToDateKey,
    normalizeBooleanFlag: purchaseHelpers.normalizeBooleanFlag,
    getDistributorOrderScheduleDay: purchaseHelpers.getDistributorOrderScheduleDay,
    getSupplierScheduleConfig: purchaseHelpers.getSupplierScheduleConfig,
    getPurchaseOrderLifecycleStatus: purchaseHelpers.getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle: purchaseHelpers.isPoEditableLifecycle,
    getWeekdayFromDateKey: purchaseHelpers.getWeekdayFromDateKey,
    parseDistributorProductsSupplied: purchaseHelpers.parseDistributorProductsSupplied,
    mergeDistributorProductKnowledge: purchaseHelpers.mergeDistributorProductKnowledge,
    getDistributorPaymentPlan: purchaseHelpers.getDistributorPaymentPlan,
    computeAverageDays: purchaseHelpers.computeAverageDays,
    computeAverageGapDays: purchaseHelpers.computeAverageGapDays,
    computeStdDev: purchaseHelpers.computeStdDev,
    deriveStockoutRisk: purchaseHelpers.deriveStockoutRisk,
    getPurchaseOrderPaymentAnchorDateKey: purchaseHelpers.getPurchaseOrderPaymentAnchorDateKey,
    getPurchaseOrderAnchorDateKey: purchaseHelpers.getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey: purchaseHelpers.getPurchaseOrderDeliveryDateKey,
    getDaysBetweenDateKeys: purchaseHelpers.getDaysBetweenDateKeys,
    pickLatestDateKey: purchaseHelpers.pickLatestDateKey,
    pickEarliestDateKey: purchaseHelpers.pickEarliestDateKey,
    normalizePoPaymentStatus: purchaseHelpers.normalizePoPaymentStatus,
    getEffectivePurchaseDueDateKey: purchaseHelpers.getEffectivePurchaseDueDateKey,
    resolveRollupRange: purchaseHelpers.resolveRollupRange,
    buildDateSeries: purchaseHelpers.buildDateSeries,
    normalizePoLifecycleStatus: purchaseHelpers.normalizePoLifecycleStatus,
    resolveInsightDateRange: purchaseHelpers.resolveInsightDateRange,
    notifyAdmins: notificationUtils.notifyAdmins,
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
    derivePurchaseNextAction: purchaseHelpers.derivePurchaseNextAction,
    persistPurchaseAnalyticsSnapshotsAsync: purchaseHelpers.persistPurchaseAnalyticsSnapshotsAsync,
    PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED: configValues.PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
    PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS: configValues.PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
    IS_VERCEL_RUNTIME: configValues.IS_VERCEL_RUNTIME,
  });
};

module.exports = { createPurchaseOperationsServices };
