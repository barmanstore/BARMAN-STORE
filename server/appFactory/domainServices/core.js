const { createPurchaseHelpers } = require('../../core/bootstrap/purchaseHelpers');
const { createPurchaseTransactionUtils, PO_LIFECYCLE_CANCELLED, PO_LIFECYCLE_PREPARED, PO_LIFECYCLE_SENT, PO_LIFECYCLE_REVISED, PO_LIFECYCLE_CONFIRMED, PO_LIFECYCLE_PART_PAID, PO_LIFECYCLE_FULLY_PAID, PO_LIFECYCLE_CLOSED, PO_PAYMENT_UNPAID, PO_PAYMENT_PART_PAID, PO_PAYMENT_PAID, PURCHASE_WEEKDAYS } = require('../../features/purchase');
const { createDistributorLedgerUtils } = require('../../utils/distributorLedgerUtils');
const { createContactUtils } = require('../../utils/contactUtils');
const { createCreditUtils } = require('../../features/credits');

const createCoreDomainServices = ({ core }) => {
  const { db, authSupport, requestUtils, constants, libs } = core;

  const purchaseHelpers = createPurchaseHelpers({
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    crypto: libs.crypto,
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
  });

  const distributorLedger = createDistributorLedgerUtils({
    dbAllAsync: db.dbAllAsync,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    SQL_CAST_TO_INT: constants.SQL_CAST_TO_INT,
  });

  const contactUtils = createContactUtils({
    normalizePhone: authSupport.normalizePhone,
  });

  const creditUtils = createCreditUtils({
    dbGetAsync: db.dbGetAsync,
    dbAllAsync: db.dbAllAsync,
    dbRunAsync: db.dbRunAsync,
    dbTxAsync: db.dbTxAsync,
    normalizeTransactionDate: purchaseHelpers.normalizeTransactionDate,
    toTimestampMs: requestUtils.toTimestampMs,
  });

  const purchaseTransactionUtils = createPurchaseTransactionUtils({
    buildCreditTransactionTimestamp: creditUtils.buildCreditTransactionTimestamp,
  });

  return {
    purchaseHelpers,
    distributorLedger,
    contactUtils,
    creditUtils,
    purchaseTransactionUtils,
  };
};

module.exports = { createCoreDomainServices };
