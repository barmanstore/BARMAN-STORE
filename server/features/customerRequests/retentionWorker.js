const createCustomerRequestRetentionWorker = ({
  runCustomerRequestPurge,
  intervalMs,
  isVercelRuntime,
} = {}) => {
  let customerRequestPurgeTimer = null;

  const start = () => {
    if (isVercelRuntime) return;
    if (customerRequestPurgeTimer) return;
    customerRequestPurgeTimer = setInterval(() => {
      void runCustomerRequestPurge();
    }, intervalMs);
    void runCustomerRequestPurge();
  };

  const stop = () => {
    if (!customerRequestPurgeTimer) return;
    clearInterval(customerRequestPurgeTimer);
    customerRequestPurgeTimer = null;
  };

  return { start, stop };
};

module.exports = { createCustomerRequestRetentionWorker };
