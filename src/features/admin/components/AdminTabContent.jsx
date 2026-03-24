import { Suspense, lazy, useEffect, useState } from 'react';
import PopupWorkspaceNotice from '../../../shared/components/backoffice/PopupWorkspaceNotice';
import useBackofficePopupStatus from '../../../shared/hooks/useBackofficePopupStatus';
import { focusBackofficePopup } from '../../../shared/utils/backofficePopup';
import AdminSectionErrorBoundary from './AdminSectionErrorBoundary';
import { useAdminWorkspaceContext } from '../context/AdminPageContext';

const BillingTab = lazy(() => import('../../sales/billing/BillingTab'));
const BillsViewer = lazy(() => import('../../sales/billing/BillsViewer'));
const CreditAgingReport = lazy(() => import('../../credits/reports/CreditAgingReport'));
const CreditKhata = lazy(() => import('../../credits/khata/CreditKhata'));
const CustomerRequestsAdmin = lazy(() => import('../../customerRequests/CustomerRequestsAdmin'));
const DashboardSection = lazy(() => import('../sections/DashboardSection'));
const DailySalesSection = lazy(() => import('../sections/DailySalesSection'));
const DistributorInsights = lazy(() => import('../../insights/DistributorInsights'));
const DistributorManagement = lazy(() => import('../../distributors/DistributorManagement'));
const OfferManagement = lazy(() => import('../../marketing/OfferManagement'));
const OrdersSection = lazy(() => import('../sections/OrdersSection'));
const ProductInsights = lazy(() => import('../../insights/ProductInsights'));
const ProductsSection = lazy(() => import('../sections/ProductsSection'));
const PurchaseManagementPage = lazy(() => import('../../commerce/purchase/pages/PurchaseManagementPage'));
const StockLedgerHistory = lazy(() => import('../../inventory/StockLedgerHistory'));
const UsersSection = lazy(() => import('../sections/UsersSection'));
const CategoriesSection = lazy(() => import('../sections/CategoriesSection'));

const AdminTabFallback = ({ label }) => (
  <div className="admin-loading-state" role="status" aria-live="polite">
    <h2>Loading {label}...</h2>
    <p>Preparing the selected admin workspace.</p>
  </div>
);

const AdminTabContent = () => {
  const {
    activeTab,
    dashboardDensity,
    setDashboardDensity,
    isMobile,
    stats,
    activeProductsCount,
    inactiveProductsCount,
    lowStockProducts,
    products,
    visitorStats,
    userDirectorySummary,
    recentOrders,
    recentCustomers,
    handleTabChange,
    selectedDateKey,
    setDailySalesDate,
    loadDailySalesBills,
    dailySalesLoading,
    dailySalesError,
    dailySalesSummary,
    selectedSalesBills,
    handleAddProduct,
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
    billingShortcutRequest,
    setBillingShortcutRequest,
    purchaseShortcutRequest,
    setPurchaseShortcutRequest,
    user,
  } = useAdminWorkspaceContext();

  const billingPopupStatus = useBackofficePopupStatus('billing');
  const purchasePopupStatus = useBackofficePopupStatus('purchase');
  const [allowInlineBilling, setAllowInlineBilling] = useState(false);
  const [allowInlinePurchase, setAllowInlinePurchase] = useState(false);

  useEffect(() => {
    if (!billingPopupStatus.isOpen) {
      setAllowInlineBilling(false);
    }
  }, [billingPopupStatus.isOpen]);

  useEffect(() => {
    if (!purchasePopupStatus.isOpen) {
      setAllowInlinePurchase(false);
    }
  }, [purchasePopupStatus.isOpen]);

  let activePane = null;
  let loadingLabel = 'admin section';

  switch (activeTab) {
    case 'dashboard':
      loadingLabel = 'dashboard';
      activePane = (
        <DashboardSection
          dashboardDensity={dashboardDensity}
          setDashboardDensity={setDashboardDensity}
          isMobile={isMobile}
          stats={stats}
          pendingOrdersCount={Number(stats?.pendingOrders || 0)}
          activeProductsCount={activeProductsCount}
          inactiveProductsCount={inactiveProductsCount}
          lowStockProducts={lowStockProducts}
          products={products}
          totalCustomers={Number(userDirectorySummary?.customerCount || 0)}
          visitorStats={visitorStats}
          recentOrders={recentOrders}
          recentCustomers={recentCustomers}
          onTabChange={handleTabChange}
        />
      );
      break;
    case 'daily-sales':
      loadingLabel = 'daily sales';
      activePane = (
        <DailySalesSection
          selectedDateKey={selectedDateKey}
          onDateChange={setDailySalesDate}
          onRefresh={() => { void loadDailySalesBills({ silent: false, dateKey: selectedDateKey }); }}
          dailySalesLoading={dailySalesLoading}
          dailySalesError={dailySalesError}
          dailySalesSummary={dailySalesSummary}
          selectedSalesBills={selectedSalesBills}
        />
      );
      break;
    case 'products':
      loadingLabel = 'products';
      activePane = (
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
        />
      );
      break;
    case 'orders':
      loadingLabel = 'orders';
      activePane = (
        <OrdersSection
          isMobile={isMobile}
          ordersSearchQuery={ordersSearchQuery}
          setOrdersSearchQuery={setOrdersSearchQuery}
          visibleOrders={visibleOrders}
          orders={orders}
          ordersPage={ordersPage}
          setOrdersPage={setOrdersPage}
          ordersTotal={ordersTotal}
          ordersLoading={ordersLoading}
          openApproveModal={openApproveModal}
          handleProceedToBilling={handleProceedToBilling}
          proceedBillingOrderId={proceedBillingOrderId}
          handleApplyPendingFulfillment={handleApplyPendingFulfillment}
        />
      );
      break;
    case 'categories':
      loadingLabel = 'categories';
      activePane = <CategoriesSection />;
      break;
    case 'users':
      loadingLabel = 'users';
      activePane = (
        <UsersSection
          handleAddUser={handleAddUser}
          usersSearchQuery={usersSearchQuery}
          setUsersSearchQuery={setUsersSearchQuery}
          filteredUsersCount={filteredUsersCount}
          users={users}
          filteredUsers={filteredUsers}
          adminUsers={adminUsers}
          customerUsers={customerUsers}
          usersPage={usersPage}
          setUsersPage={setUsersPage}
          usersTotal={usersTotal}
          usersLoading={usersLoading}
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
      );
      break;
    case 'billing':
      loadingLabel = 'billing';
      activePane = billingPopupStatus.isOpen && !allowInlineBilling ? (
        <PopupWorkspaceNotice
          title="Billing is already open in a popup"
          message="To avoid duplicate billing fetches and conflicting drafts, the popup workspace stays primary while it is open."
          onFocusPopup={() => focusBackofficePopup('billing')}
          onContinueInline={() => setAllowInlineBilling(true)}
        />
      ) : (
        <BillingTab
          initialPrefill={billingPrefill}
          onPrefillApplied={() => setBillingPrefill(null)}
          shortcutFocusRequest={billingShortcutRequest}
          onShortcutFocusHandled={() => setBillingShortcutRequest(0)}
        />
      );
      break;
    case 'view-bills':
      loadingLabel = 'bills history';
      activePane = <BillsViewer user={user} />;
      break;
    case 'distributors':
      loadingLabel = 'distributors';
      activePane = <DistributorManagement user={user} />;
      break;
    case 'purchases':
      loadingLabel = 'purchase management';
      activePane = purchasePopupStatus.isOpen && !allowInlinePurchase ? (
        <PopupWorkspaceNotice
          title="Purchase entry is already open in a popup"
          message="The popup workspace stays primary while it is open so the PO draft and heavy purchase data do not mount twice by default."
          onFocusPopup={() => focusBackofficePopup('purchase')}
          onContinueInline={() => setAllowInlinePurchase(true)}
        />
      ) : (
        <PurchaseManagementPage
          user={user}
          shortcutOpenOrderRequest={purchaseShortcutRequest}
          onShortcutOpenOrderHandled={() => setPurchaseShortcutRequest(0)}
        />
      );
      break;
    case 'stock-ledger':
      loadingLabel = 'stock history';
      activePane = <StockLedgerHistory user={user} />;
      break;
    case 'product-insights':
      loadingLabel = 'product insights';
      activePane = <ProductInsights />;
      break;
    case 'distributor-insights':
      loadingLabel = 'distributor insights';
      activePane = <DistributorInsights />;
      break;
    case 'credit-aging':
      loadingLabel = 'credit aging';
      activePane = <CreditAgingReport user={user} />;
      break;
    case 'credit-khata':
      loadingLabel = 'credit khata';
      activePane = <CreditKhata user={user} />;
      break;
    case 'customer-requests':
      loadingLabel = 'customer requests';
      activePane = <CustomerRequestsAdmin />;
      break;
    case 'offers':
      loadingLabel = 'offers';
      activePane = <OfferManagement />;
      break;
    default:
      loadingLabel = 'dashboard';
      activePane = (
        <DashboardSection
          dashboardDensity={dashboardDensity}
          setDashboardDensity={setDashboardDensity}
          isMobile={isMobile}
          stats={stats}
          pendingOrdersCount={Number(stats?.pendingOrders || 0)}
          activeProductsCount={activeProductsCount}
          inactiveProductsCount={inactiveProductsCount}
          lowStockProducts={lowStockProducts}
          products={products}
          totalCustomers={Number(userDirectorySummary?.customerCount || 0)}
          visitorStats={visitorStats}
          recentOrders={recentOrders}
          recentCustomers={recentCustomers}
          onTabChange={handleTabChange}
        />
      );
  }

  return (
    <AdminSectionErrorBoundary resetKey={activeTab} sectionLabel={loadingLabel}>
      <Suspense fallback={<AdminTabFallback label={loadingLabel} />}>
        {activePane}
      </Suspense>
    </AdminSectionErrorBoundary>
  );
};

export default AdminTabContent;
