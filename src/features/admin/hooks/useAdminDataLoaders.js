import { useCallback } from 'react';

const ADMIN_PREVIEW_LIMIT = 3;
const ADMIN_LIST_PAGE_LIMIT = 25;

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

const normalizePagedResponse = (payload) => {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      page: 1,
      limit: payload.length,
      total: payload.length,
    };
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    page: Math.max(1, Number(payload?.page || 1)),
    limit: Math.max(1, Number(payload?.limit || ADMIN_LIST_PAGE_LIMIT)),
    total: Math.max(0, Number(payload?.total || 0)),
    adminCount: Math.max(0, Number(payload?.adminCount || 0)),
    customerCount: Math.max(0, Number(payload?.customerCount || 0)),
  };
};

const buildUserDirectorySummary = (payload) => ({
  total: Math.max(0, Number(payload?.total || 0)),
  adminCount: Math.max(0, Number(payload?.adminCount || 0)),
  customerCount: Math.max(0, Number(payload?.customerCount || 0)),
});

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
  setRecentOrdersPreview,
  setRecentCustomersPreview,
  setUserDirectorySummary,
  setOrdersPage,
  setOrdersTotal,
  setOrdersLoading,
  setUsersPage,
  setUsersTotal,
  setUsersLoading,
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
    const ordersPreviewPayload = await requestWithRetry(() => ordersApi.getAll({
      paginated: 1,
      page: 1,
      limit: ADMIN_PREVIEW_LIMIT,
    }));
    const usersPreviewPayload = await requestWithRetry(() => usersApi.getAll({
      paginated: 1,
      page: 1,
      limit: ADMIN_PREVIEW_LIMIT,
    }));
    const analyticsData = await requestWithRetry(() => adminApi.getAnalyticsSummary())
      .catch(() => null);
    const ordersPreview = normalizePagedResponse(ordersPreviewPayload);
    const usersPreview = normalizePagedResponse(usersPreviewPayload);

    setStats(statsData);
    setProducts(productsData);
    setRecentOrdersPreview(ordersPreview.items.slice(0, ADMIN_PREVIEW_LIMIT));
    setRecentCustomersPreview(
      usersPreview.items
        .filter((user) => String(user?.role || '').toLowerCase() !== 'admin')
        .slice(0, ADMIN_PREVIEW_LIMIT)
    );
    setUserDirectorySummary(buildUserDirectorySummary(usersPreview));
    setOrdersPage(1);
    setOrdersTotal(ordersPreview.total);
    setUsersPage(1);
    setUsersTotal(usersPreview.total);
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
    setOrdersPage,
    setOrders,
    setProducts,
    setOrdersTotal,
    setRecentCustomersPreview,
    setRecentOrdersPreview,
    setStats,
    setUserDirectorySummary,
    setUsersPage,
    setUsers,
    setUsersTotal,
    setVisitorStats,
    statsApi,
    usersApi,
  ]);

  const loadOrdersPage = useCallback(async ({ page = 1, query = '', silent = false } = {}) => {
    try {
      if (!silent) setOrdersLoading(true);
      const payload = await requestWithRetry(() => ordersApi.getAll({
        paginated: 1,
        page,
        limit: ADMIN_LIST_PAGE_LIMIT,
        q: String(query || '').trim(),
      }));
      const normalized = normalizePagedResponse(payload);
      if (page > 1 && normalized.items.length === 0 && normalized.total > 0) {
        return loadOrdersPage({ page: page - 1, query, silent });
      }
      setOrders(normalized.items);
      setOrdersPage(normalized.page);
      setOrdersTotal(normalized.total);
      return normalized;
    } finally {
      if (!silent) setOrdersLoading(false);
    }
  }, [
    ordersApi,
    requestWithRetry,
    setOrders,
    setOrdersLoading,
    setOrdersPage,
    setOrdersTotal,
  ]);

  const loadUsersPage = useCallback(async ({ page = 1, query = '', silent = false } = {}) => {
    try {
      if (!silent) setUsersLoading(true);
      const payload = await requestWithRetry(() => usersApi.getAll({
        paginated: 1,
        page,
        limit: ADMIN_LIST_PAGE_LIMIT,
        q: String(query || '').trim(),
      }));
      const normalized = normalizePagedResponse(payload);
      if (page > 1 && normalized.items.length === 0 && normalized.total > 0) {
        return loadUsersPage({ page: page - 1, query, silent });
      }
      setUsers(normalized.items);
      setUsersPage(normalized.page);
      setUsersTotal(normalized.total);
      setUserDirectorySummary(buildUserDirectorySummary(normalized));
      return normalized;
    } finally {
      if (!silent) setUsersLoading(false);
    }
  }, [
    requestWithRetry,
    setUserDirectorySummary,
    setUsers,
    setUsersLoading,
    setUsersPage,
    setUsersTotal,
    usersApi,
  ]);

  const loadDailySalesBills = useCallback(async ({ silent = false, dateKey = '' } = {}) => {
    try {
      if (!silent) setDailySalesLoading(true);
      setDailySalesError('');
      const effectiveDateKey = String(dateKey || '').trim();
      const rows = await requestWithRetry(() => billingApi.getAll({
        bill_type: 'sales',
        ...(effectiveDateKey ? { date: effectiveDateKey } : {}),
      }));
      const normalized = normalizePagedResponse(rows);
      setBills(normalized.items);
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
    loadOrdersPage,
    loadUsersPage,
    loadDailySalesBills,
    fetchData,
  };
};

export default useAdminDataLoaders;
