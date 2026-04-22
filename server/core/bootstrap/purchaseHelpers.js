const {
  createPurchaseItemUtils,
  createPurchaseDuplicateUtils,
  createPurchaseOrderStatusUtils,
  createPurchaseAnalyticsUtils,
  createInventoryUtils,
  createPurchaseAnalyticsSnapshotUtils,
  createPurchaseDateUtils,
  createDistributorProductKnowledgeUtils,
} = require('../../features/purchase');

const createPurchaseHelpers = (deps = {}) => {
  const {
    dbGetAsync,
    dbRunAsync,
    crypto,
    PURCHASE_WEEKDAYS,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_PART_PAID,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
    PO_PAYMENT_PART_PAID,
    PO_PAYMENT_PAID,
  } = deps;

  const dateUtils = createPurchaseDateUtils({
    PURCHASE_WEEKDAYS,
  });

  const itemUtils = createPurchaseItemUtils({
    dbGetAsync,
  });

  const duplicateUtils = createPurchaseDuplicateUtils({
    dbGetAsync,
    crypto,
    normalizeTransactionDate: dateUtils.normalizeTransactionDate,
    PO_LIFECYCLE_CANCELLED,
  });

  const orderStatusUtils = createPurchaseOrderStatusUtils({
    dbRunAsync,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_PART_PAID,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
    PO_LIFECYCLE_CANCELLED,
    PO_PAYMENT_UNPAID,
    PO_PAYMENT_PART_PAID,
    PO_PAYMENT_PAID,
  });

  const analyticsUtils = createPurchaseAnalyticsUtils();

  const distributorKnowledgeUtils = createDistributorProductKnowledgeUtils();

  const inventoryUtils = createInventoryUtils({
    dbGetAsync,
    dbRunAsync,
    mergeDistributorProductKnowledge: distributorKnowledgeUtils.mergeDistributorProductKnowledge,
  });

  const snapshotUtils = createPurchaseAnalyticsSnapshotUtils({
    dbRunAsync,
    normalizeTransactionDate: dateUtils.normalizeTransactionDate,
  });

  return {
    ...dateUtils,
    ...itemUtils,
    ...duplicateUtils,
    ...orderStatusUtils,
    ...analyticsUtils,
    ...distributorKnowledgeUtils,
    ...inventoryUtils,
    ...snapshotUtils,
  };
};

module.exports = { createPurchaseHelpers };
