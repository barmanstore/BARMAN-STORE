import { useCallback } from 'react';

const delay = (ms) => new Promise((resolve) => {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(resolve, ms);
    return;
  }
  setTimeout(resolve, ms);
});

const isTransientAdminLoadError = (error) => {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status >= 500
    || message.includes('timeout exceeded when trying to connect')
    || message.includes('max client connections reached')
    || message.includes('remaining connection slots are reserved')
  );
};

const useAdminDataLoaders = ({
  statsApi,
  productsApi,
  ordersApi,
  usersApi,
  adminApi,
  billingApi,
  setStats,
  setProducts,
  setOrders,
  setUsers,
  setVisitorStats,
  setBills,
  setDailySalesLoading,
  setDailySalesError,
  setLoading,
  showNotification,
  asNumber,
}) => {
  const requestWithRetry = useCallback(async (request, { retries = 2, delayMs = 350 } = {}) => {
    let attempt = 0;
    let lastError = null;
    while (attempt <= retries) {
      try {
        return await request();
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !isTransientAdminLoadError(error)) throw error;
        await delay(delayMs * (attempt + 1));
      }
      attempt += 1;
    }
    throw lastError;
  }, []);

  const refreshAdminData = useCallback(async () => {
    // The admin dashboard runs against a serverless API. Fan-out loading all
    // datasets at once can overwhelm the Postgres connection budget during cold
    // starts, so load them in a controlled sequence.
    const statsData = await requestWithRetry(() => statsApi.orders());
    const productsData = await requestWithRetry(() => productsApi.getAll({ include_inactive: true }));
    const ordersData = await requestWithRetry(() => ordersApi.getAll());
    const usersData = await requestWithRetry(() => usersApi.getAll());
    const analyticsData = await requestWithRetry(() => adminApi.getAnalyticsSummary())
      .catch(() => null);

    setStats(statsData);
    setProducts(productsData);
    setOrders(ordersData);
    setUsers(usersData);
    setVisitorStats({
      onlineVisitors: asNumber(analyticsData?.online_visitors, 0),
      onlineLoggedInUsers: asNumber(analyticsData?.online_logged_in_users, 0),
      uniqueSessionsToday: asNumber(analyticsData?.unique_sessions_today, 0),
      uniqueSessionsMonth: asNumber(analyticsData?.unique_sessions_month, 0),
      uniqueSessionsYear: asNumber(analyticsData?.unique_sessions_year, 0),
    });
  }, [
    adminApi,
    asNumber,
    ordersApi,
    productsApi,
    requestWithRetry,
    setOrders,
    setProducts,
    setStats,
    setUsers,
    setVisitorStats,
    statsApi,
    usersApi,
  ]);

  const loadDailySalesBills = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setDailySalesLoading(true);
      setDailySalesError('');
      const rows = await requestWithRetry(() => billingApi.getAll());
      setBills(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (!silent) setDailySalesError(error.message || 'Failed to load bills for daily summary');
    } finally {
      if (!silent) setDailySalesLoading(false);
    }
  }, [
    billingApi,
    requestWithRetry,
    setBills,
    setDailySalesError,
    setDailySalesLoading,
  ]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      await refreshAdminData();
    } catch (error) {
      console.error('Error fetching data:', error);
      showNotification(error.message || 'Failed to load admin dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    refreshAdminData,
    setLoading,
    showNotification,
  ]);

  return {
    refreshAdminData,
    loadDailySalesBills,
    fetchData,
  };
};

export default useAdminDataLoaders;
