const buildCreditDeps = ({ core, domain }) => {
  const { configValues, requestUtils } = core;
  const { creditUtils } = domain;

  return {
    normalizeCreditIssueStatus: creditUtils.normalizeCreditIssueStatus,
    getLatestCreditEntryAsync: creditUtils.getLatestCreditEntryAsync,
    buildCreditDisciplineProfile: creditUtils.buildCreditDisciplineProfile,
    buildPaymentActivityBadges: creditUtils.buildPaymentActivityBadges,
    recalculateCreditBalancesForUser: creditUtils.recalculateCreditBalancesForUser,
    getCustomerCreditProfileAsync: creditUtils.getCustomerCreditProfileAsync,
    getCustomerPaymentSummaryAsync: creditUtils.getCustomerPaymentSummaryAsync,
    rebuildCustomerPaymentIntelligence: creditUtils.rebuildCustomerPaymentIntelligence,
    rebuildAllCustomerPaymentIntelligence: creditUtils.rebuildAllCustomerPaymentIntelligence,
    buildCreditTransactionTimestamp: creditUtils.buildCreditTransactionTimestamp,
    CREDIT_ENTRY_DEDUP_WINDOW_MS: configValues.CREDIT_ENTRY_DEDUP_WINDOW_MS,
    toTimestampMs: requestUtils.toTimestampMs,
    parseDataUrlImage: core.profileImages.parseDataUrlImage,
    PROFILE_IMAGE_ALLOWED_MIME: core.profileImages.PROFILE_IMAGE_ALLOWED_MIME,
    PROFILE_IMAGE_MAX_BYTES: core.profileImages.PROFILE_IMAGE_MAX_BYTES,
    mimeToExt: core.profileImages.mimeToExt,
    deleteManagedProfileImage: core.profileImages.deleteManagedProfileImage,
    profileImageStorage: core.profileImages.profileImageStorage,
  };
};

module.exports = { buildCreditDeps };
