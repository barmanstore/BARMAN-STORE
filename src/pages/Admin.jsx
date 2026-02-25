import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Package, ShoppingCart, Users, TrendingUp, LogOut, Plus, Edit, Trash2, X, FolderOpen, CreditCard, FileText, Truck, ShoppingBag, History, BarChart2, Gift, KeyRound, Eye, Menu, Upload, Download, CheckCircle2 } from 'lucide-react';
import { statsApi, productsApi, ordersApi, usersApi, adminApi, resolveMediaUrl } from '../services/api';
import { getProductImageSrc, getProductFallbackImage } from '../utils/productImage';
import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';
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
import PasswordResetRequests from './PasswordResetRequests';
import CreditKhata from './CreditKhata';
import AppModal from '../components/AppModal';
import './Admin.css';

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function Admin({ user }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const tab = new URLSearchParams(window.location.search).get('tab');
    const allowedTabs = new Set([
      'dashboard', 'orders', 'offers', 'credit-aging',
      'products', 'categories',
      'billing', 'view-bills',
      'purchases', 'distributors', 'stock-ledger',
      'users', 'credit-khata', 'password-resets', 'backup-restore'
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
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [userAvatarErrors, setUserAvatarErrors] = useState({});
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
  const [tableEditId, setTableEditId] = useState(null);
  const [tableEditSaving, setTableEditSaving] = useState(false);
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
  const tabGroupMap = {
    dashboard: 'general',
    orders: 'general',
    offers: 'general',
    'credit-aging': 'general',
    products: 'products',
    categories: 'products',
    billing: 'billing',
    'view-bills': 'billing',
    purchases: 'purchase',
    distributors: 'purchase',
    'stock-ledger': 'purchase',
    users: 'users',
    'credit-khata': 'users',
    'password-resets': 'users',
    'backup-restore': 'users'
  };
  const [expandedGroups, setExpandedGroups] = useState({
    general: true,
    products: false,
    billing: false,
    purchase: false,
    users: false
  });

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
      await ordersApi.updateStatus(modalOrder.id, 'confirmed', 'Approved via admin modal', user.id);
      setShowApproveModal(false);
      await refreshAdminData();
      showNotification('Order approved and stock applied', 'success');
      await fetch(`/api/notify-order/${modalOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approved' })
      }).catch(() => {});
    } catch (err) {
      showNotification(err.message || 'Failed to approve order', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (id, status) => {
    if (status === 'cancelled' && !window.confirm('Are you sure you want to cancel this order?')) return;
    if (status === 'confirmed' && !window.confirm('Approve this order and apply stock?')) return;
    try {
      await ordersApi.updateStatus(id, status, `Order ${status} via admin panel`, user.id);
      await refreshAdminData();
      showNotification(`Order ${status} successfully`, 'success');
    } catch (error) {
      console.error('Failed to update order status', error);
      showNotification(error.message || 'Failed to update order status', 'error');
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
    const group = tabGroupMap[activeTab];
    if (!group) return;
    setExpandedGroups(prev => ({ ...prev, [group]: true }));
  }, [activeTab]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabGroupMap[tabFromUrl] && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'backup-restore') {
      fetchBackups();
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-products-view', productViewMode);
  }, [productViewMode]);

  const toggleSidebarGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

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

  const fetchBackups = async () => {
    try {
      setBackupLoading(true);
      const rows = await adminApi.listBackups();
      setBackups(Array.isArray(rows) ? rows : []);
    } catch (error) {
      showNotification(error.message || 'Failed to load backups', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupBusy(true);
      const result = await adminApi.createBackup();
      const backupName = result?.backup?.file_name || 'backup';
      showNotification(`Backup created: ${backupName}`, 'success');
      await fetchBackups();
    } catch (error) {
      showNotification(error.message || 'Failed to create backup', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (fileName) => {
    if (!fileName) return;
    const ok = window.confirm(`Restore backup "${fileName}"?\n\nA pre-restore snapshot will be created automatically.`);
    if (!ok) return;

    try {
      setBackupBusy(true);
      const result = await adminApi.restoreBackup(fileName);
      showNotification(
        `Restore complete: ${result?.restored_file || fileName}. Pre-restore backup: ${result?.pre_restore_backup || 'created'}`,
        'success'
      );
      await fetchBackups();
      await refreshAdminData();
    } catch (error) {
      showNotification(error.message || 'Failed to restore backup', 'error');
    } finally {
      setBackupBusy(false);
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

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowProductForm(true);
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

  const pendingOrdersList = useMemo(
    () => orders.filter((o) => String(o?.status || '').toLowerCase() === 'pending'),
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

  const visibleProducts = useMemo(() => {
    const query = String(productTableSearch || '').trim().toLowerCase();
    let list = Array.isArray(products) ? [...products] : [];

    if (productTableCategoryFilter) {
      list = list.filter((product) => getCategoryPath(product) === productTableCategoryFilter);
    }

    if (productTableStatusFilter !== 'all') {
      list = list.filter((product) => {
        const isActive = Number(product.is_active ?? 1) === 1;
        return productTableStatusFilter === 'active' ? isActive : !isActive;
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
          product.content,
          product.color,
          getCategoryPath(product),
          product.sku,
          product.barcode,
          product.price,
          product.mrp,
          product.uom,
          product.stock,
          product.expiry_date,
          product.defaultDiscount,
          product.discountType,
          product.is_active,
        ].map((value) => String(value ?? '').toLowerCase()).join(' ');
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

  const openTableEdit = (product) => {
    setTableEditId(product.id);
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

  const cancelTableEdit = () => {
    setTableEditId(null);
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
                  className={`${activeTab === 'password-resets' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('password-resets')}
                >
                  <KeyRound size={18} /> Account Actions
                </button>
                <button
                  className={`${activeTab === 'backup-restore' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('backup-restore')}
                >
                  <History size={18} /> Backup & Restore
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
          <div className="dashboard">
            <h1>Dashboard</h1>
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
                  <div className="stat-group-metric"><span>Pending Orders</span><strong>{pendingOrdersList.length}</strong></div>
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
                  <div className="stat-group-metric"><span>Admin Users</span><strong>{adminUsers.length}</strong></div>
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
                  <div className="stat-group-metric"><span>Unique Month</span><strong>{visitorStats.uniqueSessionsMonth}</strong></div>
                  <div className="stat-group-metric"><span>Unique Year</span><strong>{visitorStats.uniqueSessionsYear}</strong></div>
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
                  <button className="admin-btn" onClick={() => handleTabChange('credit-khata')}>Credit Khata</button>
                  <button className="admin-btn" onClick={() => handleTabChange('purchases')}>Purchases</button>
                  <button className="admin-btn" onClick={() => handleTabChange('backup-restore')}>Backup & Restore</button>
                </div>
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Low Stock (≤ 10)</h3>
                  <button className="admin-btn" onClick={() => handleTabChange('products')}>Open Products</button>
                </div>
                {lowStockProducts.length === 0 ? (
                  <p className="dashboard-empty">No low stock products.</p>
                ) : (
                  <div className="dashboard-list">
                    {lowStockProducts.map((product) => (
                      <div className="dashboard-list-row" key={product.id}>
                        <span>{product.name}</span>
                        <strong>{asNumber(product.stock, 0)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Recent Orders</h3>
                  <button className="admin-btn" onClick={() => handleTabChange('orders')}>View All</button>
                </div>
                {recentOrders.length === 0 ? (
                  <p className="dashboard-empty">No orders yet.</p>
                ) : (
                  <div className="dashboard-list">
                    {recentOrders.map((order) => (
                      <div className="dashboard-list-row" key={order.id}>
                        <span>{order.order_number || `#${order.id}`}</span>
                        <span>{new Date(order.created_at || Date.now()).toLocaleDateString()}</span>
                        <span>{formatCurrency(order.total_amount || 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <h3>Recent Customers</h3>
                  <button className="admin-btn" onClick={() => handleTabChange('users')}>Open Users</button>
                </div>
                {recentCustomers.length === 0 ? (
                  <p className="dashboard-empty">No customers found.</p>
                ) : (
                  <div className="dashboard-list">
                    {recentCustomers.map((customer) => (
                      <div className="dashboard-list-row" key={customer.id}>
                        <span>{customer.name || '-'}</span>
                        <span>{customer.phone || customer.email || '-'}</span>
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

        {activeTab === 'products' && (
          <div className="products-management">
            <div className="section-header">
              <h1>Products Management</h1>
              <div className="products-actions">
                <div className="view-toggle">
                  <button
                    className={`admin-btn ${productViewMode === 'table' ? 'primary' : ''}`}
                    onClick={() => setProductViewMode('table')}
                  >
                    Table
                  </button>
                  <button
                    className={`admin-btn ${productViewMode === 'grid' ? 'primary' : ''}`}
                    onClick={() => setProductViewMode('grid')}
                  >
                    Grid
                  </button>
                </div>
                <button className="admin-btn primary" onClick={handleAddProduct}>
                  <Plus size={20} /> Add Product
                </button>
                <div className="products-io-icons">
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
              </div>
            </div>
            <div className="products-import-export-card">
              <div className="products-import-controls">
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelected}
                  disabled={importBusy}
                  style={{ display: 'none' }}
                />
                <span>{importFile ? `Selected: ${importFile.name}` : 'No file selected'}</span>
              </div>
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
            {productViewMode === 'table' ? (
              <>
                <div className="products-table-toolbar">
                  <input
                    type="text"
                    className="products-table-search"
                    placeholder="Search by name, SKU, barcode, category, brand..."
                    value={productTableSearch}
                    onChange={(e) => setProductTableSearch(e.target.value)}
                  />
                  <select
                    className="products-table-filter"
                    value={productTableCategoryFilter}
                    onChange={(e) => setProductTableCategoryFilter(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {productCategories.map((category) => (
                      <option key={`filter-${category}`} value={category}>{category}</option>
                    ))}
                  </select>
                  <select
                    className="products-table-filter"
                    value={productTableStatusFilter}
                    onChange={(e) => setProductTableStatusFilter(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
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
                  <span className="products-table-count">Rows: {visibleProducts.length}</span>
                </div>
                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => toggleProductTableSort('name')}>Name{getSortIndicator('name')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('brand')}>Brand{getSortIndicator('brand')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('category')}>Category{getSortIndicator('category')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('price')}>Price{getSortIndicator('price')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('mrp')}>MRP{getSortIndicator('mrp')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('stock')}>Stock{getSortIndicator('stock')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('sku')}>SKU{getSortIndicator('sku')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('barcode')}>Barcode{getSortIndicator('barcode')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('is_active')}>Status{getSortIndicator('is_active')}</th>
                        <th>Description</th>
                        <th>Content</th>
                        <th>Color</th>
                        <th>UOM</th>
                        <th>Expiry</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('defaultDiscount')}>Discount{getSortIndicator('defaultDiscount')}</th>
                        <th>Disc Type</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('id')}>ID{getSortIndicator('id')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('created_at')}>Created{getSortIndicator('created_at')}</th>
                        <th className="sortable" onClick={() => toggleProductTableSort('src')}>Src{getSortIndicator('src')}</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map(product => {
                        const isEditingRow = tableEditId === product.id;
                        return (
                          <tr key={product.id}>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.name} onChange={(e) => handleTableEditChange('name', e.target.value)} /> : product.name}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.brand} onChange={(e) => handleTableEditChange('brand', e.target.value)} /> : (getBrandPath(product) || '-')}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" list="admin-product-category-list" value={tableEditForm.category} onChange={(e) => handleTableEditChange('category', e.target.value)} /> : getCategoryPath(product)}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" type="number" min="0" step="0.01" value={tableEditForm.price} onChange={(e) => handleTableEditChange('price', e.target.value)} /> : formatCurrencyColored(product.price)}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" type="number" min="0" step="0.01" value={tableEditForm.mrp} onChange={(e) => handleTableEditChange('mrp', e.target.value)} /> : formatCurrencyColored(product.mrp)}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" type="number" min="0" step="1" value={tableEditForm.stock} onChange={(e) => handleTableEditChange('stock', e.target.value)} /> : <span className={product.stock < 10 ? 'low-stock' : ''}>{product.stock}</span>}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.sku} onChange={(e) => handleTableEditChange('sku', e.target.value)} /> : (product.sku || '-')}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.barcode} onChange={(e) => handleTableEditChange('barcode', e.target.value)} /> : (product.barcode || '-')}</td>
                            <td>
                              {isEditingRow ? (
                                <select className="table-edit-input" value={tableEditForm.is_active ? '1' : '0'} onChange={(e) => handleTableEditChange('is_active', e.target.value === '1')}>
                                  <option value="1">Active</option>
                                  <option value="0">Inactive</option>
                                </select>
                              ) : (Number(product.is_active ?? 1) === 1 ? 'Active' : 'Inactive')}
                            </td>
                            <td>
                              {isEditingRow ? (
                                <input className="table-edit-input" value={tableEditForm.description} onChange={(e) => handleTableEditChange('description', e.target.value)} />
                              ) : (
                                <span className="description-snippet" title={product.description || '-'}>
                                  {product.description || '-'}
                                </span>
                              )}
                            </td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.content} onChange={(e) => handleTableEditChange('content', e.target.value)} /> : (product.content || '-')}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.color} onChange={(e) => handleTableEditChange('color', e.target.value)} /> : (product.color || '-')}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.uom} onChange={(e) => handleTableEditChange('uom', e.target.value)} /> : (product.uom || '-')}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" type="date" value={tableEditForm.expiry_date} onChange={(e) => handleTableEditChange('expiry_date', e.target.value)} /> : (product.expiry_date ? new Date(product.expiry_date).toLocaleDateString() : '-')}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" type="number" min="0" step="0.01" value={tableEditForm.defaultDiscount} onChange={(e) => handleTableEditChange('defaultDiscount', e.target.value)} /> : asNumber(product.defaultDiscount, 0)}</td>
                            <td>
                              {isEditingRow ? (
                                <select className="table-edit-input" value={tableEditForm.discountType} onChange={(e) => handleTableEditChange('discountType', e.target.value)}>
                                  <option value="fixed">fixed</option>
                                  <option value="percentage">percentage</option>
                                </select>
                              ) : (product.discountType || 'fixed')}
                            </td>
                            <td>{product.id}</td>
                            <td>{product.created_at ? new Date(product.created_at).toLocaleDateString() : '-'}</td>
                            <td>{isEditingRow ? <input className="table-edit-input" value={tableEditForm.image} onChange={(e) => handleTableEditChange('image', e.target.value)} /> : <span className="src-cell" title={product.image || '-'}>{product.image || '-'}</span>}</td>
                            <td>
                              {isEditingRow ? (
                                <div className="table-edit-actions">
                                  <button className="action-btn edit" onClick={() => handleTableEditSave(product)} disabled={tableEditSaving}>
                                    {tableEditSaving ? '...' : 'Save'}
                                  </button>
                                  <button className="action-btn delete" onClick={cancelTableEdit} disabled={tableEditSaving}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button className="action-btn edit" onClick={() => openTableEdit(product)} title="Inline edit">
                                    <Edit size={16} />
                                  </button>
                                  <button className="action-btn edit" onClick={() => handleEditProduct(product)} title="Advanced edit">
                                    <FolderOpen size={16} />
                                  </button>
                                  <button className="action-btn delete" onClick={() => handleDeleteProduct(product.id)}>
                                    <Trash2 size={16} />
                                  </button>
                                  {Number(product.is_active ?? 1) === 0 && (
                                    <button
                                      className="action-btn delete"
                                      title="Permanent delete"
                                      onClick={() => handlePermanentDeleteProduct(product)}
                                    >
                                      <X size={16} />
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
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
                          <h3>{product.name}</h3>
                          <p className="product-meta">{getCategoryPath(product)}</p>
                          <p className="product-meta">{formatCurrencyColored(product.price)}</p>
                          <p className={product.stock < 10 ? 'product-stock-label low-stock' : 'product-stock-label'}>
                            Stock: {product.stock}
                          </p>
                          <div className="product-card-actions">
                            <button className="action-btn edit" onClick={() => startQuickEdit(product)} title="Quick edit">
                              <Edit size={16} />
                            </button>
                            <button className="action-btn edit" onClick={() => handleEditProduct(product)} title="Advanced edit">
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
            <div className="orders-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{order.customer_name}</td>
                      <td>{order.customer_email}</td>
                      <td>{formatCurrencyColored(order.total_amount)}</td>
                      <td>
                        <span className={`status ${order.status}`}>{order.status}</span>
                      </td>
                      <td>
                        {order.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="admin-btn" onClick={() => openApproveModal(order.id)}>Approve</button>
                            <button className="admin-btn" onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}>Cancel</button>
                          </div>
                        ) : (
                          <span style={{ opacity: 0.8 }}>—</span>
                        )}
                      </td>
                      <td>{new Date(order.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
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
            <div className="users-group">
              <h2>Admins ({adminUsers.length})</h2>
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.length === 0 ? (
                      <tr>
                        <td colSpan="3">No admins found.</td>
                      </tr>
                    ) : adminUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-user-name-cell">
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
                              <span>{u.name || '-'}</span>
                            </div>
                            <div className="admin-user-meta-row">
                              <span className="admin-user-joined">Joined: {formatJoinedDate(u.created_at)}</span>
                              <div className="admin-user-actions">
                                <span className="admin-badge">Admin</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{u.email || '-'}</td>
                        <td>{u.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="users-group">
              <h2>Customers ({customerUsers.length})</h2>
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerUsers.length === 0 ? (
                      <tr>
                        <td colSpan="3">No customers found.</td>
                      </tr>
                    ) : customerUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-user-name-cell">
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
                              <span>{u.name || '-'}</span>
                            </div>
                            <div className="admin-user-meta-row">
                              <span className="admin-user-joined">Joined: {formatJoinedDate(u.created_at)}</span>
                              <div className="admin-user-actions">
                                <Link
                                  to={`/admin/users/${u.id}/credit?returnTab=users`}
                                  className="action-btn credit"
                                  title="Credit History"
                                >
                                  <CreditCard size={16} />
                                </Link>
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
                          </div>
                        </td>
                        <td>{u.email || '-'}</td>
                        <td>{u.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'backup-restore' && (
          <div className="users-management">
            <div className="section-header">
              <h1>Backup & Restore</h1>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="admin-btn" onClick={fetchBackups} disabled={backupLoading || backupBusy}>
                  Refresh
                </button>
                <button className="admin-btn primary" onClick={handleCreateBackup} disabled={backupBusy}>
                  <Plus size={20} /> Create Backup
                </button>
              </div>
            </div>
            <div className="categories-info">
              <p>Restoring data will replace the current database. A pre-restore backup is created automatically.</p>
            </div>
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Created</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupLoading ? (
                    <tr>
                      <td colSpan="4">Loading backups...</td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan="4">No backups found</td>
                    </tr>
                  ) : backups.map((backup) => (
                    <tr key={backup.file_name}>
                      <td>{backup.file_name}</td>
                      <td>{backup.created_at ? new Date(backup.created_at).toLocaleString() : '-'}</td>
                      <td>{formatBytes(backup.size_bytes)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <a
                            className="admin-btn"
                            href={`/api/admin/backup/download/${encodeURIComponent(backup.file_name)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                          <button
                            className="admin-btn"
                            onClick={() => handleRestoreBackup(backup.file_name)}
                            disabled={backupBusy}
                          >
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'billing' && <BillingTab />}
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
        {activeTab === 'offers' && <OfferManagement />}
        {activeTab === 'password-resets' && <PasswordResetRequests />}
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
          title={`Approve Order ${modalOrder.order_number || `#${modalOrder.id}`}`}
          onClose={() => setShowApproveModal(false)}
        >
          {modalLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <p>Customer: {modalOrder.customer_name} ({modalOrder.customer_email})</p>
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
                <button className="admin-btn primary" onClick={confirmApprove} disabled={modalLoading}>Confirm Approve</button>
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
