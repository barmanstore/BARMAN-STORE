import { useCallback, useRef } from 'react';
import {
  createEmptyCashSummary,
  normalizeCashSummary,
  normalizeDailyCashTallyEntry,
} from '../utils/dailyCashSummary';
import { productService } from '../../../shared/services/productService';

const ADMIN_PREVIEW_LIMIT = 3;
const ADMIN_LIST_PAGE_LIMIT = 25;
const ADMIN_PRODUCTS_PAGE_LIMIT = 100;

const delay = (ms) =>
  new Promise((resolve) => {
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
    status >= 500 ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('max client connections reached') ||
    message.includes('remaining connection slots are reserved')
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
      pageInfo: {
        next_cursor: null,
        prev_cursor: null,
        has_more: false,
      },
      sort: {},
      filters: {},
      meta: {
        page: 1,
        page_size: payload.length,
        total_count: payload.length,
        page_mode: 'legacy-array',
      },
    };
  }
  const pageInfo = payload?.page_info || payload?.pagination || {};
  const meta = payload?.meta || {};
  const page = Math.max(1, Number(meta?.page || pageInfo?.page || 1));
  const limit = Math.max(
    1,
    Number(meta?.page_size || pageInfo?.page_size || ADMIN_PRODUCTS_PAGE_LIMIT)
  );
  const total = Math.max(
    0,
    Number(
      meta?.total_count ??
        payload?.total_count ??
        payload?.total ??
        (Array.isArray(payload?.items) ? payload.items.length : 0)
    )
  );
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    page,
    limit,
    total,
    hasMore: Boolean(pageInfo?.has_more),
    pageInfo: {
      next_cursor: pageInfo?.next_cursor || null,
      prev_cursor: pageInfo?.prev_cursor || null,
      has_more: Boolean(pageInfo?.has_more),
    },
    sort: payload?.sort && typeof payload.sort === 'object' ? payload.sort : {},
    filters: payload?.filters && typeof payload.filters === 'object' ? payload.filters : {},
    meta: {
      ...meta,
      page,
      page_size: limit,
      total_count: total,
    },
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
  setTodayCashSummary,
  setCreditAgingSummary,
  setPurchaseOpsSummary,
  setBills,
  setDailyCashTally,
  setDailyCashTallyError,
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

  const loadDashboardSnapshot = useCallback(
    async ({ force = false } = {}) => {
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
        requestWithRetry(() =>
          ordersApi.getAll({
            paginated: 1,
            page: 1,
            limit: ADMIN_PREVIEW_LIMIT,
          })
        ),
        requestWithRetry(() =>
          usersApi.getAll({
            paginated: 1,
            page: 1,
            limit: ADMIN_PREVIEW_LIMIT,
          })
        ),
        requestWithRetry(() => adminApi.getAnalyticsSummary()).catch(() => null),
        requestWithRetry(() => productService.fetchProducts({ status: 'active', page_size: 1 })),
        requestWithRetry(() => productService.fetchProducts({ status: 'inactive', page_size: 1 })),
        requestWithRetry(() =>
          productService.fetchProducts({ status: 'active', low_stock: 'true', page_size: 3 })
        ),
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
      setTodayCashSummary(
        normalizeCashSummary(analyticsData?.today_cash_summary) || createEmptyCashSummary()
      );
      const creditSummary = creditAgingPayload?.summary || {};
      setCreditAgingSummary({
        totalOutstanding: asNumber(creditSummary?.total_outstanding, 0),
        customersOverdue: asNumber(creditSummary?.customers_overdue, 0),
        customersNeedFollowUp: asNumber(creditSummary?.customers_need_follow_up, 0),
        customersDefaulters: asNumber(creditSummary?.customers_defaulters, 0),
        customersOverLimit: asNumber(creditSummary?.customers_over_limit, 0),
      });
      setPurchaseOpsSummary({
        cards:
          purchaseOpsPayload?.cards && typeof purchaseOpsPayload.cards === 'object'
            ? purchaseOpsPayload.cards
            : {},
        todayDistributors: Array.isArray(purchaseOpsPayload?.today_distributors)
          ? purchaseOpsPayload.today_distributors
          : [],
        tomorrowDistributors: Array.isArray(purchaseOpsPayload?.tomorrow_distributors)
          ? purchaseOpsPayload.tomorrow_distributors
          : [],
        weeklyDistributors: Array.isArray(purchaseOpsPayload?.weekly_distributors)
          ? purchaseOpsPayload.weekly_distributors
          : [],
        supplierVisits: Array.isArray(purchaseOpsPayload?.supplier_visits)
          ? purchaseOpsPayload.supplier_visits
          : [],
        predictedDeliveriesNext: Array.isArray(purchaseOpsPayload?.predicted_deliveries_next)
          ? purchaseOpsPayload.predicted_deliveries_next
          : [],
        predictedPaymentsToday: Array.isArray(purchaseOpsPayload?.predicted_payments_today)
          ? purchaseOpsPayload.predicted_payments_today
          : [],
        predictedPaymentsNext: Array.isArray(purchaseOpsPayload?.predicted_payments_next)
          ? purchaseOpsPayload.predicted_payments_next
          : [],
        reminders: Array.isArray(purchaseOpsPayload?.reminders) ? purchaseOpsPayload.reminders : [],
        payables: Array.isArray(purchaseOpsPayload?.payables) ? purchaseOpsPayload.payables : [],
        workflow: Array.isArray(purchaseOpsPayload?.workflow) ? purchaseOpsPayload.workflow : [],
        distributorInsights: Array.isArray(purchaseOpsPayload?.distributor_insights)
          ? purchaseOpsPayload.distributor_insights
          : [],
        actionRollups:
          purchaseOpsPayload?.action_rollups &&
          typeof purchaseOpsPayload.action_rollups === 'object'
            ? purchaseOpsPayload.action_rollups
            : {},
      });
      loadedDomainsRef.current.dashboard = true;
    },
    [
      adminApi,
      asNumber,
      creditApi,
      insightsApi,
      ordersApi,
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
      setTodayCashSummary,
      statsApi,
      usersApi,
    ]
  );

  const loadProductCategories = useCallback(async () => {
    try {
      const tree = await requestWithRetry(() => categoriesApi.getTree());
      setProductCategories(flattenCategoryTreePaths(tree));
    } catch (_) {
      setProductCategories([]);
    }
  }, [categoriesApi, requestWithRetry, setProductCategories]);

  const loadProductsPage = useCallback(
    async ({
      page = 1,
      query = '',
      category = '',
      brand = '',
      status = '',
      lowStockOnly = false,
      sortField = '',
      sortDir = '',
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
        const normalizedStatus = String(status || '')
          .trim()
          .toLowerCase();
        if (normalizedStatus === 'active' || normalizedStatus === 'inactive') {
          params.status = normalizedStatus;
        } else if (normalizedStatus === 'available') {
          params.status = 'active';
          params.in_stock = 'true';
        } else if (normalizedStatus === 'out_of_stock') {
          params.status = 'active';
        }
        const trimmedQuery = String(query || '').trim();
        if (trimmedQuery) params.q = trimmedQuery;
        const trimmedCategory = String(category || '').trim();
        if (trimmedCategory) params.category = trimmedCategory;
        const trimmedBrand = String(brand || '').trim();
        if (trimmedBrand) params.brand = trimmedBrand;
        if (lowStockOnly) params.low_stock = 'true';
        const normalizedSortField = String(sortField || '').trim();
        const normalizedSortDir = String(sortDir || '')
          .trim()
          .toLowerCase();
        if (normalizedSortField) params.sort_field = normalizedSortField;
        if (normalizedSortDir === 'asc' || normalizedSortDir === 'desc')
          params.sort_dir = normalizedSortDir;

        const payload = await requestWithRetry(() => productService.fetchProducts(params));
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
    },
    [requestWithRetry, setProducts, setProductsLoading, setProductsPage, setProductsTotal]
  );

  const loadProductCatalog = useCallback(
    async ({
      force = false,
      page = 1,
      query = '',
      category = '',
      brand = '',
      status = '',
      lowStockOnly = false,
      sortField = '',
      sortDir = '',
    } = {}) => {
      if (loadedDomainsRef.current.products && !force) return;
      await Promise.all([
        loadProductCategories(),
        loadProductsPage({
          page,
          query,
          category,
          brand,
          status,
          lowStockOnly,
          sortField,
          sortDir,
        }),
      ]);
    },
    [loadProductCategories, loadProductsPage]
  );

  const loadOrdersPage = useCallback(
    async ({ page = 1, query = '', silent = false } = {}) => {
      const requestId = activeListRequestRef.current.orders + 1;
      activeListRequestRef.current.orders = requestId;
      try {
        if (!silent) setOrdersLoading(true);
        const payload = await requestWithRetry(() =>
          ordersApi.getAll({
            paginated: 1,
            page,
            limit: ADMIN_LIST_PAGE_LIMIT,
            q: String(query || '').trim(),
          })
        );
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
    },
    [ordersApi, requestWithRetry, setOrders, setOrdersLoading, setOrdersPage, setOrdersTotal]
  );

  const loadUsersPage = useCallback(
    async ({ page = 1, query = '', silent = false } = {}) => {
      const requestId = activeListRequestRef.current.users + 1;
      activeListRequestRef.current.users = requestId;
      try {
        if (!silent) setUsersLoading(true);
        const payload = await requestWithRetry(() =>
          usersApi.getAll({
            paginated: 1,
            page,
            limit: ADMIN_LIST_PAGE_LIMIT,
            q: String(query || '').trim(),
          })
        );
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
    },
    [
      requestWithRetry,
      setUserDirectorySummary,
      setUsers,
      setUsersLoading,
      setUsersPage,
      setUsersTotal,
      usersApi,
    ]
  );

  const loadDailySalesBills = useCallback(
    async ({ silent = false, dateKey = '' } = {}) => {
      try {
        if (!silent) setDailySalesLoading(true);
        setDailySalesError('');
        setDailyCashTallyError('');
        const effectiveDateKey = String(dateKey || '').trim();
        const [rowsResult, tallyResult] = await Promise.allSettled([
          requestWithRetry(() =>
            billingApi.getAll({
              bill_type: 'sales',
              ...(effectiveDateKey ? { date: effectiveDateKey } : {}),
            })
          ),
          effectiveDateKey
            ? requestWithRetry(() => adminApi.getDailyCashTally(effectiveDateKey))
            : Promise.resolve({ date: effectiveDateKey, entry: null }),
        ]);

        const rowsError = rowsResult.status === 'rejected' ? rowsResult.reason : null;
        const tallyError = tallyResult.status === 'rejected' ? tallyResult.reason : null;

        if (isUnauthorizedError(rowsError) || isUnauthorizedError(tallyError)) {
          setBills([]);
          setDailyCashTally(null);
          setDailySalesError('');
          setDailyCashTallyError('');
          return;
        }

        if (rowsResult.status === 'fulfilled') {
          const normalized = normalizePagedResponse(rowsResult.value);
          setBills(normalized.items);
        } else {
          setBills([]);
          if (!silent)
            setDailySalesError(rowsError?.message || 'Failed to load bills for daily summary');
        }

        if (tallyResult.status === 'fulfilled') {
          setDailyCashTally(normalizeDailyCashTallyEntry(tallyResult.value, effectiveDateKey));
        } else {
          setDailyCashTally(null);
          if (!silent)
            setDailyCashTallyError(tallyError?.message || 'Failed to load saved daily cash tally');
        }

        loadedDomainsRef.current.dailySalesDateKey = effectiveDateKey;
      } finally {
        if (!silent) setDailySalesLoading(false);
      }
    },
    [
      adminApi,
      billingApi,
      requestWithRetry,
      setBills,
      setDailyCashTally,
      setDailyCashTallyError,
      setDailySalesError,
      setDailySalesLoading,
    ]
  );

  const ensureTabData = useCallback(
    async (tab, { force = false, showGlobalLoading = false, dateKey = '' } = {}) => {
      try {
        if (showGlobalLoading) setLoading(true);
        const nextTab = String(tab || '')
          .trim()
          .toLowerCase();
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
    },
    [
      loadDashboardSnapshot,
      loadDailySalesBills,
      loadOrdersPage,
      loadProductCatalog,
      loadUsersPage,
      setLoading,
      showNotification,
    ]
  );

  const fetchData = useCallback(
    async (tab = 'dashboard') => {
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
    },
    [ensureTabData, setLoading, showNotification]
  );

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
