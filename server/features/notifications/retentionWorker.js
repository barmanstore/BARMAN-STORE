const createNotificationRetentionWorker = ({
  runAppNotificationPurge,
  intervalMs,
  isVercelRuntime,
} = {}) => {
  let appNotificationPurgeTimer = null;

  const start = () => {
    if (isVercelRuntime) return;
    if (appNotificationPurgeTimer) return;
    appNotificationPurgeTimer = setInterval(() => {
      void runAppNotificationPurge();
    }, intervalMs);
    void runAppNotificationPurge();
  };

  const stop = () => {
    if (!appNotificationPurgeTimer) return;
    clearInterval(appNotificationPurgeTimer);
    appNotificationPurgeTimer = null;
  };

  return { start, stop };
};

module.exports = { createNotificationRetentionWorker };
