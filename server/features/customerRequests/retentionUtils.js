const createCustomerRequestRetentionUtils = (deps = {}) => {
  const {
    dbRunAsync,
    PHONE_CHANGE_STATUS_APPROVED,
    PHONE_CHANGE_STATUS_REJECTED,
    CUSTOMER_REQUEST_RETENTION_DAYS,
    CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
  } = deps;

  const purgeOldCustomerRequestsAsync = async ({
    olderThanDays = CUSTOMER_REQUEST_RETENTION_DAYS,
    limit = CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
  } = {}) => {
    const normalizedDays = Math.max(
      7,
      Math.min(365, Number(olderThanDays || CUSTOMER_REQUEST_RETENTION_DAYS))
    );
    const normalizedLimit = Math.max(
      1,
      Math.min(20000, Number(limit || CUSTOMER_REQUEST_PURGE_BATCH_LIMIT))
    );
    const cutoffDate = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();

    const productResult = await dbRunAsync(
      `WITH old_rows AS (
        SELECT id
        FROM product_recommendations
        WHERE status IN ('fulfilled', 'rejected')
          AND COALESCE(resolved_at, updated_at, created_at) < ?
        ORDER BY id ASC
        LIMIT ?
      )
      DELETE FROM product_recommendations
      WHERE id IN (SELECT id FROM old_rows)`,
      [cutoffIso, normalizedLimit]
    );

    const creditIssueResult = await dbRunAsync(
      `WITH old_rows AS (
        SELECT id
        FROM credit_entry_issues
        WHERE status IN ('corrected', 'rejected')
          AND COALESCE(resolved_at, updated_at, created_at) < ?
        ORDER BY id ASC
        LIMIT ?
      )
      DELETE FROM credit_entry_issues
      WHERE id IN (SELECT id FROM old_rows)`,
      [cutoffIso, normalizedLimit]
    );

    const phoneRequestResult = await dbRunAsync(
      `WITH old_rows AS (
        SELECT id
        FROM phone_change_requests
        WHERE status IN (?, ?)
          AND COALESCE(reviewed_at, updated_at, created_at) < ?
        ORDER BY id ASC
        LIMIT ?
      )
      DELETE FROM phone_change_requests
      WHERE id IN (SELECT id FROM old_rows)`,
      [PHONE_CHANGE_STATUS_APPROVED, PHONE_CHANGE_STATUS_REJECTED, cutoffIso, normalizedLimit]
    );

    const deletedProductRecommendations = Number(productResult?.changes || 0);
    const deletedCreditIssues = Number(creditIssueResult?.changes || 0);
    const deletedPhoneRequests = Number(phoneRequestResult?.changes || 0);

    return {
      deleted_product_recommendations: deletedProductRecommendations,
      deleted_credit_issues: deletedCreditIssues,
      deleted_phone_requests: deletedPhoneRequests,
      total_deleted: deletedProductRecommendations + deletedCreditIssues + deletedPhoneRequests,
      cutoff: cutoffIso,
      older_than_days: normalizedDays,
      limit: normalizedLimit,
    };
  };

  const runCustomerRequestPurge = async () => {
    try {
      const result = await purgeOldCustomerRequestsAsync({
        olderThanDays: CUSTOMER_REQUEST_RETENTION_DAYS,
        limit: CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
      });
      if (Number(result?.total_deleted || 0) > 0) {
        console.log(
          `[CUSTOMER_REQUESTS] Purged ${result.total_deleted} rows older than ${CUSTOMER_REQUEST_RETENTION_DAYS} days`
        );
      }
      return result;
    } catch (error) {
      console.warn('[CUSTOMER_REQUESTS] Retention purge failed:', error?.message || error);
      return null;
    }
  };

  return {
    purgeOldCustomerRequestsAsync,
    runCustomerRequestPurge,
  };
};

module.exports = { createCustomerRequestRetentionUtils };
