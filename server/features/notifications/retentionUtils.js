const createNotificationRetentionUtils = (deps = {}) => {
  const { dbRunAsync, APP_NOTIFICATION_RETENTION_DAYS, APP_NOTIFICATION_PURGE_BATCH_LIMIT } = deps;

  const purgeOldAppNotificationsAsync = async ({
    olderThanDays = APP_NOTIFICATION_RETENTION_DAYS,
    limit = APP_NOTIFICATION_PURGE_BATCH_LIMIT,
  } = {}) => {
    const normalizedDays = Math.max(
      1,
      Math.min(365, Number(olderThanDays || APP_NOTIFICATION_RETENTION_DAYS))
    );
    const normalizedLimit = Math.max(
      1,
      Math.min(50000, Number(limit || APP_NOTIFICATION_PURGE_BATCH_LIMIT))
    );
    const cutoffDate = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();
    const result = await dbRunAsync(
      `WITH old_rows AS (
        SELECT id
        FROM app_notifications
        WHERE created_at < ?
        ORDER BY id ASC
        LIMIT ?
      )
      DELETE FROM app_notifications
      WHERE id IN (SELECT id FROM old_rows)`,
      [cutoffIso, normalizedLimit]
    );
    return {
      deleted: Number(result?.changes || 0),
      cutoff: cutoffIso,
      older_than_days: normalizedDays,
      limit: normalizedLimit,
    };
  };

  const runAppNotificationPurge = async () => {
    try {
      const result = await purgeOldAppNotificationsAsync({
        olderThanDays: APP_NOTIFICATION_RETENTION_DAYS,
        limit: APP_NOTIFICATION_PURGE_BATCH_LIMIT,
      });
      if (Number(result?.deleted || 0) > 0) {
        console.log(
          `[NOTIFY] Purged ${result.deleted} app notifications older than ${APP_NOTIFICATION_RETENTION_DAYS} days`
        );
      }
      return result;
    } catch (error) {
      console.warn('[NOTIFY] Retention purge failed:', error?.message || error);
      return null;
    }
  };

  return {
    purgeOldAppNotificationsAsync,
    runAppNotificationPurge,
  };
};

module.exports = { createNotificationRetentionUtils };
