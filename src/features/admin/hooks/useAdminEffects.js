import { useEffect } from 'react';

const useAdminEffects = ({
  user,
  navigate,
  fetchData,
  orders,
  ordersApi,
  setOrders,
  activeTab,
  latestKnownOrderIdRef,
  showNotification,
  loadDailySalesBills,
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
    if (!user) return;
    if (user.role !== 'admin') {
      navigate('/');
      return;
    }

    fetchData();
  }, [user, navigate, fetchData]);

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
    if (!user || user.role !== 'admin' || activeTab !== 'orders') return;
    let cancelled = false;
    const pollOrders = async (initialLoad = false) => {
      try {
        const rows = await ordersApi.getAll();
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        const latestId = list.reduce((maxId, row) => Math.max(maxId, Number(row?.id || 0)), 0);
        if (!initialLoad && latestId > latestKnownOrderIdRef.current) {
          showNotification('New order received. List refreshed.', 'success');
        }
        latestKnownOrderIdRef.current = Math.max(latestKnownOrderIdRef.current, latestId);
        setOrders(list);
      } catch (_) {
        // keep polling silent
      }
    };

    pollOrders(true);
    const timer = window.setInterval(() => pollOrders(false), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab, user, ordersApi, setOrders, showNotification, latestKnownOrderIdRef]);

  useEffect(() => {
    if (!user || user.role !== 'admin' || activeTab !== 'daily-sales') return;
    void loadDailySalesBills({ silent: false });
  }, [activeTab, user, loadDailySalesBills]);

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
    window.localStorage.setItem('admin-products-visible-columns', JSON.stringify(productTableVisibleColumns));
  }, [productTableVisibleColumns]);

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
