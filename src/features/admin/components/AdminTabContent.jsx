import BillingTab from '../../sales/billing/BillingTab';
import BillsViewer from '../../sales/billing/BillsViewer';
import CreditAgingReport from '../../credits/reports/CreditAgingReport';
import CreditKhata from '../../credits/khata/CreditKhata';
import CustomerRequestsAdmin from '../../customerRequests/CustomerRequestsAdmin';
import DashboardSection from '../sections/DashboardSection';
import DailySalesSection from '../sections/DailySalesSection';
import DistributorInsights from '../../insights/DistributorInsights';
import DistributorManagement from '../../distributors/DistributorManagement';
import OfferManagement from '../../marketing/OfferManagement';
import OrdersSection from '../sections/OrdersSection';
import ProductInsights from '../../insights/ProductInsights';
import ProductsSection from '../sections/ProductsSection';
import PurchaseManagementPage from '../../commerce/purchase/pages/PurchaseManagementPage';
import StockLedgerHistory from '../../inventory/StockLedgerHistory';
import UsersSection from '../sections/UsersSection';
import CategoriesSection from '../sections/CategoriesSection';

const AdminTabContent = ({
  activeTab,
  dashboardDensity,
  setDashboardDensity,
  isMobile,
  stats,
  pendingOrdersList,
  activeProductsCount,
  inactiveProductsCount,
  lowStockProducts,
  products,
  customerUsers,
  visitorStats,
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
  openApproveModal,
  handleProceedToBilling,
  proceedBillingOrderId,
  handleApplyPendingFulfillment,
  setShowCategoryManagement,
  usersSearchQuery,
  setUsersSearchQuery,
  filteredUsersCount,
  handleAddUser,
  users,
  filteredUsers,
  adminUsers,
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
  user,
}) => (
  <>
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
      <PurchaseManagementPage user={user} />
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
  </>
);

export default AdminTabContent;
