import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { statsApi, productsApi, ordersApi, usersApi, adminApi, billingApi, resolveMediaUrl } from '../api/index.js';
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
import buildAdminPageProps from '../utils/buildAdminPageProps';
import useAdminProductHandlers from '../hooks/useAdminProductHandlers';
import useAdminQuickProductActions from '../hooks/useAdminQuickProductActions';
import useAdminState from '../hooks/useAdminState';
import useAdminComputedData from '../hooks/useAdminComputedData';
import useAdminProductTable from '../hooks/useAdminProductTable';
import useAdminImportExport from '../hooks/useAdminImportExport';
import useAdminDataLoaders from '../hooks/useAdminDataLoaders';
import useAdminOrderActions from '../hooks/useAdminOrderActions';
import useAdminUserActions from '../hooks/useAdminUserActions';
import useAdminNavigation from '../hooks/useAdminNavigation';
import useAdminEffects from '../hooks/useAdminEffects';
import AdminPageLayout from '../components/AdminPageLayout';
import './AdminPage.css';
import './AdminStandard.css';


function AdminPage({ user }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const {
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
  } = useAdminState({
    toLocalDateKey,
    PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
    PRODUCT_TABLE_ALL_COLUMN_KEYS,
    SIDEBAR_SECTIONS,
  });

  const showNotification = useCallback((message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, [setNotification]);

  const closeNotification = useCallback(() => {
    setNotification(null);
  }, [setNotification]);

  const {
    refreshAdminData,
    loadOrdersPage,
    loadUsersPage,
    loadDailySalesBills,
    fetchData,
  } = useAdminDataLoaders({
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
  });
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
    searchParams,
    setSearchParams,
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

  useLockBodyScroll(isMobileSidebarOpen);

  useAdminEffects({
    user,
    navigate,
    fetchData,
    orders,
    activeTab,
    ordersPage,
    setOrdersPage,
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
    handleProductSave,
  } = useAdminProductHandlers({
    productsApi,
    statsApi,
    setProducts,
    setStats,
    showNotification,
    setEditingProduct,
    setShowProductForm,
    setProductEditLoadingId,
    editingProduct,
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
    selectedSalesBills,
    dailySalesSummary,
  } = useAdminComputedData({
    products,
    users,
    orders,
    recentOrdersPreview,
    recentCustomersPreview,
    bills,
    dailySalesDate,
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
    handleProductSave,
    setShowExportDialog,
    exportFormat,
  });
  const {
    openApproveModal,
    confirmApprove,
    handleApplyPendingFulfillment,
    handleProceedToBilling,
  } = useAdminOrderActions({
    ordersApi,
    productsApi,
    user,
    setModalLoading,
    setModalOrder,
    setModalItems,
    setShowApproveModal,
    modalOrder,
    showNotification,
    refreshAdminData,
    setProceedBillingOrderId,
    setBillingPrefill,
    handleTabChange,
  });

  const effectiveProductViewMode = isMobile ? 'grid' : productViewMode;

  const showProductsImportCard = !isMobile && Boolean(
    importPreviewData?.batch_id
    || importPreviewData?.summary
    || (Array.isArray(importPreviewData?.preview) && importPreviewData.preview.length > 0)
  );

  const pageProps = buildAdminPageProps({
    core: {
      user, loading, notification, closeNotification, isMobileSidebarOpen, setIsMobileSidebarOpen,
      desktopPanelCollapsed, setDesktopPanelCollapsed, dashboardDensity, setDashboardDensity,
      isMobile, stats, visitorStats, userDirectorySummary,
    },
    navigation: {
      SIDEBAR_SECTIONS, desktopActiveGroup, handleDesktopGroupSelect, desktopCurrentSection,
      activeTab, handleTabChange, mobileSidebarSections, expandedGroups, toggleSidebarGroup,
    },
    stats: {
      activeProductsCount, inactiveProductsCount, lowStockProducts,
      recentOrders, recentCustomers,
    },
    billing: {
      selectedDateKey, setDailySalesDate, loadDailySalesBills, dailySalesLoading,
      dailySalesError, dailySalesSummary, selectedSalesBills, billingPrefill, setBillingPrefill,
    },
    products: {
      products, handleAddProduct, setShowExportDialog, importBusy, handleStartImport, handleConfirmImport,
      showProductsImportCard, importPreviewData, importFile, importAllowIdenticalRows, setImportAllowIdenticalRows,
      effectiveProductViewMode, setProductViewMode, importFileInputRef, handleFileSelected,
      productTableSearch, setProductTableSearch, visibleProducts, productTableCategoryFilter,
      setProductTableCategoryFilter, productCategories, productColumnPickerRef, productTableVisibleColumns,
      productTableAllColumnsSelected, toggleSelectAllProductTableColumns, isProductTableColumnVisible,
      toggleProductTableColumn, productTableStatusFilter, setProductTableStatusFilter,
      productTableLowStockOnly, setProductTableLowStockOnly, selectedVisibleProduct, tableEditId,
      handleTableEditSave, tableEditSaving, cancelTableEdit, openTableEdit, handleEditProduct,
      productEditLoadingId, handleDeleteProduct, handlePermanentDeleteProduct, productTableCalculatedMinWidth,
      toggleProductTableSort, getSortIndicator, tableEditForm, handleTableCellClick, setTableEditFieldRef,
      handleTableEditChange, setSelectedProductId, selectedProductId, showQuickAdd, setShowQuickAdd,
      quickAddForm, setQuickAddForm, resetQuickAdd, quickSaving, handleQuickAddSave, quickEditId,
      quickEditForm, setQuickEditForm, cancelQuickEdit, handleQuickEditSave, startQuickEdit,
      getProductImageSrc, getProductFallbackImage, getCategoryPath, getBrandPath,
    },
    orders: {
      ordersSearchQuery, setOrdersSearchQuery, visibleOrders, orders, openApproveModal,
      handleProceedToBilling, proceedBillingOrderId, handleApplyPendingFulfillment,
      ordersPage, setOrdersPage, ordersTotal, ordersLoading,
    },
    users: {
      handleAddUser,
      usersSearchQuery, setUsersSearchQuery, filteredUsersCount, users, filteredUsers, adminUsers, customerUsers,
      expandedUsersMap, toggleUserCompactRow, handleCompactRowKeyToggle, resolveMediaUrl,
      userAvatarErrors, setUserAvatarErrors, truncateUserName, handleEditUser, handleDeleteUser,
      editingUser, setEditingUser, setShowUserForm, setIsCreatingUser, handleUserSave, showUserForm,
      isCreatingUser, handleCreateUser,
      usersPage, setUsersPage, usersTotal, usersLoading, userDirectorySummary,
    },
    modals: {
      showProductForm, setShowProductForm, editingProduct, setEditingProduct, handleProductSave,
      showApproveModal, setShowApproveModal, modalOrder, modalItems, modalLoading, confirmApprove, showExportDialog,
      exportFormat, setExportFormat, handleExportProducts, showCategoryManagement, setShowCategoryManagement,
    },
  });

  return <AdminPageLayout {...pageProps} />;
}

export default AdminPage;












