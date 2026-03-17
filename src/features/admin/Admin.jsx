import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, X, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { statsApi, productsApi, ordersApi, usersApi, adminApi, billingApi, resolveMediaUrl } from '../../services/api';
import { getProductImageSrc, getProductFallbackImage } from '../../utils/productImage';
import { formatCurrency, getSignedCurrencyClassName, truncateUserName } from '../../utils/formatters';
import ProductForm from '../catalog/products/ProductForm';
import CategoryManagement from '../catalog/categories/CategoryManagement';
import DistributorManagement from '../distributors/DistributorManagement';
import PurchaseManagement from '../commerce/purchase/PurchaseManagement';
import StockLedgerHistory from '../inventory/StockLedgerHistory';
import ProductInsights from '../insights/ProductInsights';
import DistributorInsights from '../insights/DistributorInsights';
import CreditAgingReport from '../credits/reports/CreditAgingReport';
import UserEditModal from '../../shared/components/UserEditModal';
import BillingTab from '../sales/billing/BillingTab';
import BillsViewer from '../sales/billing/BillsViewer';
import OfferManagement from '../marketing/OfferManagement';
import CreditKhata from '../credits/khata/CreditKhata';
import CustomerRequestsAdmin from '../customerRequests/CustomerRequestsAdmin';
import AdminApproveModal from './components/AdminApproveModal';
import AdminExportModal from './components/AdminExportModal';
import DashboardSection from './sections/DashboardSection';
import DailySalesSection from './sections/DailySalesSection';
import ProductsSection from './sections/ProductsSection';
import OrdersSection from './sections/OrdersSection';
import UsersSection from './sections/UsersSection';
import CategoriesSection from './sections/CategoriesSection';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import useIsMobile from '../../hooks/useIsMobile';
import { MOBILE_ALLOWED_TABS, MOBILE_SIDEBAR_SECTIONS, SIDEBAR_SECTIONS } from './config/adminSidebarConfig';
import {
  PRODUCT_TABLE_ALL_COLUMN_KEYS,
  PRODUCT_TABLE_COLUMN_MIN_WIDTH,
  PRODUCT_TABLE_COLUMN_OPTIONS,
  PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
} from './config/productTableConfig';
import { asNumber, getBrandPath, getCategoryPath, toLocalDateKey } from './utils/adminHelpers';
import './Admin.css';
import './AdminStandard.css';

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};


function Admin({ user }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const tab = new URLSearchParams(window.location.search).get('tab');
    const allowedTabs = new Set([
      'dashboard', 'orders', 'offers', 'credit-aging',
      'products', 'categories',
      'billing', 'daily-sales', 'view-bills',
      'purchases', 'distributors', 'stock-ledger', 'product-insights', 'distributor-insights',
      'users', 'credit-khata', 'customer-requests'
    ]);
    return allowedTabs.has(tab) ? tab : 'dashboard';
  });
  const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, pendingOrders: 0 });
  const [visitorStats, setVisitorStats] = useState({
    onlineVisitors: 0,
    onlineLoggedInUsers: 0,
    uniqueSessionsToday: 0,
    uniqueSessionsMonth: 0,
    uniqueSessionsYear: 0,
  });
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [bills, setBills] = useState([]);
  const [dailySalesDate, setDailySalesDate] = useState(() => toLocalDateKey(new Date()) || '');
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  const [dailySalesError, setDailySalesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [notification, setNotification] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [modalOrder, setModalOrder] = useState(null);
  const [modalItems, setModalItems] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [billingPrefill, setBillingPrefill] = useState(null);
  const [proceedBillingOrderId, setProceedBillingOrderId] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [userAvatarErrors, setUserAvatarErrors] = useState({});
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('');
  const [usersSearchQuery, setUsersSearchQuery] = useState('');
  const [expandedUsersMap, setExpandedUsersMap] = useState({});
  const [dashboardDensity, setDashboardDensity] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    const saved = String(window.localStorage.getItem('admin-dashboard-density') || '').trim().toLowerCase();
    if (saved === 'compact' || saved === 'standard') return saved;
    return window.innerWidth <= 768 ? 'compact' : 'standard';
  });
  const [productViewMode, setProductViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'table';
    const saved = window.localStorage.getItem('admin-products-view');
    if (saved === 'table' || saved === 'grid') return saved;
    return window.innerWidth <= 768 ? 'grid' : 'table';
  });
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    image: ''
  });
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEditForm, setQuickEditForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    image: ''
  });
  const [productTableSearch, setProductTableSearch] = useState('');
  const [productTableSortField, setProductTableSortField] = useState('created_at');
  const [productTableSortDir, setProductTableSortDir] = useState('desc');
  const [productTableCategoryFilter, setProductTableCategoryFilter] = useState('');
  const [productTableStatusFilter, setProductTableStatusFilter] = useState('all');
  const [productTableLowStockOnly, setProductTableLowStockOnly] = useState(false);
  const [productTableVisibleColumns, setProductTableVisibleColumns] = useState(() => {
    if (typeof window === 'undefined') return PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS;
    const fallback = window.localStorage.getItem('admin-products-columns') === 'full'
      ? PRODUCT_TABLE_ALL_COLUMN_KEYS
      : PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS;
    try {
      const savedRaw = window.localStorage.getItem('admin-products-visible-columns');
      if (!savedRaw) return fallback;
      const saved = JSON.parse(savedRaw);
      if (!Array.isArray(saved)) return fallback;
      const normalized = PRODUCT_TABLE_ALL_COLUMN_KEYS.filter((key) => saved.includes(key));
      return normalized.length > 0 ? normalized : fallback;
    } catch (_) {
      return fallback;
    }
  });
  const [selectedProductId, setSelectedProductId] = useState(0);
  const [tableEditId, setTableEditId] = useState(null);
  const [tableEditFocusField, setTableEditFocusField] = useState('name');
  const [tableEditSaving, setTableEditSaving] = useState(false);
  const [productEditLoadingId, setProductEditLoadingId] = useState(null);
  const [tableEditForm, setTableEditForm] = useState({
    name: '',
    description: '',
    brand: '',
    content: '',
    purchase_pack_size: '',
    color: '',
    category: '',
    sku: '',
    barcode: '',
    price: '',
    mrp: '',
    uom: 'pcs',
    stock: '',
    expiry_date: '',
    defaultDiscount: '',
    discountType: 'fixed',
    is_active: true,
    image: ''
  });
  const [importFile, setImportFile] = useState(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [importPreviewData, setImportPreviewData] = useState(null);
  const [importAllowIdenticalRows, setImportAllowIdenticalRows] = useState([]);
  const [importBusy, setImportBusy] = useState(false);
  const importFileInputRef = useRef(null);
  const tableEditFieldRefs = useRef({});
  const productColumnPickerRef = useRef(null);
  const latestKnownOrderIdRef = useRef(0);
  const tabGroupMap = {
    dashboard: 'general',
    orders: 'general',
    offers: 'general',
    'credit-aging': 'general',
    products: 'products',
    categories: 'products',
    billing: 'billing',
    'daily-sales': 'billing',
    'view-bills': 'billing',
    purchases: 'purchase',
    distributors: 'purchase',
    'stock-ledger': 'purchase',
    'product-insights': 'purchase',
    'distributor-insights': 'purchase',
    users: 'users',
    'credit-khata': 'users',
    'customer-requests': 'users'
  };
  const [expandedGroups, setExpandedGroups] = useState({
    general: true,
    products: false,
    billing: false,
    purchase: false,
    users: false
  });
  const [desktopActiveGroup, setDesktopActiveGroup] = useState(() => {
    if (typeof window === 'undefined') return 'general';
    const saved = String(window.localStorage.getItem('admin-sidebar-desktop-group') || '').trim();
    const validKeys = new Set(SIDEBAR_SECTIONS.map((section) => section.key));
    return validKeys.has(saved) ? saved : 'general';
  });
  const [desktopPanelCollapsed, setDesktopPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('admin-sidebar-panel-collapsed') === '1';
  });

  useLockBodyScroll(isMobileSidebarOpen);

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
  }, []);

  const refreshAdminData = async () => {
    const [statsData, productsData, ordersData, usersData, analyticsData] = await Promise.all([
      statsApi.orders(),
      productsApi.getAll({ include_inactive: true }),
      ordersApi.getAll(),
      usersApi.getAll(),
      adminApi.getAnalyticsSummary(),
    ]);

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
  };

  const loadDailySalesBills = async ({ silent = false } = {}) => {
    try {
      if (!silent) setDailySalesLoading(true);
      setDailySalesError('');
      const rows = await billingApi.getAll();
      setBills(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (!silent) setDailySalesError(error.message || 'Failed to load bills for daily summary');
    } finally {
      if (!silent) setDailySalesLoading(false);
    }
  };

  const openApproveModal = async (orderId) => {
    try {
      setModalLoading(true);
      const order = await ordersApi.getById(orderId);
      setModalOrder(order);
      // Fetch current stock for each product in order items.
      const items = order.items || [];
      const itemsWithStock = await Promise.all(items.map(async (it) => {
        try {
          const p = await productsApi.getById(it.product_id);
          return { ...it, stock: p.stock };
        } catch (_) {
          return { ...it, stock: undefined };
        }
      }));
      setModalItems(itemsWithStock);
      setShowApproveModal(true);
    } catch (err) {
      showNotification(err.message || 'Failed to load order details', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const confirmApprove = async () => {
    if (!modalOrder) return;
    try {
      setModalLoading(true);
      await ordersApi.updateStatus(modalOrder.id, 'received', 'Marked received via admin modal', user.id);
      setShowApproveModal(false);
      await refreshAdminData();
      showNotification('Order marked received and stock applied', 'success');
      await fetch(`/api/notify-order/${modalOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'received' })
      }).catch(() => {});
    } catch (err) {
      showNotification(err.message || 'Failed to mark order received', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (id, status) => {
    if (status !== 'received') return;
    if (!window.confirm('Mark this order as received and apply stock?')) return;
    try {
      await ordersApi.updateStatus(id, status, `Order ${status} via admin panel`, user.id);
      await refreshAdminData();
      showNotification(`Order ${status} successfully`, 'success');
    } catch (error) {
      console.error('Failed to update order status', error);
      showNotification(error.message || 'Failed to update order status', 'error');
    }
  };

  const handleApplyPendingFulfillment = async (orderId) => {
    if (!orderId) return;
    try {
      await ordersApi.updateStatus(
        orderId,
        'received',
        'Pending fulfillment re-applied via admin panel',
        user.id,
        { reapply_pending: true }
      );
      await refreshAdminData();
      showNotification('Pending quantity re-checked against current stock', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to apply pending fulfillment', 'error');
    }
  };

  const buildAddressTextFromOrder = (order) => {
    const shipping = order?.shipping_address && typeof order.shipping_address === 'object'
      ? order.shipping_address
      : {};
    const parts = [
      shipping.street,
      shipping.city,
      shipping.state,
      shipping.zip,
      shipping.country,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return parts.join(', ');
  };

  const buildBillingPrefillFromOrder = (order) => {
    const customerId = Number(order?.user_id || 0) || null;
    const rows = Array.isArray(order?.items) ? order.items : [];
    return {
      key: `order_${Number(order?.id || 0)}_${Date.now()}`,
      source: {
        order_id: Number(order?.id || 0) || null,
        order_number: String(order?.order_number || '').trim(),
      },
      customer: {
        id: customerId,
        name: String(order?.customer_name || '').trim(),
        email: String(order?.customer_email || '').trim(),
        phone: String(order?.customer_phone || '').trim(),
        address: buildAddressTextFromOrder(order),
      },
      items: rows.map((item, index) => ({
        id: `prefill_${Number(order?.id || 0)}_${index}`,
        name: String(item?.product_name || item?.name || 'Item').trim() || 'Item',
        productId: Number(item?.product_id || 0) > 0 ? Number(item.product_id) : null,
        price: Math.max(0, Number(item?.price || 0)),
        qty: Math.max(1, Number(item?.quantity || 1)),
        unit: String(item?.uom || item?.unit || 'pcs').trim() || 'pcs',
        disc: 0,
        discType: 'fixed',
      })),
      note: `Prepared from order ${String(order?.order_number || `#${order?.id || ''}`)}`,
    };
  };

  const handleProceedToBilling = async (orderInput) => {
    const orderId = Number(orderInput?.id || 0);
    if (!orderId) return;
    try {
      setProceedBillingOrderId(orderId);
      let fullOrder = Array.isArray(orderInput?.items)
        ? orderInput
        : await ordersApi.getById(orderId);
      const currentStatus = String(fullOrder?.status || '').trim().toLowerCase();
      if (currentStatus === 'ordered') {
        const confirmReceiveThenBill = window.confirm(
          'This order is still pending receipt.\n\nMark as received and open billing now?'
        );
        if (!confirmReceiveThenBill) return;
        await ordersApi.updateStatus(orderId, 'received', 'Auto-confirmed before billing', user.id);
        await refreshAdminData();
        fullOrder = await ordersApi.getById(orderId);
        showNotification('Order marked received. Billing is now open.', 'success');
      }
      const prefill = buildBillingPrefillFromOrder(fullOrder);
      setBillingPrefill(prefill);
      handleTabChange('billing');
      setShowApproveModal(false);
      showNotification('Order loaded in billing form', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to open billing with this order', 'error');
    } finally {
      setProceedBillingOrderId(0);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') {
      navigate('/');
      return;
    }

    fetchData();
  }, [user, navigate]);

  useEffect(() => {
    const maxOrderId = (Array.isArray(orders) ? orders : []).reduce(
      (maxId, row) => Math.max(maxId, Number(row?.id || 0)),
      0
    );
    if (maxOrderId > latestKnownOrderIdRef.current) {
      latestKnownOrderIdRef.current = maxOrderId;
    }
  }, [orders]);

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
  }, [activeTab, user]);

  useEffect(() => {
    if (!user || user.role !== 'admin' || activeTab !== 'daily-sales') return;
    void loadDailySalesBills({ silent: false });
  }, [activeTab, user]);

  useEffect(() => {
    const group = tabGroupMap[activeTab];
    if (!group) return;
    setExpandedGroups(prev => ({ ...prev, [group]: true }));
    setDesktopActiveGroup(group);
  }, [activeTab]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (!tabFromUrl || !tabGroupMap[tabFromUrl]) return;
    const nextTab = isMobile && !MOBILE_ALLOWED_TABS.has(tabFromUrl)
      ? 'dashboard'
      : tabFromUrl;
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [searchParams, activeTab, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    if (MOBILE_ALLOWED_TABS.has(activeTab)) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'dashboard');
    setSearchParams(next, { replace: true });
    setActiveTab('dashboard');
  }, [activeTab, isMobile, searchParams, setSearchParams]);

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
  }, [tableEditId, tableEditFocusField]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-sidebar-desktop-group', desktopActiveGroup);
  }, [desktopActiveGroup]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-sidebar-panel-collapsed', desktopPanelCollapsed ? '1' : '0');
  }, [desktopPanelCollapsed]);

  const toggleSidebarGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleDesktopGroupSelect = (groupKey) => {
    setDesktopActiveGroup(groupKey);
    if (desktopPanelCollapsed) {
      setDesktopPanelCollapsed(false);
    }
  };

  const desktopCurrentSection = SIDEBAR_SECTIONS.find((section) => section.key === desktopActiveGroup) || SIDEBAR_SECTIONS[0];
  const mobileSidebarSections = MOBILE_SIDEBAR_SECTIONS;

  const isTabAllowed = (tab) => !isMobile || MOBILE_ALLOWED_TABS.has(tab);

  const handleTabChange = (tab) => {
    const nextTab = isTabAllowed(tab) ? tab : 'dashboard';
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
    if (isMobile) {
      setIsMobileSidebarOpen(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      await refreshAdminData();
    } catch (error) {
      console.error('Error fetching data:', error);
      showNotification(error.message || 'Failed to load admin dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserCompactRow = (userId) => {
    setExpandedUsersMap((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleCompactRowKeyToggle = (event, userId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleUserCompactRow(userId);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Mark this product as inactive?')) return;
    
    try {
      await productsApi.delete(id);
      const updatedProducts = await productsApi.getAll({ include_inactive: true });
      setProducts(updatedProducts);
      showNotification('Product marked inactive', 'success');
      
      // Refresh stats
      const statsData = await statsApi.orders();
      setStats(statsData);
    } catch (error) {
      showNotification('Failed to delete product', 'error');
    }
  };

  const handlePermanentDeleteProduct = async (product) => {
    if (Number(product?.is_active ?? 1) === 1) {
      showNotification('Deactivate product before permanent delete', 'error');
      return;
    }
    const productName = String(product?.name || '').trim();
    const confirmed = window.prompt(
      `Permanent delete "${productName}"? This cannot be undone.\nType DELETE to confirm:`,
      ''
    );
    if (confirmed !== 'DELETE') return;

    try {
      await productsApi.deletePermanent(product.id);
      const updatedProducts = await productsApi.getAll({ include_inactive: true });
      setProducts(updatedProducts);
      showNotification('Product permanently deleted', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to permanently delete product', 'error');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    
    try {
      await usersApi.delete(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      showNotification('Customer deleted successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to delete customer', 'error');
    }
  };

  const handleEditProduct = async (product) => {
    const productId = Number(product?.id || 0);
    if (!productId) return;
    try {
      setProductEditLoadingId(productId);
      const fullProduct = await productsApi.getById(productId, { include_inactive: 'true' });
      setEditingProduct(fullProduct || product);
      setShowProductForm(true);
    } catch (error) {
      showNotification(error.message || 'Failed to load product details', 'error');
      setEditingProduct(product);
      setShowProductForm(true);
    } finally {
      setProductEditLoadingId(null);
    }
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setShowProductForm(true);
  };

  const handleProductSave = async (meta = {}) => {
    try {
      const updatedProducts = await productsApi.getAll({ include_inactive: true });
      setProducts(updatedProducts);
      
      // Refresh stats
      const statsData = await statsApi.orders();
      setStats(statsData);

      if (meta?.mode === 'create' && Number(meta?.createdCount) > 1) {
        showNotification(`${meta.createdCount} products added successfully`, 'success');
      } else if (meta?.mode === 'edit_split') {
        const created = Number(meta?.createdCount || 0);
        showNotification(`Product updated and ${created} additional variant(s) created successfully`, 'success');
      } else if (meta?.mode === 'edit') {
        showNotification('Product updated successfully', 'success');
      } else if (meta?.mode === 'create') {
        showNotification('Product added successfully', 'success');
      } else {
        showNotification(editingProduct ? 'Product updated successfully' : 'Product added successfully', 'success');
      }
    } catch (error) {
      showNotification('Failed to refresh products', 'error');
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const closeNotification = () => {
    setNotification(null);
  };

  const productCategories = Array.from(
    new Set(products.map((p) => getCategoryPath(p)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const activeProductsCount = useMemo(
    () => products.filter((p) => Number(p?.is_active ?? 1) === 1).length,
    [products]
  );

  const inactiveProductsCount = Math.max(0, products.length - activeProductsCount);

  const customerUsers = useMemo(
    () => users.filter((u) => String(u?.role || '').toLowerCase() !== 'admin'),
    [users]
  );
  const adminUsers = useMemo(
    () => users.filter((u) => String(u?.role || '').toLowerCase() === 'admin'),
    [users]
  );
  const filteredUsers = useMemo(() => {
    const query = String(usersSearchQuery || '').trim().toLowerCase();
    const matchesQuery = (entry) => {
      if (!query) return true;
      const searchable = [
        entry?.id,
        entry?.name,
        entry?.email,
        entry?.phone,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return searchable.includes(query);
    };
    return {
      admins: adminUsers.filter(matchesQuery),
      customers: customerUsers.filter(matchesQuery),
    };
  }, [adminUsers, customerUsers, usersSearchQuery]);
  const filteredUsersCount = filteredUsers.admins.length + filteredUsers.customers.length;

  const visibleOrders = useMemo(() => {
    const query = String(ordersSearchQuery || '').trim().toLowerCase();
    const list = Array.isArray(orders) ? [...orders] : [];

    const sorted = list.sort(
      (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );

    if (!query) return sorted;

    return sorted.filter((order) => {
      const searchable = [
        order?.id,
        order?.order_number,
        order?.customer_name,
        order?.customer_email,
        order?.status,
        order?.total_amount,
        order?.bill_id,
        order?.linked_bill_number,
        order?.created_at,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return searchable.includes(query);
    });
  }, [orders, ordersSearchQuery]);

  const pendingOrdersList = useMemo(
    () => orders.filter((o) => String(o?.status || '').toLowerCase() === 'ordered'),
    [orders]
  );

  const recentOrders = useMemo(
    () => [...orders]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3),
    [orders]
  );

  const lowStockProducts = useMemo(
    () => products
      .filter((p) => Number(p?.is_active ?? 1) === 1 && asNumber(p?.stock, 0) <= 10)
      .sort((a, b) => asNumber(a?.stock, 0) - asNumber(b?.stock, 0))
      .slice(0, 3),
    [products]
  );

  const recentCustomers = useMemo(
    () => [...customerUsers]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 3),
    [customerUsers]
  );

  const selectedDateKey = String(dailySalesDate || '').trim() || toLocalDateKey(new Date());

  const selectedSalesBills = useMemo(
    () => (Array.isArray(bills) ? bills : [])
      .filter((bill) => String(bill?.bill_type || 'sales').trim().toLowerCase() === 'sales')
      .filter((bill) => toLocalDateKey(bill?.created_at) === selectedDateKey)
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()),
    [bills, selectedDateKey]
  );

  const dailySalesSummary = useMemo(() => {
    const totals = selectedSalesBills.reduce((acc, bill) => {
      acc.totalBilled += asNumber(bill?.total_amount, 0);
      acc.cashCollected += asNumber(bill?.paid_amount, 0);
      acc.creditIssued += asNumber(bill?.credit_amount, 0);
      if (String(bill?.payment_status || '').trim().toLowerCase() === 'paid') {
        acc.paidBills += 1;
      } else {
        acc.pendingBills += 1;
      }
      return acc;
    }, {
      totalBilled: 0,
      cashCollected: 0,
      creditIssued: 0,
      paidBills: 0,
      pendingBills: 0,
    });
    const txCount = selectedSalesBills.length;
    return {
      ...totals,
      txCount,
      expectedDrawerCash: totals.cashCollected,
      avgTicket: txCount > 0 ? totals.totalBilled / txCount : 0,
    };
  }, [selectedSalesBills]);

  const visibleProducts = useMemo(() => {
    const query = String(productTableSearch || '').trim().toLowerCase();
    let list = Array.isArray(products) ? [...products] : [];

    if (productTableCategoryFilter) {
      list = list.filter((product) => getCategoryPath(product) === productTableCategoryFilter);
    }

    if (productTableStatusFilter !== 'all') {
      list = list.filter((product) => {
        const isActive = Number(product.is_active ?? 1) === 1;
        const stock = asNumber(product.stock, 0);
        if (productTableStatusFilter === 'active') return isActive;
        if (productTableStatusFilter === 'inactive') return !isActive;
        if (productTableStatusFilter === 'available') return isActive && stock > 0;
        if (productTableStatusFilter === 'out_of_stock') return isActive && stock <= 0;
        return true;
      });
    }

    if (productTableLowStockOnly) {
      list = list.filter((product) => asNumber(product.stock, 0) <= 10);
    }

    if (query) {
      list = list.filter((product) => {
        const searchable = [
          product.id,
          product.name,
          product.description,
          getBrandPath(product),
          product.sub_brand,
          product.brand_path,
          product.content,
          product.purchase_pack_size,
          product.color,
          getCategoryPath(product),
          product.subcategory,
          product.category_path,
          product.sku,
          product.barcode,
          product.price,
          product.mrp,
          product.uom,
          product.base_unit,
          product.uom_type,
          product.conversion_factor,
          product.stock,
          product.expiry_date,
          product.defaultDiscount,
          product.default_discount,
          product.discountType,
          product.discount_type,
          Number(product?.is_active ?? 1) === 1 ? 'active' : 'inactive',
          product.created_at,
          product.image,
        ]
          .map((value) => String(value ?? '').toLowerCase())
          .join(' ');
        return searchable.includes(query);
      });
    }

    const readSortValue = (product) => {
      switch (productTableSortField) {
        case 'id':
          return asNumber(product.id, 0);
        case 'name':
          return String(product.name || '').toLowerCase();
        case 'category':
          return getCategoryPath(product).toLowerCase();
        case 'brand':
          return getBrandPath(product).toLowerCase();
        case 'sku':
          return String(product.sku || '').toLowerCase();
        case 'barcode':
          return String(product.barcode || '').toLowerCase();
        case 'price':
          return asNumber(product.price, 0);
        case 'mrp':
          return asNumber(product.mrp, 0);
        case 'stock':
          return asNumber(product.stock, 0);
        case 'defaultDiscount':
          return asNumber(product.defaultDiscount, 0);
        case 'purchase_pack_size':
          return asNumber(product.purchase_pack_size, 0);
        case 'is_active':
          return Number(product.is_active ?? 1);
        case 'created_at':
          return new Date(product.created_at || 0).getTime();
        case 'src':
          return String(product.image || '').toLowerCase();
        default:
          return String(product[productTableSortField] ?? '').toLowerCase();
      }
    };

    list.sort((a, b) => {
      const av = readSortValue(a);
      const bv = readSortValue(b);
      if (av < bv) return productTableSortDir === 'asc' ? -1 : 1;
      if (av > bv) return productTableSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    products,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir
  ]);

  const productTableAllColumnsSelected = productTableVisibleColumns.length === PRODUCT_TABLE_ALL_COLUMN_KEYS.length;
  const isProductTableColumnVisible = (key) => productTableVisibleColumns.includes(key);

  const toggleProductTableColumn = (key) => {
    setProductTableVisibleColumns((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((item) => item !== key);
        return next.length > 0 ? next : prev;
      }
      const nextSet = new Set([...prev, key]);
      return PRODUCT_TABLE_ALL_COLUMN_KEYS.filter((item) => nextSet.has(item));
    });
  };

  const toggleSelectAllProductTableColumns = (checked) => {
    if (checked) {
      setProductTableVisibleColumns(PRODUCT_TABLE_ALL_COLUMN_KEYS);
      return;
    }
    setProductTableVisibleColumns(PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS);
  };

  const productTableCalculatedMinWidth = useMemo(() => {
    const visibleTotal = productTableVisibleColumns.reduce(
      (sum, key) => sum + (PRODUCT_TABLE_COLUMN_MIN_WIDTH[key] || 80),
      0
    );
    return Math.max(420, visibleTotal + 80);
  }, [productTableVisibleColumns]);

  const selectedVisibleProduct = useMemo(() => {
    const id = Number(selectedProductId || 0);
    if (!id) return null;
    return visibleProducts.find((product) => Number(product.id) === id) || null;
  }, [selectedProductId, visibleProducts]);

  const effectiveProductViewMode = isMobile ? 'grid' : productViewMode;

  const showProductsImportCard = !isMobile && Boolean(
    importPreviewData?.batch_id
    || importPreviewData?.summary
    || (Array.isArray(importPreviewData?.preview) && importPreviewData.preview.length > 0)
  );

  const toggleProductTableSort = (field) => {
    if (productTableSortField === field) {
      setProductTableSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setProductTableSortField(field);
    setProductTableSortDir(field === 'name' || field === 'brand' || field === 'category' || field === 'sku' ? 'asc' : 'desc');
  };

  const getSortIndicator = (field) => {
    if (productTableSortField !== field) return '';
    return productTableSortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const setTableEditFieldRef = (field) => (node) => {
    if (node) {
      tableEditFieldRefs.current[field] = node;
      return;
    }
    delete tableEditFieldRefs.current[field];
  };

  const openTableEdit = (product, focusField = 'name') => {
    setTableEditId(product.id);
    setSelectedProductId(Number(product.id) || 0);
    setTableEditFocusField(focusField);
    setTableEditForm({
      name: product.name || '',
      description: product.description || '',
      brand: getBrandPath(product),
      content: product.content || '',
      purchase_pack_size: String(product.purchase_pack_size ?? ''),
      color: product.color || '',
      category: getCategoryPath(product),
      sku: product.sku || '',
      barcode: product.barcode || '',
      price: String(product.price ?? ''),
      mrp: String(product.mrp ?? ''),
      uom: product.uom || 'pcs',
      stock: String(product.stock ?? 0),
      expiry_date: product.expiry_date ? String(product.expiry_date).slice(0, 10) : '',
      defaultDiscount: String(product.defaultDiscount ?? 0),
      discountType: product.discountType || 'fixed',
      is_active: Number(product.is_active ?? 1) === 1,
      image: product.image || ''
    });
    setQuickEditId(null);
  };

  const handleTableCellClick = (product, field = 'name') => {
    if (!product) return;
    setSelectedProductId(Number(product.id) || 0);
    if (tableEditId !== product.id) {
      openTableEdit(product, field);
      return;
    }
    setTableEditFocusField(field);
  };

  const cancelTableEdit = () => {
    setTableEditId(null);
    setTableEditFocusField('name');
    setTableEditSaving(false);
  };

  const handleTableEditChange = (field, value) => {
    setTableEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTableEditSave = async (product) => {
    const packSizeRaw = String(tableEditForm.purchase_pack_size || '').trim();
    const packSizeValue = packSizeRaw === '' ? null : asNumber(packSizeRaw, 0);
    const payload = {
      name: String(tableEditForm.name || '').trim(),
      description: String(tableEditForm.description || '').trim(),
      brand: String(tableEditForm.brand || '').trim(),
      content: String(tableEditForm.content || '').trim(),
      purchase_pack_size: packSizeValue,
      color: String(tableEditForm.color || '').trim(),
      category: String(tableEditForm.category || '').trim(),
      sku: String(tableEditForm.sku || '').trim(),
      barcode: String(tableEditForm.barcode || '').trim(),
      price: asNumber(tableEditForm.price, 0),
      mrp: asNumber(tableEditForm.mrp, 0),
      uom: String(tableEditForm.uom || 'pcs').trim() || 'pcs',
      stock: asNumber(tableEditForm.stock, 0),
      expiry_date: tableEditForm.expiry_date || null,
      defaultDiscount: asNumber(tableEditForm.defaultDiscount, 0),
      discountType: tableEditForm.discountType === 'percentage' ? 'percentage' : 'fixed',
      image: String(tableEditForm.image || '').trim(),
      is_active: Number(product.is_active ?? 1) === 0 ? 1 : (tableEditForm.is_active ? 1 : 0),
      base_unit: product.base_unit || 'pcs',
      uom_type: product.uom_type || 'selling',
      conversion_factor: asNumber(product.conversion_factor, 1) || 1
    };

    if (!payload.name) {
      showNotification('Product name is required', 'error');
      return;
    }
    if (!payload.category) {
      showNotification('Category is required', 'error');
      return;
    }
    if (!(payload.price > 0)) {
      showNotification('Price must be greater than 0', 'error');
      return;
    }
    if (payload.stock < 0) {
      showNotification('Stock must be 0 or more', 'error');
      return;
    }

    try {
      setTableEditSaving(true);
      try {
        await productsApi.update(product.id, payload);
      } catch (error) {
        const conflictType = String(error?.payload?.conflict_type || '');
        if (Number(error?.status) === 409 && conflictType === 'identical') {
          const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
          if (!ok) return;
          await productsApi.update(product.id, { ...payload, allow_identical: true });
        } else {
          throw error;
        }
      }
      await handleProductSave({ mode: 'edit', createdCount: 0 });
      cancelTableEdit();
    } catch (error) {
      showNotification(error.message || 'Failed to update product', 'error');
    } finally {
      setTableEditSaving(false);
    }
  };

  const resetQuickAdd = () => {
    setQuickAddForm({
      name: '',
      category: '',
      price: '',
      stock: '',
      image: ''
    });
  };

  const makeQuickPayload = (form, baseProduct = {}) => {
    const cleanName = String(form.name || '').trim();
    const cleanCategory = String(form.category || '').trim();
    const cleanDescription = String(baseProduct.description || '').trim() || `${cleanName} product`;
    const price = Number(form.price || 0);
    const stock = Number(form.stock || 0);

    return {
      name: cleanName,
      description: cleanDescription,
      brand: getBrandPath(baseProduct) || '',
      content: baseProduct.content || '',
      color: baseProduct.color || '',
      price,
      mrp: Number(baseProduct.mrp || 0) > 0 ? Number(baseProduct.mrp) : price,
      uom: baseProduct.uom || 'pcs',
      base_unit: baseProduct.base_unit || 'pcs',
      uom_type: baseProduct.uom_type || 'selling',
      conversion_factor: Number(baseProduct.conversion_factor || 1) || 1,
      barcode: baseProduct.barcode || '',
      sku: baseProduct.sku || '',
      image: String(form.image || '').trim(),
      stock,
      expiry_date: baseProduct.expiry_date || null,
      category: cleanCategory,
      defaultDiscount: Number(baseProduct.defaultDiscount || 0) || 0,
      discountType: baseProduct.discountType || 'fixed'
    };
  };

  const validateQuickForm = (form) => {
    if (!String(form.name || '').trim()) {
      showNotification('Product name is required', 'error');
      return false;
    }
    if (!String(form.category || '').trim()) {
      showNotification('Category is required', 'error');
      return false;
    }
    if (!(Number(form.price) > 0)) {
      showNotification('Price must be greater than 0', 'error');
      return false;
    }
    if (!(Number(form.stock) >= 0)) {
      showNotification('Stock must be 0 or more', 'error');
      return false;
    }
    return true;
  };

  const handleQuickAddSave = async () => {
    if (!validateQuickForm(quickAddForm)) return;

    try {
      setQuickSaving(true);
      const payload = makeQuickPayload(quickAddForm);
      try {
        await productsApi.create(payload);
      } catch (error) {
        const conflictType = String(error?.payload?.conflict_type || '');
        if (Number(error?.status) === 409 && conflictType === 'identical') {
          const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
          if (!ok) return;
          await productsApi.create({ ...payload, allow_identical: true });
        } else {
          throw error;
        }
      }
      await handleProductSave({ mode: 'create', createdCount: 1 });
      setShowQuickAdd(false);
      resetQuickAdd();
    } catch (error) {
      showNotification(error.message || 'Failed to add product', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const startQuickEdit = (product) => {
    setQuickEditId(product.id);
    setQuickEditForm({
      name: product.name || '',
      category: getCategoryPath(product),
      price: String(product.price ?? ''),
      stock: String(product.stock ?? 0),
      image: product.image || ''
    });
  };

  const cancelQuickEdit = () => {
    setQuickEditId(null);
    setQuickEditForm({
      name: '',
      category: '',
      price: '',
      stock: '',
      image: ''
    });
  };

  const handleQuickEditSave = async (product) => {
    if (!validateQuickForm(quickEditForm)) return;

    try {
      setQuickSaving(true);
      const payload = makeQuickPayload(quickEditForm, product);
      try {
        await productsApi.update(product.id, payload);
      } catch (error) {
        const conflictType = String(error?.payload?.conflict_type || '');
        if (Number(error?.status) === 409 && conflictType === 'identical') {
          const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
          if (!ok) return;
          await productsApi.update(product.id, { ...payload, allow_identical: true });
        } else {
          throw error;
        }
      }
      await handleProductSave({ mode: 'edit', createdCount: 0 });
      cancelQuickEdit();
    } catch (error) {
      showNotification(error.message || 'Failed to update product', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const downloadProtectedFile = async (url, fallbackName) => {
    let token = user?.token || null;
    if (!token) {
      try {
        const raw = localStorage.getItem('user') || '{}';
        token = JSON.parse(raw)?.token || null;
      } catch (_) {
        token = null;
      }
    }
    if (!token) {
      throw new Error('Please login again. Missing auth token.');
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Download failed');
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const disposition = String(response.headers.get('Content-Disposition') || '');
    const match = disposition.match(/filename="?([^"]+)"?/i);
    anchor.href = href;
    anchor.download = match?.[1] || fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  const handleExportProducts = async () => {
    const format = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
    try {
      // include_inactive=true ensures all existing DB products are exported.
      const url = productsApi.getExportUrl(format, true);
      await downloadProtectedFile(url, `products-export.${format === 'xlsx' ? 'xlsx' : 'csv'}`);
      showNotification('Products exported successfully', 'success');
      setShowExportDialog(false);
    } catch (error) {
      showNotification(error.message || 'Failed to export products', 'error');
    }
  };

  const handleStartImport = () => {
    if (importBusy) return;
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setImportFile(file);
    await handlePreviewImport(file);
  };

  const handlePreviewImport = async (selectedFile = null) => {
    const file = selectedFile || importFile;
    if (!file) {
      showNotification('Select a CSV/XLSX file first', 'error');
      return;
    }
    try {
      setImportBusy(true);
      const base64 = await readFileAsBase64(file);
      const data = await productsApi.importPreview({
        file_name: file.name,
        file_content_base64: base64,
        mode: 'upsert',
        stock_mode: 'replace',
      });
      setImportPreviewData(data);
      setImportAllowIdenticalRows([]);
      showNotification('Import preview generated. Review and confirm.', 'success');
    } catch (error) {
      setImportPreviewData(null);
      showNotification(error.message || 'Failed to preview import', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreviewData?.batch_id || !importPreviewData?.checksum) {
      showNotification('Generate preview before confirming import', 'error');
      return;
    }
    try {
      setImportBusy(true);
      const result = await productsApi.importConfirm({
        batch_id: importPreviewData.batch_id,
        checksum: importPreviewData.checksum,
        allow_identical_rows: importAllowIdenticalRows,
      });
      await handleProductSave({ mode: 'create' });
      setImportPreviewData(null);
      setImportFile(null);
      setImportAllowIdenticalRows([]);
      showNotification(`Import applied. Created: ${result.created}, Updated: ${result.updated}`, 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to confirm import', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleEditUser = (user) => {
    if (!user || !user.email_verified || !user.phone_verified) {
      showNotification('User type can be changed only when both email and phone are verified.', 'error');
      return;
    }
    setEditingUser(user);
  };

  const handleUserSave = async () => {
    try {
      const updatedUsers = await usersApi.getAll();
      setUsers(updatedUsers);
      showNotification('User updated successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setIsCreatingUser(true);
    setShowUserForm(true);
  };

  const handleCreateUser = async () => {
    try {
      const updatedUsers = await usersApi.getAll();
      setUsers(updatedUsers);
      showNotification('User created successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <h1>Access Denied</h1>
          <p>You must be an admin to access this page.</p>
          <Link to="/login" className="admin-btn">Go to Login</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-content">
          <div className="admin-loading-state">
            <h2>Loading admin dashboard...</h2>
            <p>Fetching orders, products, users and summary stats.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-shell">
      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <span>{notification.message}</span>
          <button onClick={closeNotification}><X size={16} /></button>
        </div>
      )}

      <div className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-menu-btn"
          onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
          aria-label="Toggle admin menu"
        >
          {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h2>Admin Panel</h2>
      </div>

      <div className="admin-shell-body">
        <aside className={`admin-sidebar-shell ${desktopPanelCollapsed ? 'panel-collapsed' : ''}`} aria-label="Admin desktop navigation">
          <div className="admin-sidebar-rail">
            <div className="admin-sidebar-rail-top">
              <button
                type="button"
                className="rail-item rail-collapse-toggle"
                onClick={() => setDesktopPanelCollapsed((prev) => !prev)}
                aria-label={desktopPanelCollapsed ? 'Expand sidebar panel' : 'Collapse sidebar panel'}
                title={desktopPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                {desktopPanelCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
              {SIDEBAR_SECTIONS.map((section) => {
                const SectionIcon = section.icon;
                const isSectionActive = section.key === desktopActiveGroup;
                return (
                  <button
                    key={section.key}
                    type="button"
                    className={`rail-item ${isSectionActive ? 'active' : ''}`}
                    onClick={() => handleDesktopGroupSelect(section.key)}
                    aria-label={section.label}
                    title={section.label}
                  >
                    <SectionIcon size={18} />
                  </button>
                );
              })}
            </div>
            <div className="admin-sidebar-rail-bottom">
              <Link to="/" className="rail-item rail-home-link" aria-label="Back to Store" title="Back to Store">
                <LogOut size={18} />
              </Link>
            </div>
          </div>
          <div className="admin-sidebar-panel" aria-hidden={desktopPanelCollapsed}>
            <div className="sidebar-panel-header">
              <h2>{desktopCurrentSection.label}</h2>
            </div>
            <nav className="sidebar-panel-nav">
              {desktopCurrentSection.items.map((item) => {
                const ItemIcon = item.icon;
                const isActiveItem = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    className={`panel-item ${isActiveItem ? 'active' : ''} ${item.sub ? 'sub-item' : ''}`}
                    aria-current={isActiveItem ? 'page' : undefined}
                    onClick={() => handleTabChange(item.tab)}
                  >
                    <ItemIcon size={item.sub ? 16 : 18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {isMobileSidebarOpen && (
          <button
            type="button"
            className="admin-sidebar-overlay"
            aria-label="Close admin menu"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

      <div className={`admin-sidebar ${isMobileSidebarOpen ? 'open' : ''}`}>
        <h2>Admin Panel</h2>
        <nav>
          {mobileSidebarSections.map((section) => {
            const SectionIcon = section.icon;
            const isExpanded = Boolean(expandedGroups[section.key]);
            return (
              <div className="sidebar-group" key={section.key}>
                <button
                  type="button"
                  className={`sidebar-group-toggle ${isExpanded ? 'expanded' : ''}`}
                  data-label={section.label}
                  onClick={() => toggleSidebarGroup(section.key)}
                >
                  <SectionIcon size={20} />
                </button>
                {isExpanded && (
                  <div className="sidebar-group-items">
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      const isActiveItem = activeTab === item.tab;
                      return (
                        <button
                          key={item.tab}
                          className={`${isActiveItem ? 'active' : ''} ${item.sub ? 'sub-item' : ''}`}
                          onClick={() => handleTabChange(item.tab)}
                        >
                          <ItemIcon size={item.sub ? 18 : 20} /> {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <Link to="/" className="logout-link">
            <LogOut size={20} /> 
          </Link>
        </nav>
      </div>

      <div className="admin-shell-main">
        <div className="admin-content">
        {activeTab === 'dashboard' && (
          <DashboardSection
            dashboardDensity={dashboardDensity}
            setDashboardDensity={setDashboardDensity}
            isMobile={isMobile}
            stats={stats}
            pendingOrdersList={pendingOrdersList}
            activeProductsCount={activeProductsCount}
            inactiveProductsCount={inactiveProductsCount}
            lowStockProducts={lowStockProducts}
            products={products}
            customerUsers={customerUsers}
            visitorStats={visitorStats}
            recentOrders={recentOrders}
            recentCustomers={recentCustomers}
            onTabChange={handleTabChange}
          />
        )}

        {activeTab === 'daily-sales' && (
          <DailySalesSection
            selectedDateKey={selectedDateKey}
            onDateChange={setDailySalesDate}
            onRefresh={() => { void loadDailySalesBills({ silent: false }); }}
            dailySalesLoading={dailySalesLoading}
            dailySalesError={dailySalesError}
            dailySalesSummary={dailySalesSummary}
            selectedSalesBills={selectedSalesBills}
          />
        )}

        {activeTab === 'products' && (
          <ProductsSection
            isMobile={isMobile}
            handleAddProduct={handleAddProduct}
            setShowExportDialog={setShowExportDialog}
            importBusy={importBusy}
            handleStartImport={handleStartImport}
            handleConfirmImport={handleConfirmImport}
            showProductsImportCard={showProductsImportCard}
            importPreviewData={importPreviewData}
            importFile={importFile}
            importAllowIdenticalRows={importAllowIdenticalRows}
            setImportAllowIdenticalRows={setImportAllowIdenticalRows}
            effectiveProductViewMode={effectiveProductViewMode}
            setProductViewMode={setProductViewMode}
            importFileInputRef={importFileInputRef}
            handleFileSelected={handleFileSelected}
            productTableSearch={productTableSearch}
            setProductTableSearch={setProductTableSearch}
            visibleProducts={visibleProducts}
            productTableCategoryFilter={productTableCategoryFilter}
            setProductTableCategoryFilter={setProductTableCategoryFilter}
            productCategories={productCategories}
            productColumnPickerRef={productColumnPickerRef}
            productTableVisibleColumns={productTableVisibleColumns}
            productTableAllColumnsSelected={productTableAllColumnsSelected}
            toggleSelectAllProductTableColumns={toggleSelectAllProductTableColumns}
            isProductTableColumnVisible={isProductTableColumnVisible}
            toggleProductTableColumn={toggleProductTableColumn}
            productTableStatusFilter={productTableStatusFilter}
            setProductTableStatusFilter={setProductTableStatusFilter}
            productTableLowStockOnly={productTableLowStockOnly}
            setProductTableLowStockOnly={setProductTableLowStockOnly}
            selectedVisibleProduct={selectedVisibleProduct}
            tableEditId={tableEditId}
            handleTableEditSave={handleTableEditSave}
            tableEditSaving={tableEditSaving}
            cancelTableEdit={cancelTableEdit}
            openTableEdit={openTableEdit}
            handleEditProduct={handleEditProduct}
            productEditLoadingId={productEditLoadingId}
            handleDeleteProduct={handleDeleteProduct}
            handlePermanentDeleteProduct={handlePermanentDeleteProduct}
            productTableCalculatedMinWidth={productTableCalculatedMinWidth}
            toggleProductTableSort={toggleProductTableSort}
            getSortIndicator={getSortIndicator}
            tableEditForm={tableEditForm}
            handleTableCellClick={handleTableCellClick}
            setTableEditFieldRef={setTableEditFieldRef}
            handleTableEditChange={handleTableEditChange}
            setSelectedProductId={setSelectedProductId}
            selectedProductId={selectedProductId}
            showQuickAdd={showQuickAdd}
            setShowQuickAdd={setShowQuickAdd}
            quickAddForm={quickAddForm}
            setQuickAddForm={setQuickAddForm}
            resetQuickAdd={resetQuickAdd}
            quickSaving={quickSaving}
            handleQuickAddSave={handleQuickAddSave}
            quickEditId={quickEditId}
            quickEditForm={quickEditForm}
            setQuickEditForm={setQuickEditForm}
            cancelQuickEdit={cancelQuickEdit}
            handleQuickEditSave={handleQuickEditSave}
            startQuickEdit={startQuickEdit}
            getProductImageSrc={getProductImageSrc}
            getProductFallbackImage={getProductFallbackImage}
            getCategoryPath={getCategoryPath}
            getBrandPath={getBrandPath}
            formatCurrencyColored={formatCurrencyColored}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersSection
            ordersSearchQuery={ordersSearchQuery}
            setOrdersSearchQuery={setOrdersSearchQuery}
            visibleOrders={visibleOrders}
            orders={orders}
            openApproveModal={openApproveModal}
            handleProceedToBilling={handleProceedToBilling}
            proceedBillingOrderId={proceedBillingOrderId}
            handleApplyPendingFulfillment={handleApplyPendingFulfillment}
            formatCurrencyColored={formatCurrencyColored}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesSection
            setShowCategoryManagement={setShowCategoryManagement}
          />
        )}

        {activeTab === 'users' && (
          <UsersSection
            handleAddUser={handleAddUser}
            usersSearchQuery={usersSearchQuery}
            setUsersSearchQuery={setUsersSearchQuery}
            filteredUsersCount={filteredUsersCount}
            users={users}
            filteredUsers={filteredUsers}
            adminUsers={adminUsers}
            customerUsers={customerUsers}
            expandedUsersMap={expandedUsersMap}
            toggleUserCompactRow={toggleUserCompactRow}
            handleCompactRowKeyToggle={handleCompactRowKeyToggle}
            resolveMediaUrl={resolveMediaUrl}
            userAvatarErrors={userAvatarErrors}
            setUserAvatarErrors={setUserAvatarErrors}
            truncateUserName={truncateUserName}
            handleEditUser={handleEditUser}
            handleDeleteUser={handleDeleteUser}
          />
        )}

        {activeTab === 'billing' && (
          <BillingTab
            initialPrefill={billingPrefill}
            onPrefillApplied={() => setBillingPrefill(null)}
          />
        )}
        {activeTab === 'view-bills' && <BillsViewer />}

        {activeTab === 'distributors' && (
          <DistributorManagement user={user} />
        )}

        {activeTab === 'purchases' && (
          <PurchaseManagement user={user} />
        )}

        {activeTab === 'stock-ledger' && (
          <StockLedgerHistory user={user} />
        )}

        {activeTab === 'product-insights' && (
          <ProductInsights />
        )}

        {activeTab === 'distributor-insights' && (
          <DistributorInsights />
        )}

        {activeTab === 'credit-aging' && (
          <CreditAgingReport user={user} />
        )}
        {activeTab === 'credit-khata' && <CreditKhata user={user} />}
        {activeTab === 'customer-requests' && <CustomerRequestsAdmin />}
        {activeTab === 'offers' && <OfferManagement />}
        </div>
      </div>
    </div>

      {/* Product Form Modal */}
      {showProductForm && (
        <ProductForm
          product={editingProduct}
          onClose={() => {
            setShowProductForm(false);
            setEditingProduct(null);
          }}
          onSave={handleProductSave}
        />
      )}
      <AdminApproveModal
        showApproveModal={showApproveModal}
        modalOrder={modalOrder}
        modalItems={modalItems}
        modalLoading={modalLoading}
        onClose={() => setShowApproveModal(false)}
        confirmApprove={confirmApprove}
        proceedBillingOrderId={proceedBillingOrderId}
        handleProceedToBilling={handleProceedToBilling}
      />
      <AdminExportModal
        showExportDialog={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        importBusy={importBusy}
        handleExportProducts={handleExportProducts}
      />
      {/* Category Management Modal */}
      {showCategoryManagement && (
        <CategoryManagement
          onClose={() => setShowCategoryManagement(false)}
        />
      )}
      {/* User Edit Modal */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => {
            setEditingUser(null);
            setShowUserForm(false);
            setIsCreatingUser(false);
          }}
          onSave={handleUserSave}
        />
      )}
      {/* User Create Modal */}
      {showUserForm && isCreatingUser && (
        <UserEditModal
          isCreate={true}
          onClose={() => {
            setShowUserForm(false);
            setIsCreatingUser(false);
          }}
          onSave={handleCreateUser}
        />
      )}
    </div>
  );
}

export default Admin;




