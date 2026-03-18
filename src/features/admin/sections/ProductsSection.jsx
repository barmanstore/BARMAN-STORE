import { CheckCircle2, Download, Upload, X } from 'lucide-react';
import AdminPageHeader from '../components/AdminPageHeader';
import ProductsGridPanel from './products/ProductsGridPanel';
import ProductsImportCard from './products/ProductsImportCard';
import ProductsTablePanel from './products/ProductsTablePanel';

function ProductsSection({
  isMobile,
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
}) {
  return (
    <div className="products-management">
      <AdminPageHeader
        className="section-header"
        title="Products Management"
        actions={(
          <div className="products-actions">
            <div className="products-actions-right">
              {!isMobile && (
                <>
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
                    className={`products-view-switch ${effectiveProductViewMode === 'grid' ? 'is-grid' : 'is-table'}`}
                    role="group"
                    aria-label="Product view mode"
                  >
                    <button
                      type="button"
                      className={`products-view-switch-option table ${effectiveProductViewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setProductViewMode('table')}
                      aria-pressed={effectiveProductViewMode === 'table'}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      className={`products-view-switch-option grid ${effectiveProductViewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setProductViewMode('grid')}
                      aria-pressed={effectiveProductViewMode === 'grid'}
                    >
                      Grid
                    </button>
                    <span className="products-view-switch-knob" aria-hidden="true">
                      {effectiveProductViewMode === 'grid' ? <CheckCircle2 size={14} /> : <X size={14} />}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      />
      <ProductsImportCard
        showProductsImportCard={showProductsImportCard}
        importPreviewData={importPreviewData}
        importFile={importFile}
        importAllowIdenticalRows={importAllowIdenticalRows}
        setImportAllowIdenticalRows={setImportAllowIdenticalRows}
        importFileInputRef={importFileInputRef}
        importBusy={importBusy}
        handleFileSelected={handleFileSelected}
      />
      <div className="products-common-toolbar">
        <input
          id="products-search"
          name="products_search"
          type="text"
          className="products-table-search products-common-search"
          placeholder="Search by name, SKU, barcode, category, brand..."
          value={productTableSearch}
          onChange={(e) => setProductTableSearch(e.target.value)}
        />
        <span className="products-table-count">Rows: {visibleProducts.length}</span>
      </div>
      {effectiveProductViewMode === 'table' ? (
        <ProductsTablePanel
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
          getCategoryPath={getCategoryPath}
          getBrandPath={getBrandPath}
        />
      ) : (
        <ProductsGridPanel
          showQuickAdd={showQuickAdd}
          setShowQuickAdd={setShowQuickAdd}
          quickAddForm={quickAddForm}
          setQuickAddForm={setQuickAddForm}
          resetQuickAdd={resetQuickAdd}
          quickSaving={quickSaving}
          handleQuickAddSave={handleQuickAddSave}
          visibleProducts={visibleProducts}
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
          handleEditProduct={handleEditProduct}
          productEditLoadingId={productEditLoadingId}
          handleDeleteProduct={handleDeleteProduct}
          productCategories={productCategories}
        />
      )}
    </div>
  );
}

export default ProductsSection;

