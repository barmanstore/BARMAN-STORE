const { normalizeCreditType, normalizeCreditIssueStatus } = require('./utils/creditNormalization');
const { createCreditTimestampUtils } = require('./utils/creditTimestamps');
const { createCreditBalanceUtils } = require('./utils/creditBalances');
const { createCreditBadgeUtils } = require('./utils/creditBadges');

const createCreditUtils = (deps = {}) => {
  const {
    dbGetAsync,
    dbAllAsync,
    dbRunAsync,
    dbTxAsync,
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
    dbTxAsync,
    normalizeCreditType,
  });
  const { buildPaymentActivityBadges } = createCreditBadgeUtils({ resolveCreditEntryTimestampMs });

  return {
    normalizeCreditType,
    normalizeCreditIssueStatus,
    buildCreditTransactionTimestamp,
    getLatestCreditEntryAsync,
    recalculateCreditBalancesForUser,
    resolveCreditEntryTimestampMs,
    buildPaymentActivityBadges,
  };
};

module.exports = { createCreditUtils };
