const buildCreditDeps = ({ core, domain }) => {
  const { configValues, requestUtils } = core;
  const { creditUtils } = domain;

  return {
    normalizeCreditIssueStatus: creditUtils.normalizeCreditIssueStatus,
    getLatestCreditEntryAsync: creditUtils.getLatestCreditEntryAsync,
    buildPaymentActivityBadges: creditUtils.buildPaymentActivityBadges,
    recalculateCreditBalancesForUser: creditUtils.recalculateCreditBalancesForUser,
    buildCreditTransactionTimestamp: creditUtils.buildCreditTransactionTimestamp,
    CREDIT_ENTRY_DEDUP_WINDOW_MS: configValues.CREDIT_ENTRY_DEDUP_WINDOW_MS,
    toTimestampMs: requestUtils.toTimestampMs,
  };
};

module.exports = { buildCreditDeps };
