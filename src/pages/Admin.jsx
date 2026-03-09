import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Package, ShoppingCart, Users, TrendingUp, LogOut, Plus, Edit, Trash2, X, FolderOpen, CreditCard, FileText, Truck, ShoppingBag, History, BarChart2, Gift, Eye, Menu, Upload, Download, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { statsApi, productsApi, ordersApi, usersApi, adminApi, billingApi, resolveMediaUrl } from '../services/api';
import { getProductImageSrc, getProductFallbackImage } from '../utils/productImage';
import { formatCurrency, getSignedCurrencyClassName, truncateUserName } from '../utils/formatters';
import ProductForm from './ProductForm';
import CategoryManagement from './CategoryManagement';
import DistributorManagement from './DistributorManagement';
import PurchaseManagement from './PurchaseManagement';
import StockLedgerHistory from './StockLedgerHistory';
import CreditAgingReport from './CreditAgingReport';
import UserEditModal from './UserEditModal';
import BillingTab from './BillingTab';
import BillsViewer from './BillsViewer';
import OfferManagement from './OfferManagement';
import CreditKhata from './CreditKhata';
import CustomerRequestsAdmin from './CustomerRequestsAdmin';
import AppModal from '../components/AppModal';
import useLockBodyScroll from '../hooks/useLockBodyScroll';
import './Admin.css';
import './AdminStandard.css';

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toLocalDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PRODUCT_TABLE_COLUMN_OPTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'category', label: 'Category' },
  { key: 'price', label: 'Price' },
  { key: 'mrp', label: 'MRP' },
  { key: 'stock', label: 'Stock' },
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'status', label: 'Status' },
  { key: 'description', label: 'Description' },
  { key: 'content', label: 'Content' },
  { key: 'color', label: 'Color' },
  { key: 'uom', label: 'UOM' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'discount', label: 'Discount' },
  { key: 'discountType', label: 'Disc Type' },
  { key: 'id', label: 'ID' },
  { key: 'created', label: 'Created' },
  { key: 'src', label: 'Src' },
];

const PRODUCT_TABLE_ALL_COLUMN_KEYS = PRODUCT_TABLE_COLUMN_OPTIONS.map((column) => column.key);
const PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS = ['name', 'brand', 'category', 'price', 'stock', 'status'];
const PRODUCT_TABLE_COLUMN_MIN_WIDTH = {
  name: 130,
  brand: 95,
  category: 95,
  price: 78,
  mrp: 78,
  stock: 60,
  sku: 90,
  barcode: 90,
  status: 70,
  description: 150,
  content: 80,
  color: 70,
  uom: 55,
  expiry: 90,
  discount: 60,
  discountType: 65,
  id: 50,
  created: 85,
  src: 120,
};

const formatHierarchyPath = (parent, child) => {
  const root = String(parent || '').trim();
  const leaf = String(child || '').trim();
  if (!root) return '';
  if (!leaf) return root;
  return `${root} -> ${leaf}`;
};

const getCategoryPath = (product) => (
  String(product?.category_path || '').trim()
  || formatHierarchyPath(product?.category, product?.subcategory)
  || String(product?.category || '').trim()
);

const getBrandPath = (product) => (
  String(product?.brand_path || '').trim()
  || formatHierarchyPath(product?.brand, product?.sub_brand)
  || String(product?.brand || '').trim()
);

const SIDEBAR_SECTIONS = [
  {
    key: 'general',
    label: 'General',
    icon: TrendingUp,
    items: [
      { tab: 'dashboard', label: 'Dashboard', icon: TrendingUp },
      { tab: 'orders', label: 'Orders', icon: ShoppingCart },
      { tab: 'offers', label: 'Offers', icon: Gift },
      { tab: 'credit-aging', label: 'Credit Aging', icon: BarChart2 },
    ],
  },
  {
    key: 'products',
    label: 'Products',
    icon: Package,
    items: [
      { tab: 'products', label: 'Products', icon: Package },
      { tab: 'categories', label: 'Categories', icon: FolderOpen, sub: true },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: FileText,
    items: [
      { tab: 'billing', label: 'Billing', icon: FileText },
      { tab: 'daily-sales', label: 'Daily Sales', icon: BarChart2, sub: true },
      { tab: 'view-bills', label: 'Bills History', icon: Eye, sub: true },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    icon: ShoppingBag,
    items: [
      { tab: 'purchases', label: 'Purchases', icon: ShoppingBag },
      { tab: 'distributors', label: 'Distributors', icon: Truck, sub: true },
      { tab: 'stock-ledger', label: 'Stock History', icon: History, sub: true },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    icon: Users,
    items: [
      { tab: 'users', label: 'Users', icon: Users },
      { tab: 'credit-khata', label: 'Credit Khata', icon: CreditCard, sub: true },
      { tab: 'customer-requests', label: 'Customer Requests', icon: FileText, sub: true },
    ],
  },
];

function Admin({ user }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const tab = new URLSearchParams(window.location.search).get('tab');
    const allowedTabs = new Set([
      'dashboard', 'orders', 'offers', 'credit-aging',
      'products', 'categories',
      'billing', 'daily-sales', 'view-bills',
      'purchases', 'distributors', 'stock-ledger',
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
    if (tabFromUrl && tabGroupMap[tabFromUrl] && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
    if (window.innerWidth <= 768) {
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

  const getInitials = (name) => {
    const value = String(name || '').trim();
    if (!value) return 'U';
    return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  };

  const formatJoinedDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
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

  const showProductsImportCard = Boolean(
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
    const payload = {
      name: String(tableEditForm.name || '').trim(),
      description: String(tableEditForm.description || '').trim(),
      brand: String(tableEditForm.brand || '').trim(),
      content: String(tableEditForm.content || '').trim(),
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
    <div className="admin-page">
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
          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.general ? 'expanded' : ''}`}
              data-label="General"
              onClick={() => toggleSidebarGroup('general')}
            >
              <TrendingUp size={20} />
            </button>
            {expandedGroups.general && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'dashboard' ? 'active' : ''}
                  onClick={() => handleTabChange('dashboard')}
                >
                  <TrendingUp size={20} /> Dashboard
                </button>
                <button 
                  className={activeTab === 'orders' ? 'active' : ''}
                  onClick={() => handleTabChange('orders')}
                >
                  <ShoppingCart size={20} /> Orders
                </button>
                <button
                  className={activeTab === 'offers' ? 'active' : ''}
                  onClick={() => handleTabChange('offers')}
                >
                  <Gift size={20} /> Offers
                </button>
                <button 
                  className={activeTab === 'credit-aging' ? 'active' : ''}
                  onClick={() => handleTabChange('credit-aging')}
                >
                  <BarChart2 size={20} /> Credit Aging
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.products ? 'expanded' : ''}`}
              data-label="Products"
              onClick={() => toggleSidebarGroup('products')}
            >
              <Package size={20} />
            </button>
            {expandedGroups.products && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'products' ? 'active' : ''}
                  onClick={() => handleTabChange('products')}
                >
                  <Package size={20} /> Products
                </button>
                <button 
                  className={`${activeTab === 'categories' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('categories')}
                >
                  <FolderOpen size={18} /> Categories
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.billing ? 'expanded' : ''}`}
              data-label="Billing"
              onClick={() => toggleSidebarGroup('billing')}
            >
              <FileText size={20} />
            </button>
            {expandedGroups.billing && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'billing' ? 'active' : ''}
                  onClick={() => handleTabChange('billing')}
                >
                  <FileText size={20} /> Billing
                </button>
                <button
                  className={`${activeTab === 'daily-sales' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('daily-sales')}
                >
                  <BarChart2 size={18} /> Daily Sales
                </button>
                <button 
                  className={`${activeTab === 'view-bills' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('view-bills')}
                >
                  <Eye size={18} /> Bills History
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.purchase ? 'expanded' : ''}`}
              data-label="Purchase"
              onClick={() => toggleSidebarGroup('purchase')}
            >
              <ShoppingBag size={20} />
            </button>
            {expandedGroups.purchase && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'purchases' ? 'active' : ''}
                  onClick={() => handleTabChange('purchases')}
                >
                  <ShoppingBag size={20} /> Purchases
                </button>
                <button 
                  className={`${activeTab === 'distributors' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('distributors')}
                >
                  <Truck size={18} /> Distributors
                </button>
                <button 
                  className={`${activeTab === 'stock-ledger' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('stock-ledger')}
                >
                  <History size={18} /> Stock History
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.users ? 'expanded' : ''}`}
              data-label="Users"
              onClick={() => toggleSidebarGroup('users')}
            >
              <Users size={20} />
            </button>
            {expandedGroups.users && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'users' ? 'active' : ''}
                  onClick={() => handleTabChange('users')}
                >
                  <Users size={20} /> Users
                </button>
                <button
                  className={`${activeTab === 'credit-khata' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('credit-khata')}
                >
                  <CreditCard size={18} /> Credit Khata
                </button>
                <button
                  className={`${activeTab === 'customer-requests' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('customer-requests')}
                >
                  <FileText size={18} /> Customer Requests
                </button>
              </div>
            )}
          </div>

          <Link to="/" className="logout-link">
            <LogOut size={20} /> 
          </Link>
        </nav>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <div className={`dashboard dashboard-${dashboardDensity}`}>
            <div className="dashboard-header">
              <h1>Dashboard</h1>
              <div className="dashboard-density-toggle" role="group" aria-label="Dashboard density">
                <button
                  type="button"
                  className={`dashboard-density-btn ${dashboardDensity === 'compact' ? 'active' : ''}`}
                  onClick={() => setDashboardDensity('compact')}
                >
                  Compact
                </button>
                <button
                  type="button"
                  className={`dashboard-density-btn ${dashboardDensity === 'standard' ? 'active' : ''}`}
                  onClick={() => setDashboardDensity('standard')}
                >
                  Standard
                </button>
              </div>
            </div>
            <div className="stats-grid grouped-stats-grid">
              <div className="stat-group-card">
                <div className="stat-group-head">
                  <ShoppingCart size={28} />
                  <div>
                    <p className="stat-group-kicker">Sales Snapshot</p>
                    <h3>{formatCurrencyColored(stats.totalRevenue)}</h3>
                    <p className="stat-group-main-label">Total Revenue</p>
                  </div>
                </div>
                <div className="stat-group-metrics">
                  <div className="stat-group-metric"><span>Total Orders</span><strong>{asNumber(stats.totalOrders, 0)}</strong></div>
                  <div className="stat-group-metric"><span>Ordered (Pending Receive)</span><strong>{pendingOrdersList.length}</strong></div>
                </div>
              </div>

              <div className="stat-group-card">
                <div className="stat-group-head">
                  <Package size={28} />
                  <div>
                    <p className="stat-group-kicker">Catalog Health</p>
                    <h3>{activeProductsCount}</h3>
                    <p className="stat-group-main-label">Active Products</p>
                  </div>
                </div>
                <div className="stat-group-metrics">
                  <div className="stat-group-metric"><span>Inactive Products</span><strong>{inactiveProductsCount}</strong></div>
                  <div className="stat-group-metric"><span>Low Stock (≤10)</span><strong>{lowStockProducts.length}</strong></div>
                  <div className="stat-group-metric"><span>Total Products</span><strong>{products.length}</strong></div>
                </div>
              </div>

              <div className="stat-group-card">
                <div className="stat-group-head">
                  <Users size={28} />
                  <div>
                    <p className="stat-group-kicker">Customer Status</p>
                    <h3>{customerUsers.length}</h3>
                    <p className="stat-group-main-label">Total Customers</p>
                  </div>
                </div>
                <div className="stat-group-metrics">
                  <div className="stat-group-metric"><span>Online Logged-In</span><strong>{visitorStats.onlineLoggedInUsers}</strong></div>
                </div>
              </div>

              <div className="stat-group-card">
                <div className="stat-group-head">
                  <TrendingUp size={28} />
                  <div>
                    <p className="stat-group-kicker">Visitor Traffic</p>
                    <h3>{visitorStats.onlineVisitors}</h3>
                    <p className="stat-group-main-label">Online Visitors</p>
                  </div>
                </div>
                <div className="stat-group-metrics">
                  <div className="stat-group-metric"><span>Unique Today</span><strong>{visitorStats.uniqueSessionsToday}</strong></div>
                </div>
              </div>
            </div>

            <div className="dashboard-panels">
              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Quick Actions</h3>
                </div>
                <div className="dashboard-actions">
                  <button className="admin-btn" onClick={() => handleTabChange('orders')}>Manage Orders</button>
                  <button className="admin-btn" onClick={() => handleTabChange('products')}>Manage Products</button>
                  <button className="admin-btn" onClick={() => handleTabChange('billing')}>Create Bill</button>
                </div>
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Low Stock (≤ 10)</h3>
                </div>
                {lowStockProducts.length === 0 ? (
                  <p className="dashboard-empty">No low stock products.</p>
                ) : (
                  <div className="dashboard-list">
                    {lowStockProducts.map((product) => (
                      <div className="dashboard-list-row" key={product.id}>
                        <span className="dashboard-row-primary">{product.name}</span>
                        <strong className="dashboard-row-value">Stock: {asNumber(product.stock, 0)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Recent Orders</h3>
                </div>
                {recentOrders.length === 0 ? (
                  <p className="dashboard-empty">No orders yet.</p>
                ) : (
                  <div className="dashboard-list">
                    {recentOrders.map((order) => (
                      <div className="dashboard-list-row" key={order.id}>
                        <span className="dashboard-row-primary">{order.order_number || `#${order.id}`}</span>
                        <span className="dashboard-row-secondary">Date: {new Date(order.created_at || Date.now()).toLocaleDateString()}</span>
                        <span className="dashboard-row-value">{formatCurrency(order.total_amount || 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Recent Customers</h3>
                </div>
                {recentCustomers.length === 0 ? (
                  <p className="dashboard-empty">No customers found.</p>
                ) : (
                  <div className="dashboard-list">
                    {recentCustomers.map((customer) => (
                      <div className="dashboard-list-row" key={customer.id}>
                        <span className="dashboard-row-primary">{truncateUserName(customer.name || '-', 15)}</span>
                        <span className="dashboard-row-secondary">{customer.phone || customer.email || '-'}</span>
                        <Link
                          className="action-btn credit"
                          to={`/admin/users/${customer.id}/credit?returnTab=dashboard`}
                          title="Open credit history"
                        >
                          <CreditCard size={14} />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'daily-sales' && (
          <div className="daily-sales-summary">
            <div className="section-header">
              <h1>Daily Sales Summary</h1>
              <div className="daily-sales-controls">
                <input
                  type="date"
                  className="daily-sales-date-input"
                  value={selectedDateKey}
                  onChange={(event) => setDailySalesDate(String(event.target.value || '').trim())}
                />
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => { void loadDailySalesBills({ silent: false }); }}
                  disabled={dailySalesLoading}
                >
                  {dailySalesLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {dailySalesError ? <p className="daily-sales-error">{dailySalesError}</p> : null}

            <div className="stats-grid daily-sales-cards">
              <div className="stat-card">
                <BarChart2 size={22} />
                <div>
                  <h3>{formatCurrency(dailySalesSummary.totalBilled)}</h3>
                  <p>Total Billed</p>
                </div>
              </div>
              <div className="stat-card">
                <ShoppingCart size={22} />
                <div>
                  <h3>{formatCurrency(dailySalesSummary.cashCollected)}</h3>
                  <p>Cash Collected</p>
                </div>
              </div>
              <div className="stat-card">
                <CreditCard size={22} />
                <div>
                  <h3>{formatCurrency(dailySalesSummary.creditIssued)}</h3>
                  <p>Credit Issued</p>
                </div>
              </div>
              <div className="stat-card">
                <TrendingUp size={22} />
                <div>
                  <h3>{formatCurrency(dailySalesSummary.expectedDrawerCash)}</h3>
                  <p>Expected Cash In Drawer</p>
                </div>
              </div>
            </div>

            <div className="daily-sales-meta-row">
              <span>Transactions: <strong>{dailySalesSummary.txCount}</strong></span>
              <span>Paid Bills: <strong>{dailySalesSummary.paidBills}</strong></span>
              <span>Pending Bills: <strong>{dailySalesSummary.pendingBills}</strong></span>
              <span>Avg Ticket: <strong>{formatCurrency(dailySalesSummary.avgTicket)}</strong></span>
            </div>

            <div className="orders-table daily-sales-table">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Bill</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Credit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSalesBills.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="orders-empty-row">No sales bills found for selected date.</td>
                    </tr>
                  ) : selectedSalesBills.map((bill) => (
                    <tr key={bill.id}>
                      <td>{new Date(bill.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{bill.bill_number || `#${bill.id}`}</td>
                      <td>{truncateUserName(bill.customer_name || '-', 15)}</td>
                      <td>{formatCurrency(asNumber(bill.total_amount, 0))}</td>
                      <td>{formatCurrency(asNumber(bill.paid_amount, 0))}</td>
                      <td>{formatCurrency(asNumber(bill.credit_amount, 0))}</td>
                      <td>{String(bill.payment_status || '-').toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="products-management">
            <div className="section-header">
              <h1>Products Management</h1>
              <div className="products-actions">
                <div className="products-actions-right">
                  <div className="products-io-icons">
                    <button
                      type="button"
                      className="products-icon-btn products-icon-btn-add"
                      onClick={handleAddProduct}
                      title="Add product"
                      aria-label="Add product"
                    >
                      <span className="products-icon-plus" aria-hidden="true">+</span>
                    </button>
                    <button
                      type="button"
                      className="products-icon-btn"
                      onClick={() => setShowExportDialog(true)}
                      disabled={importBusy}
                      title="Export products"
                      aria-label="Export products"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      type="button"
                      className="products-icon-btn"
                      onClick={handleStartImport}
                      disabled={importBusy}
                      title="Import products"
                      aria-label="Import products"
                    >
                      <Upload size={16} />
                    </button>
                    <button
                      type="button"
                      className="products-icon-btn"
                      onClick={handleConfirmImport}
                      disabled={importBusy || !importPreviewData?.batch_id}
                      title="Confirm import"
                      aria-label="Confirm import"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </div>
                  <div
                    className={`products-view-switch ${productViewMode === 'grid' ? 'is-grid' : 'is-table'}`}
                    role="group"
                    aria-label="Product view mode"
                  >
                    <button
                      type="button"
                      className={`products-view-switch-option table ${productViewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setProductViewMode('table')}
                      aria-pressed={productViewMode === 'table'}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      className={`products-view-switch-option grid ${productViewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setProductViewMode('grid')}
                      aria-pressed={productViewMode === 'grid'}
                    >
                      Grid
                    </button>
                    <span className="products-view-switch-knob" aria-hidden="true">
                      {productViewMode === 'grid' ? <CheckCircle2 size={14} /> : <X size={14} />}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelected}
              disabled={importBusy}
              style={{ display: 'none' }}
            />
            {showProductsImportCard ? (
              <div className="products-import-export-card">
                {importPreviewData?.batch_id ? (
                  <div className="products-import-controls">
                    <span>{importFile ? `Selected: ${importFile.name}` : 'No file selected'}</span>
                  </div>
                ) : null}
                {importPreviewData?.summary && (
                  <div className="products-import-preview-summary">
                    <span>Creates: {importPreviewData.summary.creates}</span>
                    <span>Updates: {importPreviewData.summary.updates}</span>
                    <span>Errors: {importPreviewData.summary.errors}</span>
                    <span>Needs Choice: {importPreviewData.summary.needs_confirmation || 0}</span>
                    <span>Expires: {new Date(importPreviewData.expires_at).toLocaleString()}</span>
                  </div>
                )}
                {Array.isArray(importPreviewData?.preview) && importPreviewData.preview.length > 0 && (
                  <div className="products-import-preview-table-wrap">
                    <table className="products-import-preview-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Action</th>
                          <th>Status</th>
                          <th>Allow</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewData.preview.slice(0, 25).map((row) => (
                          <tr key={`preview-${row.row}`}>
                            <td>{row.row}</td>
                            <td>{row.action}</td>
                            <td>{row.status}</td>
                            <td>
                              {row.status === 'needs_confirmation' ? (
                                <input
                                  type="checkbox"
                                  checked={importAllowIdenticalRows.includes(Number(row.row))}
                                  onChange={(e) => {
                                    const rowNo = Number(row.row);
                                    setImportAllowIdenticalRows((prev) => {
                                      if (e.target.checked) return Array.from(new Set([...prev, rowNo]));
                                      return prev.filter((v) => v !== rowNo);
                                    });
                                  }}
                                />
                              ) : '-'}
                            </td>
                            <td>
                              {row.errors?.length
                                ? row.errors.join('; ')
                                : row.warnings?.length
                                  ? row.warnings.join('; ')
                                  : 'Ready'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreviewData.preview.length > 25 && (
                      <p className="products-import-preview-note">
                        Showing first 25 rows of {importPreviewData.preview.length}. Confirm applies full validated batch.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            <div className="products-common-toolbar">
              <input
                type="text"
                className="products-table-search products-common-search"
                placeholder="Search by name, SKU, barcode, category, brand..."
                value={productTableSearch}
                onChange={(e) => setProductTableSearch(e.target.value)}
              />
              <span className="products-table-count">Rows: {visibleProducts.length}</span>
            </div>
            {productViewMode === 'table' ? (
              <>
                <div className="products-table-toolbar">
                  <select
                    className="products-table-filter products-table-filter-category"
                    value={productTableCategoryFilter}
                    onChange={(e) => setProductTableCategoryFilter(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {productCategories.map((category) => (
                      <option key={`filter-${category}`} value={category}>{category}</option>
                    ))}
                  </select>
                  <details className="products-column-picker">
                    <summary>Columns ({productTableVisibleColumns.length}/{PRODUCT_TABLE_ALL_COLUMN_KEYS.length})</summary>
                    <div className="products-column-picker-panel">
                      <label className="products-column-option products-column-option-all">
                        <input
                          type="checkbox"
                          checked={productTableAllColumnsSelected}
                          onChange={(e) => toggleSelectAllProductTableColumns(e.target.checked)}
                        />
                        Select All
                      </label>
                      <div className="products-column-list">
                        {PRODUCT_TABLE_COLUMN_OPTIONS.map((column) => (
                          <label key={`column-toggle-${column.key}`} className="products-column-option">
                            <input
                              type="checkbox"
                              checked={isProductTableColumnVisible(column.key)}
                              onChange={() => toggleProductTableColumn(column.key)}
                            />
                            {column.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>
                  <select
                    className="products-table-filter products-table-filter-status"
                    value={productTableStatusFilter}
                    onChange={(e) => setProductTableStatusFilter(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="available">Available (In Stock)</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <label className="products-table-filter products-table-checkbox">
                    <input
                      type="checkbox"
                      checked={productTableLowStockOnly}
                      onChange={(e) => setProductTableLowStockOnly(e.target.checked)}
                    />
                    Low Stock
                  </label>
                </div>
                {selectedVisibleProduct ? (
                  <div className="products-selected-actions">
                    <div className="products-selected-meta">
                      Selected: <strong title={selectedVisibleProduct.name || '-'}>
                        {selectedVisibleProduct.name || '-'}
                      </strong>
                    </div>
                    <div className="products-selected-buttons">
                      {tableEditId === selectedVisibleProduct.id ? (
                        <>
                          <button className="action-btn edit" onClick={() => handleTableEditSave(selectedVisibleProduct)} disabled={tableEditSaving}>
                            {tableEditSaving ? '...' : 'Save'}
                          </button>
                          <button className="action-btn delete" onClick={cancelTableEdit} disabled={tableEditSaving}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="action-btn edit" onClick={() => openTableEdit(selectedVisibleProduct)} title="Inline edit">
                            <Edit size={16} />
                          </button>
                          <button
                            className="action-btn edit"
                            onClick={() => handleEditProduct(selectedVisibleProduct)}
                            title={Number(productEditLoadingId || 0) === Number(selectedVisibleProduct.id || 0) ? 'Loading full product details...' : 'Advanced edit'}
                            disabled={Number(productEditLoadingId || 0) === Number(selectedVisibleProduct.id || 0)}
                          >
                            <FolderOpen size={16} />
                          </button>
                          <button className="action-btn delete" onClick={() => handleDeleteProduct(selectedVisibleProduct.id)}>
                            <Trash2 size={16} />
                          </button>
                          {Number(selectedVisibleProduct.is_active ?? 1) === 0 ? (
                            <button
                              className="action-btn delete"
                              title="Permanent delete"
                              onClick={() => handlePermanentDeleteProduct(selectedVisibleProduct)}
                            >
                              <X size={16} />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="products-table">
                  <table style={{ minWidth: `${productTableCalculatedMinWidth}px` }}>
                    <thead>
                      <tr>
                        <th className="col-pick">Pick</th>
                        {isProductTableColumnVisible('name') ? <th className="sortable col-name" onClick={() => toggleProductTableSort('name')}>Name{getSortIndicator('name')}</th> : null}
                        {isProductTableColumnVisible('brand') ? <th className="sortable col-brand" onClick={() => toggleProductTableSort('brand')}>Brand{getSortIndicator('brand')}</th> : null}
                        {isProductTableColumnVisible('category') ? <th className="sortable col-category" onClick={() => toggleProductTableSort('category')}>Category{getSortIndicator('category')}</th> : null}
                        {isProductTableColumnVisible('price') ? <th className="sortable col-price" onClick={() => toggleProductTableSort('price')}>Price{getSortIndicator('price')}</th> : null}
                        {isProductTableColumnVisible('mrp') ? <th className="sortable col-mrp" onClick={() => toggleProductTableSort('mrp')}>MRP{getSortIndicator('mrp')}</th> : null}
                        {isProductTableColumnVisible('stock') ? <th className="sortable col-stock" onClick={() => toggleProductTableSort('stock')}>Stock{getSortIndicator('stock')}</th> : null}
                        {isProductTableColumnVisible('sku') ? <th className="sortable col-sku" onClick={() => toggleProductTableSort('sku')}>SKU{getSortIndicator('sku')}</th> : null}
                        {isProductTableColumnVisible('barcode') ? <th className="sortable col-barcode" onClick={() => toggleProductTableSort('barcode')}>Barcode{getSortIndicator('barcode')}</th> : null}
                        {isProductTableColumnVisible('status') ? <th className="sortable col-status" onClick={() => toggleProductTableSort('is_active')}>Status{getSortIndicator('is_active')}</th> : null}
                        {isProductTableColumnVisible('description') ? <th className="col-description">Description</th> : null}
                        {isProductTableColumnVisible('content') ? <th className="col-content">Content</th> : null}
                        {isProductTableColumnVisible('color') ? <th className="col-color">Color</th> : null}
                        {isProductTableColumnVisible('uom') ? <th className="col-uom">UOM</th> : null}
                        {isProductTableColumnVisible('expiry') ? <th className="col-expiry">Expiry</th> : null}
                        {isProductTableColumnVisible('discount') ? <th className="sortable col-discount" onClick={() => toggleProductTableSort('defaultDiscount')}>Discount{getSortIndicator('defaultDiscount')}</th> : null}
                        {isProductTableColumnVisible('discountType') ? <th className="col-discountType">Disc Type</th> : null}
                        {isProductTableColumnVisible('id') ? <th className="sortable col-id" onClick={() => toggleProductTableSort('id')}>ID{getSortIndicator('id')}</th> : null}
                        {isProductTableColumnVisible('created') ? <th className="sortable col-created" onClick={() => toggleProductTableSort('created_at')}>Created{getSortIndicator('created_at')}</th> : null}
                        {isProductTableColumnVisible('src') ? <th className="sortable col-src" onClick={() => toggleProductTableSort('src')}>Src{getSortIndicator('src')}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map(product => {
                        const isEditingRow = tableEditId === product.id;
                        const cellClassName = (base = '') => [base, !isEditingRow ? 'cell-editable' : ''].filter(Boolean).join(' ');
                        return (
                          <tr key={product.id} className={Number(selectedProductId) === Number(product.id) ? 'product-row-selected' : ''}>
                            <td className="col-pick">
                              <button
                                type="button"
                                className={`row-pick-btn ${Number(selectedProductId) === Number(product.id) ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductId(Number(product.id) || 0);
                                }}
                                title="Select product"
                                aria-label={`Select ${product.name || 'product'}`}
                              />
                            </td>
                            {isProductTableColumnVisible('name') ? (
                              <td className={cellClassName('col-name')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'name') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('name')} className="table-edit-input" value={tableEditForm.name} onChange={(e) => handleTableEditChange('name', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-name" title={product.name || '-'}>{product.name || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('brand') ? (
                              <td className={cellClassName('col-brand')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'brand') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('brand')} className="table-edit-input" value={tableEditForm.brand} onChange={(e) => handleTableEditChange('brand', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-brand" title={getBrandPath(product) || '-'}>{getBrandPath(product) || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('category') ? (
                              <td className={cellClassName('col-category')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'category') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('category')} className="table-edit-input" list="admin-product-category-list" value={tableEditForm.category} onChange={(e) => handleTableEditChange('category', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-category" title={getCategoryPath(product) || '-'}>{getCategoryPath(product) || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('price') ? (
                              <td className={cellClassName('col-price')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'price') : undefined}>
                                {isEditingRow ? <input ref={setTableEditFieldRef('price')} className="table-edit-input" type="number" min="0" step="0.01" value={tableEditForm.price} onChange={(e) => handleTableEditChange('price', e.target.value)} /> : formatCurrencyColored(product.price)}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('mrp') ? (
                              <td className={cellClassName('col-mrp')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'mrp') : undefined}>
                                {isEditingRow ? <input ref={setTableEditFieldRef('mrp')} className="table-edit-input" type="number" min="0" step="0.01" value={tableEditForm.mrp} onChange={(e) => handleTableEditChange('mrp', e.target.value)} /> : formatCurrencyColored(product.mrp)}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('stock') ? (
                              <td className={cellClassName('col-stock')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'stock') : undefined}>
                                {isEditingRow ? <input ref={setTableEditFieldRef('stock')} className="table-edit-input" type="number" min="0" step="1" value={tableEditForm.stock} onChange={(e) => handleTableEditChange('stock', e.target.value)} /> : <span className={product.stock < 10 ? 'low-stock' : ''}>{product.stock}</span>}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('sku') ? (
                              <td className={cellClassName('col-sku')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'sku') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('sku')} className="table-edit-input" value={tableEditForm.sku} onChange={(e) => handleTableEditChange('sku', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-code" title={product.sku || '-'}>{product.sku || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('barcode') ? (
                              <td className={cellClassName('col-barcode')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'barcode') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('barcode')} className="table-edit-input" value={tableEditForm.barcode} onChange={(e) => handleTableEditChange('barcode', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-code" title={product.barcode || '-'}>{product.barcode || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('status') ? (
                              <td className={cellClassName('col-status')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'is_active') : undefined}>
                                {isEditingRow ? (
                                  <select ref={setTableEditFieldRef('is_active')} className="table-edit-input" value={tableEditForm.is_active ? '1' : '0'} onChange={(e) => handleTableEditChange('is_active', e.target.value === '1')}>
                                    <option value="1">Active</option>
                                    <option value="0">Inactive</option>
                                  </select>
                                ) : (Number(product.is_active ?? 1) === 1 ? 'Active' : 'Inactive')}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('description') ? (
                              <td className={cellClassName('col-description')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'description') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('description')} className="table-edit-input" value={tableEditForm.description} onChange={(e) => handleTableEditChange('description', e.target.value)} />
                                ) : (
                                  <span className="description-snippet" title={product.description || '-'}>{product.description || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('content') ? (
                              <td className={cellClassName('col-content')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'content') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('content')} className="table-edit-input" value={tableEditForm.content} onChange={(e) => handleTableEditChange('content', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate" title={product.content || '-'}>{product.content || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('color') ? (
                              <td className={cellClassName('col-color')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'color') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('color')} className="table-edit-input" value={tableEditForm.color} onChange={(e) => handleTableEditChange('color', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate" title={product.color || '-'}>{product.color || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('uom') ? (
                              <td className={cellClassName('col-uom')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'uom') : undefined}>
                                {isEditingRow ? (
                                  <input ref={setTableEditFieldRef('uom')} className="table-edit-input" value={tableEditForm.uom} onChange={(e) => handleTableEditChange('uom', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate" title={product.uom || '-'}>{product.uom || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('expiry') ? (
                              <td className={cellClassName('col-expiry')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'expiry_date') : undefined}>
                                {isEditingRow ? <input ref={setTableEditFieldRef('expiry_date')} className="table-edit-input" type="date" value={tableEditForm.expiry_date} onChange={(e) => handleTableEditChange('expiry_date', e.target.value)} /> : (product.expiry_date ? new Date(product.expiry_date).toLocaleDateString() : '-')}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('discount') ? (
                              <td className={cellClassName('col-discount')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'defaultDiscount') : undefined}>
                                {isEditingRow ? <input ref={setTableEditFieldRef('defaultDiscount')} className="table-edit-input" type="number" min="0" step="0.01" value={tableEditForm.defaultDiscount} onChange={(e) => handleTableEditChange('defaultDiscount', e.target.value)} /> : asNumber(product.defaultDiscount, 0)}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('discountType') ? (
                              <td className={cellClassName('col-discountType')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'discountType') : undefined}>
                                {isEditingRow ? (
                                  <select ref={setTableEditFieldRef('discountType')} className="table-edit-input" value={tableEditForm.discountType} onChange={(e) => handleTableEditChange('discountType', e.target.value)}>
                                    <option value="fixed">fixed</option>
                                    <option value="percentage">percentage</option>
                                  </select>
                                ) : (
                                  <span className="cell-truncate" title={product.discountType || 'fixed'}>{product.discountType || 'fixed'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('id') ? (
                              <td className={cellClassName('col-id')} onClick={() => handleTableCellClick(product, 'name')}>{product.id}</td>
                            ) : null}
                            {isProductTableColumnVisible('created') ? (
                              <td className={cellClassName('col-created')} onClick={() => handleTableCellClick(product, 'name')}>{product.created_at ? new Date(product.created_at).toLocaleDateString() : '-'}</td>
                            ) : null}
                            {isProductTableColumnVisible('src') ? (
                              <td className={cellClassName('col-src')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'image') : undefined}>
                                {isEditingRow ? <input ref={setTableEditFieldRef('image')} className="table-edit-input" value={tableEditForm.image} onChange={(e) => handleTableEditChange('image', e.target.value)} /> : <span className="src-cell" title={product.image || '-'}>{product.image || '-'}</span>}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="products-grid-admin">
                <div className="product-admin-card add-product-card">
                  {!showQuickAdd ? (
                    <button className="quick-add-trigger" onClick={() => setShowQuickAdd(true)}>
                      <Plus size={18} /> Quick Add Product
                    </button>
                  ) : (
                    <div className="quick-form">
                      <h3>Quick Add</h3>
                      <input
                        type="text"
                        placeholder="Product name"
                        value={quickAddForm.name}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <input
                        type="text"
                        list="admin-product-category-list"
                        placeholder="Category"
                        value={quickAddForm.category}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        min="0"
                        step="0.01"
                        value={quickAddForm.price}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, price: e.target.value }))}
                      />
                      <input
                        type="number"
                        placeholder="Stock"
                        min="0"
                        step="1"
                        value={quickAddForm.stock}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, stock: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Image URL (optional)"
                        value={quickAddForm.image}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, image: e.target.value }))}
                      />
                      <div className="quick-form-actions">
                        <button className="admin-btn" onClick={() => { setShowQuickAdd(false); resetQuickAdd(); }} disabled={quickSaving}>
                          Cancel
                        </button>
                        <button className="admin-btn primary" onClick={handleQuickAddSave} disabled={quickSaving}>
                          {quickSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {visibleProducts.map(product => {
                  const isEditingQuick = quickEditId === product.id;
                  const imageSourceProduct = isEditingQuick
                    ? {
                        image: quickEditForm.image,
                        name: quickEditForm.name || product.name,
                        category: quickEditForm.category || getCategoryPath(product),
                        brand: getBrandPath(product)
                      }
                    : product;
                  return (
                    <div key={product.id} className="product-admin-card">
                      <img
                        src={getProductImageSrc(imageSourceProduct)}
                        alt={product.name}
                        className="product-thumbnail-large"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = getProductFallbackImage(imageSourceProduct);
                        }}
                      />
                      {isEditingQuick ? (
                        <div className="quick-form">
                          <input
                            type="text"
                            placeholder="Product name"
                            value={quickEditForm.name}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, name: e.target.value }))}
                          />
                          <input
                            type="text"
                            list="admin-product-category-list"
                            placeholder="Category"
                            value={quickEditForm.category}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, category: e.target.value }))}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            min="0"
                            step="0.01"
                            value={quickEditForm.price}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, price: e.target.value }))}
                          />
                          <input
                            type="number"
                            placeholder="Stock"
                            min="0"
                            step="1"
                            value={quickEditForm.stock}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, stock: e.target.value }))}
                          />
                          <input
                            type="text"
                            placeholder="Image URL (optional)"
                            value={quickEditForm.image}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, image: e.target.value }))}
                          />
                          <div className="quick-form-actions">
                            <button className="admin-btn" onClick={cancelQuickEdit} disabled={quickSaving}>
                              Cancel
                            </button>
                            <button className="admin-btn primary" onClick={() => handleQuickEditSave(product)} disabled={quickSaving}>
                              {quickSaving ? 'Saving...' : 'Update'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="product-card-title-row">
                            <h3>{product.name}</h3>
                            {Number(product.is_active ?? 1) === 0 ? (
                              <span className="product-status-badge inactive">Inactive</span>
                            ) : null}
                          </div>
                          <p className="product-meta">{getBrandPath(product) || 'Unbranded'}</p>
                          <p className="product-meta">{getCategoryPath(product)}</p>
                          <p className="product-meta">{formatCurrencyColored(product.price)}</p>
                          <p className={product.stock < 10 ? 'product-stock-label low-stock' : 'product-stock-label'}>
                            Stock: {product.stock}
                          </p>
                          <div className="product-card-actions">
                            <button className="action-btn edit" onClick={() => startQuickEdit(product)} title="Quick edit">
                              <Edit size={16} />
                            </button>
                            <button
                              className="action-btn edit"
                              onClick={() => handleEditProduct(product)}
                              title={Number(productEditLoadingId || 0) === Number(product.id || 0) ? 'Loading full product details...' : 'Advanced edit'}
                              disabled={Number(productEditLoadingId || 0) === Number(product.id || 0)}
                            >
                              <FolderOpen size={16} />
                            </button>
                            <button className="action-btn delete" onClick={() => handleDeleteProduct(product.id)} title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <datalist id="admin-product-category-list">
                  {productCategories.map(category => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="orders-management">
            <h1>Orders Management</h1>
            <div className="orders-toolbar">
              <input
                type="text"
                className="orders-search-input"
                aria-label="Search orders"
                placeholder="Search order #, customer, email, status..."
                value={ordersSearchQuery}
                onChange={(e) => setOrdersSearchQuery(e.target.value)}
              />
              <span className="orders-search-count">
                Showing {visibleOrders.length} of {orders.length} orders
              </span>
            </div>
            <div className="orders-mobile-list">
              {visibleOrders.length === 0 ? (
                <p className="orders-empty-text">No orders match your search.</p>
              ) : visibleOrders.map((order) => {
                const isOrdered = String(order.status || '').toLowerCase() === 'ordered';
                const isReceived = String(order.status || '').toLowerCase() === 'received';
                const isBilled = Boolean(Number(order.bill_id || 0) || String(order.linked_bill_number || '').trim());
                const pendingQty = Math.max(0, Number(order?.pending_qty || 0));
                const canProceedBilling = !isBilled && (isOrdered || isReceived);
                return (
                  <article key={`mobile-${order.id}`} className="order-mobile-card">
                    <div className="order-mobile-head">
                      <div className="order-mobile-title">
                        <strong>#{order.order_number || order.id}</strong>
                        <span className="order-mobile-date">{new Date(order.created_at).toLocaleDateString()}</span>
                      </div>
                      <span className={`status ${order.status}`}>{order.status}</span>
                    </div>
                    <div className="order-mobile-meta">
                      <p><strong>{truncateUserName(order.customer_name || '-', 15)}</strong></p>
                      <p>{formatCurrency(order.total_amount || 0)}</p>
                    </div>
                    {pendingQty > 0 ? (
                      <p className="order-mobile-subtle">Partial stock: Pending {pendingQty}</p>
                    ) : null}
                    {isBilled ? (
                      <p className="order-mobile-subtle">Bill: {order.linked_bill_number || `#${order.bill_id}`}</p>
                    ) : null}
                    {(isOrdered || isReceived) ? (
                      <div className="order-mobile-actions">
                        {isOrdered ? (
                          <button className="admin-btn primary order-action-btn" onClick={() => openApproveModal(order.id)}>Mark Received</button>
                        ) : null}
                        {canProceedBilling ? (
                          <button
                            className="admin-btn order-action-btn"
                            onClick={() => handleProceedToBilling(order)}
                            disabled={proceedBillingOrderId === Number(order.id)}
                          >
                            {proceedBillingOrderId === Number(order.id)
                              ? 'Opening...'
                              : isOrdered
                                ? 'Confirm + Billing'
                                : 'Proceed Billing'}
                          </button>
                        ) : (
                          <span className="order-mobile-muted">Already billed</span>
                        )}
                        {isReceived && pendingQty > 0 ? (
                          <button
                            className="admin-btn order-action-btn"
                            onClick={() => handleApplyPendingFulfillment(order.id)}
                          >
                            Apply Pending
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="order-mobile-muted">No pending action</span>
                    )}
                  </article>
                );
              })}
            </div>
            <div className="orders-table">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="orders-empty-row">No orders match your search.</td>
                    </tr>
                  ) : visibleOrders.map((order) => {
                    const isOrdered = String(order.status || '').toLowerCase() === 'ordered';
                    const isReceived = String(order.status || '').toLowerCase() === 'received';
                    const isBilled = Boolean(Number(order.bill_id || 0) || String(order.linked_bill_number || '').trim());
                    const pendingQty = Math.max(0, Number(order?.pending_qty || 0));
                    const canProceedBilling = !isBilled && (isOrdered || isReceived);
                    return (
                      <tr key={order.id}>
                        <td>#{order.order_number || order.id}</td>
                        <td>
                          <div className="order-customer-cell">
                            <strong>{truncateUserName(order.customer_name || '-', 15)}</strong>
                            <span>{order.customer_email || '-'}</span>
                          </div>
                        </td>
                        <td>{formatCurrencyColored(order.total_amount)}</td>
                        <td>
                          <span className={`status ${order.status}`}>{order.status}</span>
                          {pendingQty > 0 ? (
                            <div className="order-status-detail pending">
                              Partial stock: Pending {pendingQty}
                            </div>
                          ) : null}
                          {isBilled ? (
                            <div className="order-status-detail billed">
                              Bill: {order.linked_bill_number || `#${order.bill_id}`}
                            </div>
                          ) : null}
                        </td>
                        <td>{new Date(order.created_at).toLocaleDateString()}</td>
                        <td>
                          {(isOrdered || isReceived) ? (
                            <div className="order-actions">
                              {isOrdered ? (
                                <button className="admin-btn primary order-action-btn" onClick={() => openApproveModal(order.id)}>Mark Received</button>
                              ) : null}
                              {canProceedBilling ? (
                                <button
                                  className="admin-btn order-action-btn"
                                  onClick={() => handleProceedToBilling(order)}
                                  disabled={proceedBillingOrderId === Number(order.id)}
                                >
                                  {proceedBillingOrderId === Number(order.id)
                                    ? 'Opening...'
                                    : isOrdered
                                      ? 'Confirm + Billing'
                                      : 'Proceed Billing'}
                                </button>
                              ) : (
                                <span className="order-mobile-muted">Already billed</span>
                              )}
                              {isReceived && pendingQty > 0 ? (
                                <button
                                  className="admin-btn order-action-btn"
                                  onClick={() => handleApplyPendingFulfillment(order.id)}
                                >
                                  Apply Pending
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="order-mobile-muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="categories-management">
            <div className="section-header">
              <h1>Categories Management</h1>
              <button className="admin-btn primary" onClick={() => setShowCategoryManagement(true)}>
                <Plus size={20} /> Manage Categories
              </button>
            </div>
            <div className="categories-info">
              <p>Click "Manage Categories" to create, edit, or delete product categories.</p>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-management">
            <div className="section-header">
              <h1>Users Management</h1>
              <button className="admin-btn primary" onClick={handleAddUser}>
                <Plus size={20} /> Add Customer
              </button>
            </div>
            <div className="users-toolbar">
              <input
                type="text"
                className="users-search-input"
                placeholder="Search users by name, email, phone, id..."
                value={usersSearchQuery}
                onChange={(e) => setUsersSearchQuery(e.target.value)}
              />
              <span className="users-search-count">
                Showing {filteredUsersCount} of {users.length} users
              </span>
            </div>
            <div className="users-group">
              <h2>Admins ({filteredUsers.admins.length}/{adminUsers.length})</h2>
              <div className="users-compact-list">
                {filteredUsers.admins.length === 0 ? (
                  <p className="users-empty">No admins found.</p>
                ) : filteredUsers.admins.map((u) => {
                  const isExpanded = Boolean(expandedUsersMap[u.id]);
                  return (
                    <article className={`user-compact-card${isExpanded ? ' expanded' : ''}`} key={u.id}>
                      <div
                        className="user-compact-summary"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleUserCompactRow(u.id)}
                        onKeyDown={(event) => handleCompactRowKeyToggle(event, u.id)}
                      >
                        <div className="user-compact-name-wrap">
                          {u.profile_image && !userAvatarErrors[u.id] ? (
                            <img
                              src={resolveMediaUrl(u.profile_image)}
                              alt={u.name || 'User'}
                              className="admin-user-avatar"
                              onError={() => setUserAvatarErrors((prev) => ({ ...prev, [u.id]: true }))}
                            />
                          ) : (
                            <span className="admin-user-avatar-fallback">{getInitials(u.name)}</span>
                          )}
                          <span className="user-compact-name">{truncateUserName(u.name || '-', 15)}</span>
                        </div>
                        <span className="admin-badge">Admin</span>
                      </div>
                      {isExpanded && (
                        <div className="user-compact-details">
                          <p><strong>Email:</strong> {u.email || '-'}</p>
                          <p><strong>Phone:</strong> {u.phone || '-'}</p>
                          <p><strong>Joined:</strong> {formatJoinedDate(u.created_at)}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="users-group">
              <h2>Customers ({filteredUsers.customers.length}/{customerUsers.length})</h2>
              <div className="users-compact-list">
                {filteredUsers.customers.length === 0 ? (
                  <p className="users-empty">No customers found.</p>
                ) : filteredUsers.customers.map((u) => {
                  const isExpanded = Boolean(expandedUsersMap[u.id]);
                  return (
                    <article className={`user-compact-card${isExpanded ? ' expanded' : ''}`} key={u.id}>
                      <div
                        className="user-compact-summary"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleUserCompactRow(u.id)}
                        onKeyDown={(event) => handleCompactRowKeyToggle(event, u.id)}
                      >
                        <div className="user-compact-name-wrap">
                          {u.profile_image && !userAvatarErrors[u.id] ? (
                            <img
                              src={resolveMediaUrl(u.profile_image)}
                              alt={u.name || 'User'}
                              className="admin-user-avatar"
                              onError={() => setUserAvatarErrors((prev) => ({ ...prev, [u.id]: true }))}
                            />
                          ) : (
                            <span className="admin-user-avatar-fallback">{getInitials(u.name)}</span>
                          )}
                          <span className="user-compact-name">{truncateUserName(u.name || '-', 15)}</span>
                        </div>
                        <Link
                          to={`/admin/users/${u.id}/credit?returnTab=users`}
                          className="action-btn credit user-compact-credit-btn"
                          title="Credit Khata"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <CreditCard size={15} />
                          <span>Credit Khata</span>
                        </Link>
                      </div>
                      {isExpanded && (
                        <div className="user-compact-details">
                          <p><strong>Email:</strong> {u.email || '-'}</p>
                          <p><strong>Phone:</strong> {u.phone || '-'}</p>
                          <p><strong>Joined:</strong> {formatJoinedDate(u.created_at)}</p>
                          <div className="user-compact-actions">
                            <button
                              className="action-btn edit"
                              onClick={() => handleEditUser(u)}
                              title={u.email_verified && u.phone_verified ? 'Change user type' : 'Requires verified email and phone'}
                              disabled={!u.email_verified || !u.phone_verified}
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDeleteUser(u.id)}
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
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

        {activeTab === 'credit-aging' && (
          <CreditAgingReport user={user} />
        )}
        {activeTab === 'credit-khata' && <CreditKhata user={user} />}
        {activeTab === 'customer-requests' && <CustomerRequestsAdmin />}
        {activeTab === 'offers' && <OfferManagement />}
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
      {showApproveModal && modalOrder && (
        <AppModal
          open={showApproveModal}
          title={`Mark Received ${modalOrder.order_number || `#${modalOrder.id}`}`}
          onClose={() => setShowApproveModal(false)}
        >
          {modalLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <p>Customer: {truncateUserName(modalOrder.customer_name || '-', 15)} ({modalOrder.customer_email})</p>
              <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalItems.map(it => (
                      <tr key={it.id}>
                        <td style={{ padding: 6 }}>{it.product_name || it.name}</td>
                        <td style={{ padding: 6 }}>{it.quantity}</td>
                        <td style={{ padding: 6 }}>{/* we will fetch current stock via server when loading */}
                          {it.stock !== undefined ? it.stock : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="admin-btn" onClick={() => setShowApproveModal(false)} disabled={modalLoading}>Close</button>
                {!(Number(modalOrder?.bill_id || 0) || String(modalOrder?.linked_bill_number || '').trim()) ? (
                  <button
                    className="admin-btn"
                    onClick={() => handleProceedToBilling(modalOrder)}
                    disabled={modalLoading || proceedBillingOrderId === Number(modalOrder?.id || 0)}
                  >
                    {proceedBillingOrderId === Number(modalOrder?.id || 0)
                      ? 'Opening...'
                      : String(modalOrder?.status || '').toLowerCase() === 'ordered'
                        ? 'Confirm + Billing'
                        : 'Proceed Billing'}
                  </button>
                ) : (
                  <span style={{ opacity: 0.75, alignSelf: 'center' }}>
                    Bill: {modalOrder?.linked_bill_number || `#${modalOrder?.bill_id}`}
                  </span>
                )}
                <button className="admin-btn primary" onClick={confirmApprove} disabled={modalLoading}>Confirm Received</button>
              </div>
            </>
          )}
        </AppModal>
      )}
      {showExportDialog && (
        <AppModal
          open={showExportDialog}
          title="Export Products"
          onClose={() => setShowExportDialog(false)}
          dialogClassName="export-modal-card"
        >
            <p>Select format, then confirm export.</p>
            <div className="export-format-toggle-group">
              <button
                className={`admin-btn ${exportFormat === 'csv' ? 'primary' : ''}`}
                onClick={() => setExportFormat('csv')}
                disabled={importBusy}
              >
                CSV (.csv)
              </button>
              <button
                className={`admin-btn ${exportFormat === 'xlsx' ? 'primary' : ''}`}
                onClick={() => setExportFormat('xlsx')}
                disabled={importBusy}
              >
                Excel (.xlsx)
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="admin-btn" onClick={() => setShowExportDialog(false)} disabled={importBusy}>
                Cancel
              </button>
              <button className="admin-btn primary" onClick={handleExportProducts} disabled={importBusy}>
                Confirm Export
              </button>
            </div>
        </AppModal>
      )}
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
