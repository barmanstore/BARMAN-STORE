import { useRef, useState } from 'react';

const useAdminState = ({
  toLocalDateKey,
  PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
  PRODUCT_TABLE_ALL_COLUMN_KEYS,
  SIDEBAR_SECTIONS,
}) => {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const tab = new URLSearchParams(window.location.search).get('tab');
    const allowedTabs = new Set([
      'dashboard', 'orders', 'offers', 'credit-aging',
      'products', 'categories',
      'billing', 'daily-sales', 'view-bills',
      'purchases', 'distributors', 'stock-ledger', 'product-insights', 'distributor-insights',
      'users', 'credit-khata', 'customer-requests',
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
    image: '',
  });
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEditForm, setQuickEditForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    image: '',
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
    image: '',
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
  const [expandedGroups, setExpandedGroups] = useState({
    general: true,
    products: false,
    billing: false,
    purchase: false,
    users: false,
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

  return {
    activeTab,
    setActiveTab,
    stats,
    setStats,
    visitorStats,
    setVisitorStats,
    products,
    setProducts,
    orders,
    setOrders,
    users,
    setUsers,
    bills,
    setBills,
    dailySalesDate,
    setDailySalesDate,
    dailySalesLoading,
    setDailySalesLoading,
    dailySalesError,
    setDailySalesError,
    loading,
    setLoading,
    showProductForm,
    setShowProductForm,
    editingProduct,
    setEditingProduct,
    showCategoryManagement,
    setShowCategoryManagement,
    editingUser,
    setEditingUser,
    showUserForm,
    setShowUserForm,
    isCreatingUser,
    setIsCreatingUser,
    notification,
    setNotification,
    showApproveModal,
    setShowApproveModal,
    modalOrder,
    setModalOrder,
    modalItems,
    setModalItems,
    modalLoading,
    setModalLoading,
    billingPrefill,
    setBillingPrefill,
    proceedBillingOrderId,
    setProceedBillingOrderId,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    userAvatarErrors,
    setUserAvatarErrors,
    ordersSearchQuery,
    setOrdersSearchQuery,
    usersSearchQuery,
    setUsersSearchQuery,
    expandedUsersMap,
    setExpandedUsersMap,
    dashboardDensity,
    setDashboardDensity,
    productViewMode,
    setProductViewMode,
    showQuickAdd,
    setShowQuickAdd,
    quickSaving,
    setQuickSaving,
    quickAddForm,
    setQuickAddForm,
    quickEditId,
    setQuickEditId,
    quickEditForm,
    setQuickEditForm,
    productTableSearch,
    setProductTableSearch,
    productTableSortField,
    setProductTableSortField,
    productTableSortDir,
    setProductTableSortDir,
    productTableCategoryFilter,
    setProductTableCategoryFilter,
    productTableStatusFilter,
    setProductTableStatusFilter,
    productTableLowStockOnly,
    setProductTableLowStockOnly,
    productTableVisibleColumns,
    setProductTableVisibleColumns,
    selectedProductId,
    setSelectedProductId,
    tableEditId,
    setTableEditId,
    tableEditFocusField,
    setTableEditFocusField,
    tableEditSaving,
    setTableEditSaving,
    productEditLoadingId,
    setProductEditLoadingId,
    tableEditForm,
    setTableEditForm,
    importFile,
    setImportFile,
    showExportDialog,
    setShowExportDialog,
    exportFormat,
    setExportFormat,
    importPreviewData,
    setImportPreviewData,
    importAllowIdenticalRows,
    setImportAllowIdenticalRows,
    importBusy,
    setImportBusy,
    importFileInputRef,
    tableEditFieldRefs,
    productColumnPickerRef,
    latestKnownOrderIdRef,
    expandedGroups,
    setExpandedGroups,
    desktopActiveGroup,
    setDesktopActiveGroup,
    desktopPanelCollapsed,
    setDesktopPanelCollapsed,
  };
};

export default useAdminState;
