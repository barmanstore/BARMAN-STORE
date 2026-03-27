const { normalizeCreditType, normalizeCreditIssueStatus } = require('./utils/creditNormalization');
const { createCreditTimestampUtils } = require('./utils/creditTimestamps');
const { createCreditBalanceUtils } = require('./utils/creditBalances');
const { createCreditBadgeUtils } = require('./utils/creditBadges');
const { createPaymentIntelligenceUtils } = require('./utils/paymentIntelligence');

const createCreditUtils = (deps = {}) => {
  const {
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    normalizeTransactionDate,
    toTimestampMs,
  } = deps;

  const { buildCreditTransactionTimestamp, resolveCreditEntryTimestampMs } = createCreditTimestampUtils({
    normalizeTransactionDate,
    toTimestampMs,
  });
  const { getLatestCreditEntryAsync, recalculateCreditBalancesForUser } = createCreditBalanceUtils({
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    normalizeCreditType,
  });
  const {
    buildCreditDisciplineProfile,
    buildPaymentActivityBadges,
  } = createCreditBadgeUtils({ resolveCreditEntryTimestampMs });
  const {
    ensureCustomerCreditProfileAsync,
    getCustomerCreditProfileAsync,
    rebuildCustomerPaymentIntelligence,
    rebuildAllCustomerPaymentIntelligence,
  } = createPaymentIntelligenceUtils({
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    buildCreditDisciplineProfile,
  });

  return {
    normalizeCreditType,
    normalizeCreditIssueStatus,
    buildCreditTransactionTimestamp,
    getLatestCreditEntryAsync,
    recalculateCreditBalancesForUser,
    resolveCreditEntryTimestampMs,
    buildCreditDisciplineProfile,
    buildPaymentActivityBadges,
    ensureCustomerCreditProfileAsync,
    getCustomerCreditProfileAsync,
    rebuildCustomerPaymentIntelligence,
    rebuildAllCustomerPaymentIntelligence,
  };
};

module.exports = { createCreditUtils };
