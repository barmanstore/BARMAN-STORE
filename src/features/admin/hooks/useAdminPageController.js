import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
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
  resolveMediaUrl,
} from '../api/index.js';
import { getProductImageSrc, getProductFallbackImage } from '../../../shared/utils/productImage';
import { truncateUserName } from '../../../shared/utils/formatters';
import useLockBodyScroll from '../../../shared/hooks/useLockBodyScroll';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import { MOBILE_ALLOWED_TABS, MOBILE_SIDEBAR_SECTIONS, SIDEBAR_SECTIONS } from '../config/adminSidebarConfig';
import {
  PRODUCT_TABLE_ALL_COLUMN_KEYS,
  PRODUCT_TABLE_COLUMN_MIN_WIDTH,
  PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
} from '../config/productTableConfig';
import { asNumber, getBrandPath, getCategoryPath, toLocalDateKey } from '../utils/adminHelpers';
import useAdminProductHandlers from './useAdminProductHandlers';
import useAdminQuickProductActions from './useAdminQuickProductActions';
import useAdminState from './useAdminState';
import useAdminComputedData from './useAdminComputedData';
import useAdminProductTable from './useAdminProductTable';
import useAdminImportExport from './useAdminImportExport';
import useAdminDataLoaders from './useAdminDataLoaders';
import useAdminOrderActions from './useAdminOrderActions';
import useAdminUserActions from './useAdminUserActions';
import useAdminNavigation from './useAdminNavigation';
import useAdminEffects from './useAdminEffects';
import { normalizeCashSummary, normalizeDailyCashTallyEntry } from '../utils/dailyCashSummary';
import { DOMAINS, registerDomainListener } from '../../../shared/services/invalidation';

const useAdminPageController = ({ user }) => {
  const navigate = useNavigate();
  const { tab: routeTab = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const {
    activeTab,
    setActiveTab,
    stats,
    setStats,
    visitorStats,
    setVisitorStats,
    todayCashSummary,
    setTodayCashSummary,
    setCreditAgingSummary,
    setPurchaseOpsSummary,
    products,
    setProducts,
    productCategories: rawProductCategories,
    setProductCategories,
    productsPage,
    setProductsPage,
    productsTotal,
    setProductsTotal,
    productsLoading,
    setProductsLoading,
    productSummary,
    setProductSummary,
    productInsights,
    setProductInsights,
    orders,
    setOrders,
    users,
    setUsers,
    recentOrdersPreview,
    setRecentOrdersPreview,
    recentCustomersPreview,
    setRecentCustomersPreview,
    userDirectorySummary,
    setUserDirectorySummary,
    ordersPage,
    setOrdersPage,
    ordersTotal,
    setOrdersTotal,
    ordersLoading,
    setOrdersLoading,
    usersPage,
    setUsersPage,
    usersTotal,
    setUsersTotal,
    usersLoading,
    setUsersLoading,
    bills,
    setBills,
    dailySalesDate,
    setDailySalesDate,
    dailyCashTally: rawDailyCashTally,
    setDailyCashTally,
    dailyCashTallySaving,
    setDailyCashTallySaving,
    dailySalesLoading,
    setDailySalesLoading,
    dailySalesError,
    setDailySalesError,
    dailyCashTallyError,
    setDailyCashTallyError,
    loading,
    setLoading,
    showProductForm,
    setShowProductForm,
    productFormMode,
    setProductFormMode,
    editingProduct,
    setEditingProduct,
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
  } = useAdminState({
    toLocalDateKey,
    PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
    PRODUCT_TABLE_ALL_COLUMN_KEYS,
    SIDEBAR_SECTIONS,
  });
  const [billingShortcutRequest, setBillingShortcutRequest] = useState(0);
  const [purchaseShortcutRequest, setPurchaseShortcutRequest] = useState(0);
  const [purchaseShortcutPayload, setPurchaseShortcutPayload] = useState(null);

  const showNotification = useCallback((message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, [setNotification]);

  const closeNotification = useCallback(() => {
    setNotification(null);
  }, [setNotification]);

  const {
    refreshAdminData,
    ensureTabData,
    loadProductsPage,
    loadProductCategories,
    loadOrdersPage,
    loadUsersPage,
    loadDailySalesBills,
  } = useAdminDataLoaders({
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
  });
  const refreshOrdersData = useCallback(async () => {
    await loadOrdersPage({
      page: ordersPage,
      query: ordersSearchQuery,
      silent: false,
    });
  }, [
    loadOrdersPage,
    ordersPage,
    ordersSearchQuery,
  ]);

  const refreshAdminProducts = useCallback(async () => {
    await loadProductsPage({
      page: productsPage,
      query: productTableSearch,
      category: productTableCategoryFilter,
      brand: '',
      status: productTableStatusFilter,
      lowStockOnly: productTableLowStockOnly,
      sortField: productTableSortField,
      sortDir: productTableSortDir,
    });
  }, [
    loadProductsPage,
    productsPage,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
  ]);

  useEffect(() => registerDomainListener(DOMAINS.Products, refreshAdminProducts, {
    listenerId: 'admin-products',
  }), [refreshAdminProducts]);

  useEffect(() => {
    setProductsPage(1);
  }, [
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
    setProductsPage,
  ]);

  useEffect(() => {
    if (activeTab !== 'products') return undefined;
    if (typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => {
      void loadProductCategories();
      void loadProductsPage({
        page: productsPage,
        query: productTableSearch,
        category: productTableCategoryFilter,
        brand: '',
        status: productTableStatusFilter,
        lowStockOnly: productTableLowStockOnly,
        sortField: productTableSortField,
        sortDir: productTableSortDir,
      });
    }, productTableSearch ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    loadProductCategories,
    loadProductsPage,
    productTableCategoryFilter,
    productTableLowStockOnly,
    productTableSearch,
    productTableSortDir,
    productTableSortField,
    productTableStatusFilter,
    productsPage,
  ]);
  const {
    desktopCurrentSection,
    mobileSidebarSections,
    toggleSidebarGroup,
    handleDesktopGroupSelect,
    handleTabChange,
  } = useAdminNavigation({
    activeTab,
    setActiveTab,
    isMobile,
    routeTab,
    navigate,
    MOBILE_ALLOWED_TABS,
    SIDEBAR_SECTIONS,
    MOBILE_SIDEBAR_SECTIONS,
    setExpandedGroups,
    desktopActiveGroup,
    setDesktopActiveGroup,
    desktopPanelCollapsed,
    setDesktopPanelCollapsed,
    setIsMobileSidebarOpen,
  });

  const handleOpenPurchaseShortcut = useCallback((payload = null) => {
    const nextPayload = payload && typeof payload === 'object' ? payload : null;
    const shortcutAction = String(nextPayload?.action || 'create-draft').trim().toLowerCase();
    const selectedCount = Array.isArray(nextPayload?.suggestedItems) ? nextPayload.suggestedItems.length : 0;
    const isRestockShortcut = String(nextPayload?.source || '').trim().toLowerCase() === 'restock';
    const inlineMessage = shortcutAction === 'open-payment'
      ? 'Supplier payment opened.'
      : shortcutAction === 'open-order'
        ? 'Purchase review opened.'
        : (
          selectedCount > 0
            ? `PO draft opened with ${selectedCount} item${selectedCount === 1 ? '' : 's'}.`
            : 'PO draft opened.'
        );

    setPurchaseShortcutPayload(nextPayload);
    setPurchaseShortcutRequest((current) => current + 1);
    if (!isRestockShortcut) {
      handleTabChange('purchases');
    }
    showNotification(inlineMessage, 'success');
  }, [handleTabChange, showNotification]);

  const handleClosePurchaseShortcutDraft = useCallback((details = {}) => {
    setPurchaseShortcutPayload(null);
    setPurchaseShortcutRequest(0);
    const returnTab = String(details?.returnTab || 'restock-dashboard').trim() || 'restock-dashboard';
    const reason = String(details?.reason || '').trim().toLowerCase();
    if (reason === 'deferred') {
      showNotification('Restock selection kept. Retry when ready.', 'success');
    } else if (reason === 'empty') {
      showNotification('PO closed because no restock items remain.', 'success');
    } else if (reason === 'cancel') {
      showNotification('PO cancelled and returned to restock.', 'success');
    }
    handleTabChange(returnTab);
  }, [handleTabChange, showNotification]);

  useLockBodyScroll(isMobileSidebarOpen);

  useEffect(() => {
    const shortcutAction = String(searchParams.get('shortcut') || '').trim().toLowerCase();
    const shortcutToken = String(searchParams.get('shortcutToken') || '').trim();
    if (!shortcutAction || !shortcutToken) return;

    const next = new URLSearchParams(searchParams);
    next.delete('shortcut');
    next.delete('shortcutToken');

    if (shortcutAction === 'billing-focus') {
      if (activeTab !== 'billing') {
        setActiveTab('billing');
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBillingShortcutRequest((current) => current + 1);
    } else if (shortcutAction === 'open-po') {
      if (activeTab !== 'purchases') {
        setActiveTab('purchases');
      }
      setPurchaseShortcutPayload(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPurchaseShortcutRequest((current) => current + 1);
    }

    setSearchParams(next, { replace: true });
  }, [activeTab, searchParams, setActiveTab, setSearchParams]);

  useEffect(() => {
    const formMode = String(searchParams.get('productForm') || '').trim().toLowerCase();
    if (!formMode) return;
    const next = new URLSearchParams(searchParams);
    next.delete('productForm');
    setSearchParams(next, { replace: true });

    if (activeTab !== 'products') {
      setActiveTab('products');
    }
    setEditingProduct(null);
    setProductFormMode(formMode === 'quick' ? 'quick' : 'full');
    setShowProductForm(true);
  }, [activeTab, searchParams, setActiveTab, setEditingProduct, setProductFormMode, setSearchParams, setShowProductForm]);

  useAdminEffects({
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
    productColumnPickerRef,
    tableEditId,
    tableEditFocusField,
    tableEditFieldRefs,
    productViewMode,
    dashboardDensity,
    productTableVisibleColumns,
    desktopActiveGroup,
    desktopPanelCollapsed,
  });

  const toggleUserCompactRow = (userId) => {
    setExpandedUsersMap((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleCompactRowKeyToggle = (event, userId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleUserCompactRow(userId);
    }
  };

  const {
    handleDeleteProduct,
    handlePermanentDeleteProduct,
    handleEditProduct,
    handleAddProduct,
    handleBulkProductUpdate,
    handleUndoTableAction,
    handleProductSave,
    bulkJob,
    handleCancelBulkJob,
    handleRetryFailedBulkJob,
    dismissBulkJob,
    registerBulkJob,
  } = useAdminProductHandlers({
    productsApi,
    statsApi,
    setStats,
    showNotification,
    setEditingProduct,
    setShowProductForm,
    setProductFormMode,
    setProductEditLoadingId,
    editingProduct,
    loadProductsPage,
    productsPage,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
  });
  const {
    resetQuickAdd,
    handleQuickAddSave,
    startQuickEdit,
    cancelQuickEdit,
    handleQuickEditSave,
  } = useAdminQuickProductActions({
    quickAddForm,
    quickEditForm,
    setQuickAddForm,
    setQuickEditForm,
    setQuickEditId,
    setShowQuickAdd,
    setQuickSaving,
    productsApi,
    handleProductSave,
    showNotification,
    getBrandPath,
    getCategoryPath,
  });

  const {
    handleDeleteUser,
    handleEditUser,
    handleUserSave,
    handleAddUser,
    handleCreateUser,
  } = useAdminUserActions({
    currentUser: user,
    usersApi,
    setUsers,
    loadUsersPage,
    usersPage,
    usersSearchQuery,
    setUsersSearchQuery,
    showNotification,
    setEditingUser,
    setIsCreatingUser,
    setShowUserForm,
  });

  const {
    productCategories,
    activeProductsCount,
    inactiveProductsCount,
    customerUsers,
    adminUsers,
    filteredUsers,
    filteredUsersCount,
    visibleOrders,
    recentOrders,
    lowStockProducts,
    recentCustomers,
    selectedDateKey,
    dailyCashTally,
    selectedSalesBills,
    dailySalesSummary,
    topSellingProducts,
    slowMovingProducts,
  } = useAdminComputedData({
    products,
    productInsights,
    productCategories: rawProductCategories,
    productSummary,
    users,
    orders,
    recentOrdersPreview,
    recentCustomersPreview,
    bills,
    dailySalesDate,
    dailyCashTally: rawDailyCashTally,
    toLocalDateKey,
    asNumber,
    getCategoryPath,
  });

  const {
    visibleProducts,
    productTableAllColumnsSelected,
    isProductTableColumnVisible,
    toggleProductTableColumn,
    toggleSelectAllProductTableColumns,
    productTableCalculatedMinWidth,
    selectedVisibleProduct,
    toggleProductTableSort,
    getSortIndicator,
    setTableEditFieldRef,
    openTableEdit,
    handleTableCellClick,
    cancelTableEdit,
    handleTableEditChange,
    handleTableEditKeyDown,
    handleTableEditSave,
  } = useAdminProductTable({
    products,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
    productTableVisibleColumns,
    PRODUCT_TABLE_ALL_COLUMN_KEYS,
    PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
    PRODUCT_TABLE_COLUMN_MIN_WIDTH,
    setProductTableVisibleColumns,
    setProductTableSortField,
    setProductTableSortDir,
    selectedProductId,
    setSelectedProductId,
    tableEditId,
    setTableEditId,
    setTableEditFocusField,
    setTableEditForm,
    setTableEditSaving,
    tableEditForm,
    productsApi,
    handleProductSave,
    showNotification,
    getCategoryPath,
    getBrandPath,
    asNumber,
    setQuickEditId,
    tableEditFieldRefs,
  });

  const {
    handleExportProducts,
    handleStartImport,
    handleFileSelected,
    handleConfirmImport,
  } = useAdminImportExport({
    productsApi,
    user,
    importFile,
    setImportFile,
    importPreviewData,
    setImportPreviewData,
    importAllowIdenticalRows,
    setImportAllowIdenticalRows,
    setImportBusy,
    importBusy,
    importFileInputRef,
    showNotification,
    registerBulkJob,
    setShowExportDialog,
    exportFormat,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
  });
  const {
    openApproveModal,
    confirmApprove,
    handleApplyPendingFulfillment,
    handleProceedToBilling,
  } = useAdminOrderActions({
    ordersApi,
    user,
    setModalLoading,
    setModalOrder,
    setModalItems,
    setShowApproveModal,
    modalOrder,
    showNotification,
    refreshAdminData,
    refreshOrdersData,
    setProceedBillingOrderId,
    setBillingPrefill,
    handleTabChange,
  });

  const effectiveProductViewMode = isMobile ? 'grid' : productViewMode;
  const canEditDailyCashTally = String(user?.role || '').trim().toLowerCase() === 'admin';
  const handleSaveDailyCashTally = useCallback(async ({
    date,
    countedCashTotal,
    note = '',
  } = {}) => {
    const dateKey = String(date || '').trim();
    const amount = Number(countedCashTotal);
    if (!dateKey) {
      const message = 'Select a valid date before saving the cash tally.';
      setDailyCashTallyError(message);
      showNotification(message, 'error');
      return { success: false };
    }
    if (!Number.isFinite(amount) || amount < 0) {
      const message = 'Enter a valid non-negative counted cash total.';
      setDailyCashTallyError(message);
      showNotification(message, 'error');
      return { success: false };
    }

    try {
      setDailyCashTallySaving(true);
      setDailyCashTallyError('');
      const response = await adminApi.upsertDailyCashTally({
        date: dateKey,
        counted_cash_total: amount,
        note,
      });
      const normalizedEntry = normalizeDailyCashTallyEntry(response, dateKey);
      setDailyCashTally(normalizedEntry);
      if (dateKey === toLocalDateKey(new Date())) {
        setTodayCashSummary(normalizeCashSummary(response?.summary));
      }
      showNotification('Daily cash tally saved.', 'success');
      return { success: true, entry: normalizedEntry };
    } catch (error) {
      const message = error?.message || 'Failed to save daily cash tally';
      setDailyCashTallyError(message);
      showNotification(message, 'error');
      return { success: false, error };
    } finally {
      setDailyCashTallySaving(false);
    }
  }, [
    setDailyCashTally,
    setDailyCashTallyError,
    setDailyCashTallySaving,
    setTodayCashSummary,
    showNotification,
  ]);

  const showProductsImportCard = !isMobile && Boolean(
    importPreviewData?.batch_id
    || importPreviewData?.summary
    || (Array.isArray(importPreviewData?.preview) && importPreviewData.preview.length > 0)
  );

  return {
    user,
    loading,
    notification,
    closeNotification,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    desktopPanelCollapsed,
    setDesktopPanelCollapsed,
    SIDEBAR_SECTIONS,
    desktopActiveGroup,
    handleDesktopGroupSelect,
    desktopCurrentSection,
    activeTab,
    handleTabChange,
    mobileSidebarSections,
    expandedGroups,
    toggleSidebarGroup,
    dashboardDensity,
    setDashboardDensity,
    isMobile,
    stats,
    todayCashSummary,
    billingShortcutRequest,
    setBillingShortcutRequest,
    purchaseShortcutRequest,
    setPurchaseShortcutRequest,
    purchaseShortcutPayload,
    setPurchaseShortcutPayload,
    handleOpenPurchaseShortcut,
    handleClosePurchaseShortcutDraft,
    activeProductsCount,
    inactiveProductsCount,
    lowStockProducts,
    products,
    productsPage,
    setProductsPage,
    productsTotal,
    productsLoading,
    visitorStats,
    userDirectorySummary,
    recentOrders,
    recentCustomers,
    selectedDateKey,
    setDailySalesDate,
    loadDailySalesBills,
    dailyCashTally,
    dailyCashTallySaving,
    dailyCashTallyError,
    canEditDailyCashTally,
    handleSaveDailyCashTally,
    dailySalesLoading,
    dailySalesError,
    dailySalesSummary,
    topSellingProducts,
    slowMovingProducts,
    selectedSalesBills,
    handleAddProduct,
    handleBulkProductUpdate,
    handleUndoTableAction,
    setShowExportDialog,
    importBusy,
    handleStartImport,
    handleConfirmImport,
    showProductsImportCard,
    importPreviewData,
    importFile,
    importAllowIdenticalRows,
    setImportAllowIdenticalRows,
    effectiveProductViewMode,
    setProductViewMode,
    importFileInputRef,
    handleFileSelected,
    productTableSearch,
    setProductTableSearch,
    visibleProducts,
    productTableCategoryFilter,
    setProductTableCategoryFilter,
    productCategories,
    productColumnPickerRef,
    productTableVisibleColumns,
    productTableAllColumnsSelected,
    toggleSelectAllProductTableColumns,
    isProductTableColumnVisible,
    toggleProductTableColumn,
    productTableStatusFilter,
    setProductTableStatusFilter,
    productTableLowStockOnly,
    setProductTableLowStockOnly,
    selectedVisibleProduct,
    tableEditId,
    handleTableEditSave,
    tableEditSaving,
    cancelTableEdit,
    openTableEdit,
    handleEditProduct,
    productEditLoadingId,
    handleDeleteProduct,
    handlePermanentDeleteProduct,
    productTableCalculatedMinWidth,
    toggleProductTableSort,
    getSortIndicator,
    tableEditForm,
    handleTableCellClick,
    setTableEditFieldRef,
    handleTableEditChange,
    handleTableEditKeyDown,
    setSelectedProductId,
    selectedProductId,
    showQuickAdd,
    setShowQuickAdd,
    quickAddForm,
    setQuickAddForm,
    resetQuickAdd,
    quickSaving,
    handleQuickAddSave,
    quickEditId,
    quickEditForm,
    setQuickEditForm,
    cancelQuickEdit,
    handleQuickEditSave,
    startQuickEdit,
    getProductImageSrc,
    getProductFallbackImage,
    getCategoryPath,
    getBrandPath,
    ordersSearchQuery,
    setOrdersSearchQuery,
    visibleOrders,
    orders,
    ordersPage,
    setOrdersPage,
    ordersTotal,
    ordersLoading,
    openApproveModal,
    handleProceedToBilling,
    proceedBillingOrderId,
    handleApplyPendingFulfillment,
    usersSearchQuery,
    setUsersSearchQuery,
    filteredUsersCount,
    handleAddUser,
    users,
    filteredUsers,
    adminUsers,
    customerUsers,
    usersPage,
    setUsersPage,
    usersTotal,
    usersLoading,
    expandedUsersMap,
    toggleUserCompactRow,
    handleCompactRowKeyToggle,
    resolveMediaUrl,
    userAvatarErrors,
    setUserAvatarErrors,
    truncateUserName,
    handleEditUser,
    handleDeleteUser,
    billingPrefill,
    setBillingPrefill,
    showProductForm,
    setShowProductForm,
    productFormMode,
    setProductFormMode,
    editingProduct,
    setEditingProduct,
    handleProductSave,
    showApproveModal,
    setShowApproveModal,
    modalOrder,
    modalItems,
    modalLoading,
    confirmApprove,
    showExportDialog,
    exportFormat,
    setExportFormat,
    handleExportProducts,
    editingUser,
    setEditingUser,
    setShowUserForm,
    setIsCreatingUser,
    handleUserSave,
    showUserForm,
    isCreatingUser,
    handleCreateUser,
    bulkJob,
    handleCancelBulkJob,
    handleRetryFailedBulkJob,
    dismissBulkJob,
  };
};

export default useAdminPageController;
