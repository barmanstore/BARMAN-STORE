import { useCallback, useRef } from 'react';

const ADMIN_PREVIEW_LIMIT = 3;
const ADMIN_LIST_PAGE_LIMIT = 25;
const ADMIN_PRODUCTS_PAGE_LIMIT = 100;

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

const isUnauthorizedError = (error) => Number(error?.status || 0) === 401;

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

const normalizeProductsResponse = (payload) => {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      page: 1,
      limit: payload.length,
      total: payload.length,
      hasMore: false,
    };
  }
  const pagination = payload?.pagination || {};
  const page = Math.max(1, Number(pagination?.page || 1));
  const limit = Math.max(1, Number(pagination?.page_size || ADMIN_PRODUCTS_PAGE_LIMIT));
  const total = Math.max(0, Number(pagination?.total || 0));
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    page,
    limit,
    total,
    hasMore: Boolean(pagination?.has_more),
  };
};

const flattenCategoryTreePaths = (tree = []) => {
  const paths = [];
  const walk = (node) => {
    if (!node) return;
    const path = String(node.path || '').trim();
    if (path) paths.push(path);
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child) => walk(child));
  };
  (Array.isArray(tree) ? tree : []).forEach((node) => walk(node));
  return Array.from(new Set(paths)).filter(Boolean);
};

const buildUserDirectorySummary = (payload) => ({
  total: Math.max(0, Number(payload?.total || 0)),
  adminCount: Math.max(0, Number(payload?.adminCount || 0)),
  customerCount: Math.max(0, Number(payload?.customerCount || 0)),
});

const useAdminDataLoaders = ({
  statsApi,
  productsApi,
  categoriesApi,
  ordersApi,
  usersApi,
  adminApi,
  billingApi,
  creditApi,
  purchaseOrdersApi,
  insightsApi,
  setStats,
  setProducts,
  setProductCategories,
  setProductsPage,
  setProductsTotal,
  setProductsLoading,
  setProductSummary,
  setProductInsights,
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
  setCreditAgingSummary,
  setPurchaseOpsSummary,
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
  const activeListRequestRef = useRef({
    orders: 0,
    users: 0,
    products: 0,
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
    const [
      statsData,
      ordersPreviewPayload,
      usersPreviewPayload,
      analyticsData,
      activeProductsPayload,
      inactiveProductsPayload,
      lowStockPayload,
      creditAgingPayload,
      purchaseOpsPayload,
      productInsightsPayload,
    ] = await Promise.all([
      requestWithRetry(() => statsApi.orders()),
      requestWithRetry(() => ordersApi.getAll({
        paginated: 1,
        page: 1,
        limit: ADMIN_PREVIEW_LIMIT,
      })),
      requestWithRetry(() => usersApi.getAll({
        paginated: 1,
        page: 1,
        limit: ADMIN_PREVIEW_LIMIT,
      })),
      requestWithRetry(() => adminApi.getAnalyticsSummary()).catch(() => null),
      requestWithRetry(() => productsApi.getAll({ status: 'active', page_size: 1 })),
      requestWithRetry(() => productsApi.getAll({ status: 'inactive', page_size: 1 })),
      requestWithRetry(() => productsApi.getAll({ status: 'active', low_stock: 'true', page_size: 3 })),
      requestWithRetry(() => creditApi.getAgingReport()).catch(() => null),
      requestWithRetry(() => purchaseOrdersApi.getOperationsSummary()).catch(() => null),
      requestWithRetry(() => insightsApi.getProducts()).catch(() => []),
    ]);
    const ordersPreview = normalizePagedResponse(ordersPreviewPayload);
    const usersPreview = normalizePagedResponse(usersPreviewPayload);
    const activeProducts = normalizeProductsResponse(activeProductsPayload);
    const inactiveProducts = normalizeProductsResponse(inactiveProductsPayload);
    const lowStockProducts = normalizeProductsResponse(lowStockPayload);

    setStats(statsData);
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
    setProductSummary({
      activeCount: activeProducts.total,
      inactiveCount: inactiveProducts.total,
      lowStockProducts: (Array.isArray(lowStockProducts.items) ? lowStockProducts.items : [])
        .slice()
        .sort((a, b) => Number(a?.stock || 0) - Number(b?.stock || 0))
        .slice(0, 3),
    });
    setProductInsights(Array.isArray(productInsightsPayload) ? productInsightsPayload : []);
    setVisitorStats({
      onlineVisitors: asNumber(analyticsData?.online_visitors, 0),
      onlineLoggedInUsers: asNumber(analyticsData?.online_logged_in_users, 0),
      uniqueSessionsToday: asNumber(analyticsData?.unique_sessions_today, 0),
      uniqueSessionsMonth: asNumber(analyticsData?.unique_sessions_month, 0),
      uniqueSessionsYear: asNumber(analyticsData?.unique_sessions_year, 0),
    });
    const creditSummary = creditAgingPayload?.summary || {};
    setCreditAgingSummary({
      totalOutstanding: asNumber(creditSummary?.total_outstanding, 0),
      customersOverdue: asNumber(creditSummary?.customers_overdue, 0),
      customersNeedFollowUp: asNumber(creditSummary?.customers_need_follow_up, 0),
      customersDefaulters: asNumber(creditSummary?.customers_defaulters, 0),
      customersOverLimit: asNumber(creditSummary?.customers_over_limit, 0),
    });
    setPurchaseOpsSummary({
      todayDistributors: Array.isArray(purchaseOpsPayload?.today_distributors)
        ? purchaseOpsPayload.today_distributors
        : [],
      predictedDeliveriesNext: Array.isArray(purchaseOpsPayload?.predicted_deliveries_next)
        ? purchaseOpsPayload.predicted_deliveries_next
        : [],
      predictedPaymentsToday: Array.isArray(purchaseOpsPayload?.predicted_payments_today)
        ? purchaseOpsPayload.predicted_payments_today
        : [],
    });
    loadedDomainsRef.current.dashboard = true;
  }, [
    adminApi,
    asNumber,
    creditApi,
    insightsApi,
    ordersApi,
    productsApi,
    purchaseOrdersApi,
    requestWithRetry,
    setOrdersPage,
    setOrdersTotal,
    setRecentCustomersPreview,
    setRecentOrdersPreview,
    setStats,
    setCreditAgingSummary,
    setPurchaseOpsSummary,
    setProductSummary,
    setProductInsights,
    setUserDirectorySummary,
    setUsersPage,
    setUsersTotal,
    setVisitorStats,
    statsApi,
    usersApi,
  ]);

  const loadProductCategories = useCallback(async () => {
    try {
      const tree = await requestWithRetry(() => categoriesApi.getTree());
      setProductCategories(flattenCategoryTreePaths(tree));
    } catch (_) {
      setProductCategories([]);
    }
  }, [categoriesApi, requestWithRetry, setProductCategories]);

  const loadProductsPage = useCallback(async ({
    page = 1,
    query = '',
    category = '',
    status = '',
    lowStockOnly = false,
  } = {}) => {
    const requestId = activeListRequestRef.current.products + 1;
    activeListRequestRef.current.products = requestId;
    try {
      setProductsLoading(true);
      const params = {
        include_inactive: 'true',
        page: String(page),
        page_size: String(ADMIN_PRODUCTS_PAGE_LIMIT),
      };
      const normalizedStatus = String(status || '').trim().toLowerCase();
      if (normalizedStatus === 'active' || normalizedStatus === 'inactive') {
        params.status = normalizedStatus;
      } else if (normalizedStatus === 'available') {
        params.status = 'active';
        params.in_stock = 'true';
      } else if (normalizedStatus === 'out_of_stock') {
        params.status = 'active';
      }
      const trimmedQuery = String(query || '').trim();
      if (trimmedQuery) params.name = trimmedQuery;
      const trimmedCategory = String(category || '').trim();
      if (trimmedCategory) params.category = trimmedCategory;
      if (lowStockOnly) params.low_stock = 'true';

      const payload = await requestWithRetry(() => productsApi.getAll(params));
      const normalized = normalizeProductsResponse(payload);
      if (activeListRequestRef.current.products !== requestId) {
        return normalized;
      }
      setProducts(normalized.items);
      setProductsPage(normalized.page);
      setProductsTotal(normalized.total);
      loadedDomainsRef.current.products = true;
      return normalized;
    } finally {
      if (activeListRequestRef.current.products === requestId) {
        setProductsLoading(false);
      }
    }
  }, [
    productsApi,
    requestWithRetry,
    setProducts,
    setProductsLoading,
    setProductsPage,
    setProductsTotal,
  ]);

  const loadProductCatalog = useCallback(async ({
    force = false,
    page = 1,
    query = '',
    category = '',
    status = '',
    lowStockOnly = false,
  } = {}) => {
    if (loadedDomainsRef.current.products && !force) return;
    await Promise.all([
      loadProductCategories(),
      loadProductsPage({ page, query, category, status, lowStockOnly }),
    ]);
  }, [loadProductCategories, loadProductsPage]);

  const loadOrdersPage = useCallback(async ({ page = 1, query = '', silent = false } = {}) => {
    const requestId = activeListRequestRef.current.orders + 1;
    activeListRequestRef.current.orders = requestId;
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
        if (activeListRequestRef.current.orders !== requestId) {
          return normalized;
        }
        return loadOrdersPage({ page: page - 1, query, silent });
      }
      if (activeListRequestRef.current.orders !== requestId) {
        return normalized;
      }
      setOrders(normalized.items);
      setOrdersPage(normalized.page);
      setOrdersTotal(normalized.total);
      loadedDomainsRef.current.orders = true;
      return normalized;
    } finally {
      if (!silent && activeListRequestRef.current.orders === requestId) {
        setOrdersLoading(false);
      }
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
    const requestId = activeListRequestRef.current.users + 1;
    activeListRequestRef.current.users = requestId;
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
        if (activeListRequestRef.current.users !== requestId) {
          return normalized;
        }
        return loadUsersPage({ page: page - 1, query, silent });
      }
      if (activeListRequestRef.current.users !== requestId) {
        return normalized;
      }
      setUsers(normalized.items);
      setUsersPage(normalized.page);
      setUsersTotal(normalized.total);
      setUserDirectorySummary(buildUserDirectorySummary(normalized));
      loadedDomainsRef.current.users = true;
      return normalized;
    } finally {
      if (!silent && activeListRequestRef.current.users === requestId) {
        setUsersLoading(false);
      }
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
      if (isUnauthorizedError(error)) {
        setBills([]);
        setDailySalesError('');
        return;
      }
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
      if (isUnauthorizedError(error)) {
        return;
      }
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
      if (isUnauthorizedError(error)) {
        return;
      }
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
    loadProductCategories,
    loadProductsPage,
    loadOrdersPage,
    loadUsersPage,
    loadDailySalesBills,
    ensureTabData,
    fetchData,
  };
};

export default useAdminDataLoaders;
