import { useCallback, useRef } from 'react';

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
  const loadedDomainsRef = useRef({
    dashboard: false,
    products: false,
    orders: false,
    users: false,
    dailySalesDateKey: '',
  });

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

  const loadDashboardSnapshot = useCallback(async ({ force = false } = {}) => {
    if (loadedDomainsRef.current.dashboard && !force) return;
    // Dashboard needs a broad summary view, but keep it isolated to dashboard
    // bootstrap instead of making every admin tab pay this cost up front.
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
    loadedDomainsRef.current.dashboard = true;
    loadedDomainsRef.current.products = true;
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

  const loadProductCatalog = useCallback(async ({ force = false } = {}) => {
    if (loadedDomainsRef.current.products && !force) return;
    const productsData = await requestWithRetry(() => productsApi.getAll({ include_inactive: true }));
    setProducts(productsData);
    loadedDomainsRef.current.products = true;
  }, [
    productsApi,
    requestWithRetry,
    setProducts,
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
      loadedDomainsRef.current.orders = true;
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
      loadedDomainsRef.current.users = true;
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
      loadedDomainsRef.current.dailySalesDateKey = effectiveDateKey;
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

  const ensureTabData = useCallback(async (
    tab,
    { force = false, showGlobalLoading = false, dateKey = '' } = {}
  ) => {
    try {
      if (showGlobalLoading) setLoading(true);
      const nextTab = String(tab || '').trim().toLowerCase();
      switch (nextTab) {
        case 'dashboard':
          await loadDashboardSnapshot({ force });
          break;
        case 'products':
          await loadProductCatalog({ force });
          break;
        case 'orders':
          if (force || !loadedDomainsRef.current.orders) {
            await loadOrdersPage({ page: 1, query: '', silent: false });
          }
          break;
        case 'users':
          if (force || !loadedDomainsRef.current.users) {
            await loadUsersPage({ page: 1, query: '', silent: false });
          }
          break;
        case 'daily-sales': {
          const effectiveDateKey = String(dateKey || '').trim();
          if (force || loadedDomainsRef.current.dailySalesDateKey !== effectiveDateKey) {
            await loadDailySalesBills({ silent: false, dateKey: effectiveDateKey });
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error('Error fetching admin tab data:', error);
      showNotification(error.message || 'Failed to load admin workspace data', 'error');
    } finally {
      if (showGlobalLoading) setLoading(false);
    }
  }, [
    loadDashboardSnapshot,
    loadDailySalesBills,
    loadOrdersPage,
    loadProductCatalog,
    loadUsersPage,
    setLoading,
    showNotification,
  ]);

  const fetchData = useCallback(async (tab = 'dashboard') => {
    try {
      setLoading(true);
      await ensureTabData(tab, { force: true, showGlobalLoading: false });
    } catch (error) {
      console.error('Error fetching data:', error);
      showNotification(error.message || 'Failed to load admin dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    ensureTabData,
    setLoading,
    showNotification,
  ]);

  const refreshAdminData = useCallback(async () => {
    await loadDashboardSnapshot({ force: true });
  }, [loadDashboardSnapshot]);

  return {
    refreshAdminData,
    loadDashboardSnapshot,
    loadProductCatalog,
    loadOrdersPage,
    loadUsersPage,
    loadDailySalesBills,
    ensureTabData,
    fetchData,
  };
};

export default useAdminDataLoaders;
