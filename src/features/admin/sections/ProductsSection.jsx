import { CheckCircle2, Download, Edit, FolderOpen, Plus, Trash2, Upload, X } from 'lucide-react';
import AdminPageHeader from '../../../components/admin/AdminPageHeader';
import {
  PRODUCT_TABLE_ALL_COLUMN_KEYS,
  PRODUCT_TABLE_COLUMN_OPTIONS,
} from '../config/productTableConfig';
import { asNumber } from '../utils/adminHelpers';

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
  formatCurrencyColored,
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
            <input
              id="import-file-input"
              name="import_file"
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
                                  id={`import-allow-identical-${row.row}`}
                                  name={`import_allow_identical_${row.row}`}
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
              <>
                <div className="products-table-toolbar">
                  <select
                    id="products-table-filter-category"
                    name="products_table_filter_category"
                    className="products-table-filter products-table-filter-category"
                    value={productTableCategoryFilter}
                    onChange={(e) => setProductTableCategoryFilter(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {productCategories.map((category) => (
                      <option key={`filter-${category}`} value={category}>{category}</option>
                    ))}
                  </select>
                  <details className="products-column-picker" ref={productColumnPickerRef}>
                    <summary>Columns ({productTableVisibleColumns.length}/{PRODUCT_TABLE_ALL_COLUMN_KEYS.length})</summary>
                    <div className="products-column-picker-panel">
                      <label className="products-column-option products-column-option-all">
                        <input
                          id="product-table-all-columns"
                          name="all_columns"
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
                              id={`product-table-column-${column.key}`}
                              name={`column_${column.key}`}
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
                    id="products-table-filter-status"
                    name="products_table_filter_status"
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
                      id="product-table-low-stock"
                      name="low_stock_only"
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
                        {isProductTableColumnVisible('purchase_pack_size') ? <th className="sortable col-pack" onClick={() => toggleProductTableSort('purchase_pack_size')}>Pack Size{getSortIndicator('purchase_pack_size')}</th> : null}
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
                                  <input id={`table-edit-name-${product.id}`} ref={setTableEditFieldRef('name')} className="table-edit-input" name="table_edit_name" value={tableEditForm.name} onChange={(e) => handleTableEditChange('name', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-name" title={product.name || '-'}>{product.name || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('brand') ? (
                              <td className={cellClassName('col-brand')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'brand') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-brand-${product.id}`} ref={setTableEditFieldRef('brand')} className="table-edit-input" name="table_edit_brand" value={tableEditForm.brand} onChange={(e) => handleTableEditChange('brand', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-brand" title={getBrandPath(product) || '-'}>{getBrandPath(product) || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('category') ? (
                              <td className={cellClassName('col-category')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'category') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-category-${product.id}`} ref={setTableEditFieldRef('category')} className="table-edit-input" name="table_edit_category" list="admin-product-category-list" value={tableEditForm.category} onChange={(e) => handleTableEditChange('category', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-category" title={getCategoryPath(product) || '-'}>{getCategoryPath(product) || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('price') ? (
                              <td className={cellClassName('col-price')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'price') : undefined}>
                                {isEditingRow ? <input id={`table-edit-price-${product.id}`} ref={setTableEditFieldRef('price')} className="table-edit-input" name="table_edit_price" type="number" min="0" step="0.01" value={tableEditForm.price} onChange={(e) => handleTableEditChange('price', e.target.value)} /> : formatCurrencyColored(product.price)}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('mrp') ? (
                              <td className={cellClassName('col-mrp')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'mrp') : undefined}>
                                {isEditingRow ? <input id={`table-edit-mrp-${product.id}`} ref={setTableEditFieldRef('mrp')} className="table-edit-input" name="table_edit_mrp" type="number" min="0" step="0.01" value={tableEditForm.mrp} onChange={(e) => handleTableEditChange('mrp', e.target.value)} /> : formatCurrencyColored(product.mrp)}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('stock') ? (
                              <td className={cellClassName('col-stock')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'stock') : undefined}>
                                {isEditingRow ? <input id={`table-edit-stock-${product.id}`} ref={setTableEditFieldRef('stock')} className="table-edit-input" name="table_edit_stock" type="number" min="0" step="1" value={tableEditForm.stock} onChange={(e) => handleTableEditChange('stock', e.target.value)} /> : <span className={product.stock < 10 ? 'low-stock' : ''}>{product.stock}</span>}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('sku') ? (
                              <td className={cellClassName('col-sku')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'sku') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-sku-${product.id}`} ref={setTableEditFieldRef('sku')} className="table-edit-input" name="table_edit_sku" value={tableEditForm.sku} onChange={(e) => handleTableEditChange('sku', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-code" title={product.sku || '-'}>{product.sku || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('barcode') ? (
                              <td className={cellClassName('col-barcode')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'barcode') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-barcode-${product.id}`} ref={setTableEditFieldRef('barcode')} className="table-edit-input" name="table_edit_barcode" value={tableEditForm.barcode} onChange={(e) => handleTableEditChange('barcode', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate cell-code" title={product.barcode || '-'}>{product.barcode || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('status') ? (
                              <td className={cellClassName('col-status')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'is_active') : undefined}>
                                {isEditingRow ? (
                                  <select id={`table-edit-is-active-${product.id}`} ref={setTableEditFieldRef('is_active')} className="table-edit-input" name="table_edit_is_active" value={tableEditForm.is_active ? '1' : '0'} onChange={(e) => handleTableEditChange('is_active', e.target.value === '1')}>
                                    <option value="1">Active</option>
                                    <option value="0">Inactive</option>
                                  </select>
                                ) : (Number(product.is_active ?? 1) === 1 ? 'Active' : 'Inactive')}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('description') ? (
                              <td className={cellClassName('col-description')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'description') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-description-${product.id}`} ref={setTableEditFieldRef('description')} className="table-edit-input" name="table_edit_description" value={tableEditForm.description} onChange={(e) => handleTableEditChange('description', e.target.value)} />
                                ) : (
                                  <span className="description-snippet" title={product.description || '-'}>{product.description || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('content') ? (
                              <td className={cellClassName('col-content')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'content') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-content-${product.id}`} ref={setTableEditFieldRef('content')} className="table-edit-input" name="table_edit_content" value={tableEditForm.content} onChange={(e) => handleTableEditChange('content', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate" title={product.content || '-'}>{product.content || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('purchase_pack_size') ? (
                              <td className={cellClassName('col-pack')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'purchase_pack_size') : undefined}>
                                {isEditingRow ? (
                                  <input
                                    id={`table-edit-pack-size-${product.id}`}
                                    ref={setTableEditFieldRef('purchase_pack_size')}
                                    className="table-edit-input"
                                    name="table_edit_purchase_pack_size"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={tableEditForm.purchase_pack_size}
                                    onChange={(e) => handleTableEditChange('purchase_pack_size', e.target.value)}
                                  />
                                ) : (
                                  <span className="cell-truncate" title={product.purchase_pack_size ?? '-'}>{product.purchase_pack_size ?? '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('color') ? (
                              <td className={cellClassName('col-color')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'color') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-color-${product.id}`} ref={setTableEditFieldRef('color')} className="table-edit-input" name="table_edit_color" value={tableEditForm.color} onChange={(e) => handleTableEditChange('color', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate" title={product.color || '-'}>{product.color || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('uom') ? (
                              <td className={cellClassName('col-uom')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'uom') : undefined}>
                                {isEditingRow ? (
                                  <input id={`table-edit-uom-${product.id}`} ref={setTableEditFieldRef('uom')} className="table-edit-input" name="table_edit_uom" value={tableEditForm.uom} onChange={(e) => handleTableEditChange('uom', e.target.value)} />
                                ) : (
                                  <span className="cell-truncate" title={product.uom || '-'}>{product.uom || '-'}</span>
                                )}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('expiry') ? (
                              <td className={cellClassName('col-expiry')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'expiry_date') : undefined}>
                                {isEditingRow ? <input id={`table-edit-expiry-date-${product.id}`} ref={setTableEditFieldRef('expiry_date')} className="table-edit-input" name="table_edit_expiry_date" type="date" value={tableEditForm.expiry_date} onChange={(e) => handleTableEditChange('expiry_date', e.target.value)} /> : (product.expiry_date ? new Date(product.expiry_date).toLocaleDateString() : '-')}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('discount') ? (
                              <td className={cellClassName('col-discount')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'defaultDiscount') : undefined}>
                                {isEditingRow ? <input id={`table-edit-discount-${product.id}`} ref={setTableEditFieldRef('defaultDiscount')} className="table-edit-input" name="table_edit_default_discount" type="number" min="0" step="0.01" value={tableEditForm.defaultDiscount} onChange={(e) => handleTableEditChange('defaultDiscount', e.target.value)} /> : asNumber(product.defaultDiscount, 0)}
                              </td>
                            ) : null}
                            {isProductTableColumnVisible('discountType') ? (
                              <td className={cellClassName('col-discountType')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'discountType') : undefined}>
                                {isEditingRow ? (
                                  <select id={`table-edit-discount-type-${product.id}`} ref={setTableEditFieldRef('discountType')} className="table-edit-input" name="table_edit_discount_type" value={tableEditForm.discountType} onChange={(e) => handleTableEditChange('discountType', e.target.value)}>
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
                                {isEditingRow ? <input id={`table-edit-image-${product.id}`} ref={setTableEditFieldRef('image')} className="table-edit-input" name="table_edit_image" value={tableEditForm.image} onChange={(e) => handleTableEditChange('image', e.target.value)} /> : <span className="src-cell" title={product.image || '-'}>{product.image || '-'}</span>}
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
                        id="quick-add-name"
                        name="name"
                        type="text"
                        placeholder="Product name"
                        value={quickAddForm.name}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <input
                        id="quick-add-category"
                        name="category"
                        type="text"
                        list="admin-product-category-list"
                        placeholder="Category"
                        value={quickAddForm.category}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                      />
                      <input
                        id="quick-add-price"
                        name="price"
                        type="number"
                        placeholder="Price"
                        min="0"
                        step="0.01"
                        value={quickAddForm.price}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, price: e.target.value }))}
                      />
                      <input
                        id="quick-add-stock"
                        name="stock"
                        type="number"
                        placeholder="Stock"
                        min="0"
                        step="1"
                        value={quickAddForm.stock}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, stock: e.target.value }))}
                      />
                      <input
                        id="quick-add-image"
                        name="image"
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
                            id={`quick-edit-name-${product.id}`}
                            name="name"
                            type="text"
                            placeholder="Product name"
                            value={quickEditForm.name}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, name: e.target.value }))}
                          />
                          <input
                            id={`quick-edit-category-${product.id}`}
                            name="category"
                            type="text"
                            list="admin-product-category-list"
                            placeholder="Category"
                            value={quickEditForm.category}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, category: e.target.value }))}
                          />
                          <input
                            id={`quick-edit-price-${product.id}`}
                            name="price"
                            type="number"
                            placeholder="Price"
                            min="0"
                            step="0.01"
                            value={quickEditForm.price}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, price: e.target.value }))}
                          />
                          <input
                            id={`quick-edit-stock-${product.id}`}
                            name="stock"
                            type="number"
                            placeholder="Stock"
                            min="0"
                            step="1"
                            value={quickEditForm.stock}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, stock: e.target.value }))}
                          />
                          <input
                            id={`quick-edit-image-${product.id}`}
                            name="image"
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
  );
}

export default ProductsSection;
