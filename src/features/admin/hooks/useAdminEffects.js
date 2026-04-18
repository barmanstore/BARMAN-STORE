import { useEffect, useRef } from 'react';
import { hasCapability } from '../../../shared/auth/capabilities';
import { safeLocalStorageSet } from '../../../shared/utils/storage';

const isUnauthorizedError = (error) => Number(error?.status || 0) === 401;
const PRODUCT_TABLE_FILTERS_STORAGE_KEY = 'admin-products-table-filters';

const useAdminEffects = ({
  user,
  navigate,
  ensureTabData,
  setLoading,
  orders,
  activeTab,
  ordersPage,
  ordersSearchQuery,
  loadOrdersPage,
  usersPage,
  setUsersPage,
  usersSearchQuery,
  loadUsersPage,
  latestKnownOrderIdRef,
  showNotification,
  loadDailySalesBills,
  dailySalesDate,
  productTableSearch,
  productTableCategoryFilter,
  productTableStatusFilter,
  productTableLowStockOnly,
  productColumnPickerRef,
  tableEditId,
  tableEditFocusField,
  tableEditFieldRefs,
  productViewMode,
  dashboardDensity,
  productTableVisibleColumns,
  desktopActiveGroup,
  desktopPanelCollapsed,
}) => {
  const userId = Number(user?.id || 0) || 0;
  const authToken = String(user?.token || '').trim();
  const canViewBackoffice = hasCapability(user, 'view_backoffice');
  const didResolveInitialRouteRef = useRef(false);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleOutsideClick = (event) => {
      const node = productColumnPickerRef.current;
      if (!node || !node.hasAttribute('open')) return;
      if (node.contains(event.target)) return;
      node.removeAttribute('open');
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [productColumnPickerRef]);

  useEffect(() => {
    if (!userId) return;
    if (!authToken) {
      setLoading(false);
      return;
    }
    if (!canViewBackoffice) {
      navigate('/');
      return;
    }
    if (activeTab === 'dashboard' || activeTab === 'products') {
      const showGlobalLoading = !didResolveInitialRouteRef.current;
      void ensureTabData(activeTab, { showGlobalLoading }).finally(() => {
        didResolveInitialRouteRef.current = true;
      });
      return;
    }
    if (!didResolveInitialRouteRef.current) {
      didResolveInitialRouteRef.current = true;
      setLoading(false);
    }
  }, [activeTab, authToken, canViewBackoffice, ensureTabData, navigate, setLoading, userId]);

  useEffect(() => {
    const maxOrderId = (Array.isArray(orders) ? orders : []).reduce(
      (maxId, row) => Math.max(maxId, Number(row?.id || 0)),
      0
    );
    if (maxOrderId > latestKnownOrderIdRef.current) {
      latestKnownOrderIdRef.current = maxOrderId;
    }
  }, [orders, latestKnownOrderIdRef]);

  useEffect(() => {
    setUsersPage(1);
  }, [usersSearchQuery, setUsersPage]);

  useEffect(() => {
    if (!userId || !authToken || !canViewBackoffice || activeTab !== 'orders') return;
    let cancelled = false;
    let intervalId = null;
    const pollOrders = async (initialLoad = false) => {
      try {
        const result = await loadOrdersPage({
          page: ordersPage,
          query: ordersSearchQuery,
          silent: !initialLoad,
        });
        if (cancelled) return;
        const list = Array.isArray(result?.items) ? result.items : [];
        const latestId = list.reduce((maxId, row) => Math.max(maxId, Number(row?.id || 0)), 0);
        if (!initialLoad && latestId > latestKnownOrderIdRef.current) {
          showNotification('New order received. List refreshed.', 'success');
        }
        latestKnownOrderIdRef.current = Math.max(latestKnownOrderIdRef.current, latestId);
      } catch (_) {
        // keep polling silent
      }
    };

    const startPolling = () => {
      void pollOrders(true);
      intervalId = window.setInterval(() => {
        void pollOrders(false);
      }, 10000);
    };

    const delayMs = ordersSearchQuery ? 180 : 0;
    const timer = window.setTimeout(startPolling, delayMs);
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      window.clearTimeout(timer);
    };
  }, [
    activeTab,
    authToken,
    canViewBackoffice,
    loadOrdersPage,
    latestKnownOrderIdRef,
    ordersPage,
    ordersSearchQuery,
    showNotification,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !authToken || !canViewBackoffice || activeTab !== 'users') return;
    const timer = window.setTimeout(
      () => {
        void loadUsersPage({ page: usersPage, query: usersSearchQuery, silent: false }).catch(
          (error) => {
            if (isUnauthorizedError(error)) return;
            showNotification(error?.message || 'Failed to load users', 'error');
          }
        );
      },
      usersSearchQuery ? 180 : 0
    );
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    authToken,
    canViewBackoffice,
    loadUsersPage,
    showNotification,
    userId,
    usersPage,
    usersSearchQuery,
  ]);

  useEffect(() => {
    if (!userId || !authToken || !canViewBackoffice || activeTab !== 'daily-sales') return;
    void loadDailySalesBills({ silent: false, dateKey: dailySalesDate });
  }, [activeTab, authToken, canViewBackoffice, dailySalesDate, loadDailySalesBills, userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-products-view', productViewMode);
  }, [productViewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-dashboard-density', dashboardDensity);
  }, [dashboardDensity]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      'admin-products-visible-columns',
      JSON.stringify(productTableVisibleColumns)
    );
  }, [productTableVisibleColumns]);

  useEffect(() => {
    safeLocalStorageSet(
      PRODUCT_TABLE_FILTERS_STORAGE_KEY,
      JSON.stringify({
        search: productTableSearch,
        category: productTableCategoryFilter,
        status: productTableStatusFilter,
        lowStockOnly: Boolean(productTableLowStockOnly),
      })
    );
  }, [
    productTableCategoryFilter,
    productTableLowStockOnly,
    productTableSearch,
    productTableStatusFilter,
  ]);

  useEffect(() => {
    if (!tableEditId) return;
    const node = tableEditFieldRefs.current[tableEditFocusField] || tableEditFieldRefs.current.name;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.focus();
      if (typeof node.select === 'function') node.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tableEditId, tableEditFocusField, tableEditFieldRefs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-sidebar-desktop-group', desktopActiveGroup);
  }, [desktopActiveGroup]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-sidebar-panel-collapsed', desktopPanelCollapsed ? '1' : '0');
  }, [desktopPanelCollapsed]);
};

export default useAdminEffects;
