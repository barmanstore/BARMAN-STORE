import { RotateCcw } from 'lucide-react';
import SignedCurrency from '../../../../shared/components/SignedCurrency';
import {
  PRODUCT_TABLE_ALL_COLUMN_KEYS,
  PRODUCT_TABLE_COLUMN_OPTIONS,
} from '../../config/productTableConfig';
import { asNumber } from '../../utils/adminHelpers';

const ProductsTablePanel = ({
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
  tableEditId,
  productTableCalculatedMinWidth,
  toggleProductTableSort,
  getSortIndicator,
  tableEditForm,
  handleTableCellClick,
  setTableEditFieldRef,
  handleTableEditChange,
  tableUndoAction,
  handleUndoLastTableAction,
  tableUndoSaving,
  handleTableEditKeyDown,
  selectedProductIds,
  toggleProductSelection,
  getCategoryPath,
  getBrandPath,
}) => (
  <>
    {tableUndoAction ? (
      <div className="products-table-undo-bar">
        <div className="products-table-undo-copy">
          <span className="products-table-undo-pill">Last action</span>
          <span className="products-table-undo-text" title={String(tableUndoAction.productName || 'product')}>
            {tableUndoAction.kind === 'edit'
              ? `Updated ${tableUndoAction.productName || 'product'}`
              : tableUndoAction.kind === 'delete'
                ? `Marked ${tableUndoAction.productName || 'product'} inactive`
                : `Permanently deleted ${tableUndoAction.productName || 'product'}`}
          </span>
        </div>
        <button
          type="button"
          className="products-table-undo-btn"
          onClick={handleUndoLastTableAction}
          disabled={tableUndoSaving}
        >
          <RotateCcw size={15} />
          {tableUndoSaving ? 'Restoring...' : tableUndoAction.undoLabel || 'Undo'}
        </button>
      </div>
    ) : null}
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
    <div className="products-table">
      <table style={{ minWidth: `${productTableCalculatedMinWidth}px` }}>
        <thead>
          <tr>
            <th className="col-pick">Select</th>
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
          {visibleProducts.map((product) => {
            const isEditingRow = tableEditId === product.id;
            const isRowSelected = selectedProductIds.includes(Number(product.id));
            const cellClassName = (base = '') => [base, !isEditingRow ? 'cell-editable' : ''].filter(Boolean).join(' ');
            return (
              <tr key={product.id} className={isRowSelected ? 'product-row-selected' : ''}>
                <td className="col-pick">
                  <button
                    type="button"
                    className={`row-pick-btn ${isRowSelected ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProductSelection(product.id, { shiftKey: e.shiftKey });
                    }}
                    title={isRowSelected ? 'Deselect product' : 'Select product'}
                    aria-label={`${isRowSelected ? 'Deselect' : 'Select'} ${product.name || 'product'}`}
                    aria-pressed={isRowSelected}
                  />
                </td>
                {isProductTableColumnVisible('name') ? (
                  <td className={cellClassName('col-name')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'name') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-name-${product.id}`} ref={setTableEditFieldRef('name')} className="table-edit-input" name="table_edit_name" value={tableEditForm.name} onChange={(e) => handleTableEditChange('name', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'name')} />
                    ) : (
                      <span className="cell-truncate cell-name" title={product.name || '-'}>{product.name || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('brand') ? (
                  <td className={cellClassName('col-brand')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'brand') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-brand-${product.id}`} ref={setTableEditFieldRef('brand')} className="table-edit-input" name="table_edit_brand" value={tableEditForm.brand} onChange={(e) => handleTableEditChange('brand', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'brand')} />
                    ) : (
                      <span className="cell-truncate cell-brand" title={getBrandPath(product) || '-'}>{getBrandPath(product) || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('category') ? (
                  <td className={cellClassName('col-category')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'category') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-category-${product.id}`} ref={setTableEditFieldRef('category')} className="table-edit-input" name="table_edit_category" list="admin-product-category-list" value={tableEditForm.category} onChange={(e) => handleTableEditChange('category', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'category')} />
                    ) : (
                      <span className="cell-truncate cell-category" title={getCategoryPath(product) || '-'}>{getCategoryPath(product) || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('price') ? (
                  <td className={cellClassName('col-price')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'price') : undefined}>
                    {isEditingRow ? <input id={`table-edit-price-${product.id}`} ref={setTableEditFieldRef('price')} className="table-edit-input" name="table_edit_price" type="number" min="0" step="0.01" value={tableEditForm.price} onChange={(e) => handleTableEditChange('price', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'price')} /> : <SignedCurrency amount={product.price} />}
                  </td>
                ) : null}
                {isProductTableColumnVisible('mrp') ? (
                  <td className={cellClassName('col-mrp')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'mrp') : undefined}>
                    {isEditingRow ? <input id={`table-edit-mrp-${product.id}`} ref={setTableEditFieldRef('mrp')} className="table-edit-input" name="table_edit_mrp" type="number" min="0" step="0.01" value={tableEditForm.mrp} onChange={(e) => handleTableEditChange('mrp', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'mrp')} /> : <SignedCurrency amount={product.mrp} />}
                  </td>
                ) : null}
                {isProductTableColumnVisible('stock') ? (
                  <td className={cellClassName('col-stock')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'stock') : undefined}>
                    {isEditingRow ? <input id={`table-edit-stock-${product.id}`} ref={setTableEditFieldRef('stock')} className="table-edit-input" name="table_edit_stock" type="number" min="0" step="1" value={tableEditForm.stock} onChange={(e) => handleTableEditChange('stock', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'stock')} /> : <span className={product.stock < 10 ? 'low-stock' : ''}>{product.stock}</span>}
                  </td>
                ) : null}
                {isProductTableColumnVisible('sku') ? (
                  <td className={cellClassName('col-sku')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'sku') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-sku-${product.id}`} ref={setTableEditFieldRef('sku')} className="table-edit-input" name="table_edit_sku" value={tableEditForm.sku} onChange={(e) => handleTableEditChange('sku', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'sku')} />
                    ) : (
                      <span className="cell-truncate cell-code" title={product.sku || '-'}>{product.sku || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('barcode') ? (
                  <td className={cellClassName('col-barcode')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'barcode') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-barcode-${product.id}`} ref={setTableEditFieldRef('barcode')} className="table-edit-input" name="table_edit_barcode" value={tableEditForm.barcode} onChange={(e) => handleTableEditChange('barcode', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'barcode')} />
                    ) : (
                      <span className="cell-truncate cell-code" title={product.barcode || '-'}>{product.barcode || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('status') ? (
                  <td className={cellClassName('col-status')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'is_active') : undefined}>
                    {isEditingRow ? (
                      <select id={`table-edit-is-active-${product.id}`} ref={setTableEditFieldRef('is_active')} className="table-edit-input" name="table_edit_is_active" value={tableEditForm.is_active ? '1' : '0'} onChange={(e) => handleTableEditChange('is_active', e.target.value === '1')} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'is_active')}>
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </select>
                    ) : (Number(product.is_active ?? 1) === 1 ? 'Active' : 'Inactive')}
                  </td>
                ) : null}
                {isProductTableColumnVisible('description') ? (
                  <td className={cellClassName('col-description')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'description') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-description-${product.id}`} ref={setTableEditFieldRef('description')} className="table-edit-input" name="table_edit_description" value={tableEditForm.description} onChange={(e) => handleTableEditChange('description', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'description')} />
                    ) : (
                      <span className="description-snippet" title={product.description || '-'}>{product.description || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('content') ? (
                  <td className={cellClassName('col-content')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'content') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-content-${product.id}`} ref={setTableEditFieldRef('content')} className="table-edit-input" name="table_edit_content" value={tableEditForm.content} onChange={(e) => handleTableEditChange('content', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'content')} />
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
                        onKeyDown={(e) => handleTableEditKeyDown(e, product, 'purchase_pack_size')}
                      />
                    ) : (
                      <span className="cell-truncate" title={product.purchase_pack_size ?? '-'}>{product.purchase_pack_size ?? '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('color') ? (
                  <td className={cellClassName('col-color')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'color') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-color-${product.id}`} ref={setTableEditFieldRef('color')} className="table-edit-input" name="table_edit_color" value={tableEditForm.color} onChange={(e) => handleTableEditChange('color', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'color')} />
                    ) : (
                      <span className="cell-truncate" title={product.color || '-'}>{product.color || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('uom') ? (
                  <td className={cellClassName('col-uom')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'uom') : undefined}>
                    {isEditingRow ? (
                      <input id={`table-edit-uom-${product.id}`} ref={setTableEditFieldRef('uom')} className="table-edit-input" name="table_edit_uom" value={tableEditForm.uom} onChange={(e) => handleTableEditChange('uom', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'uom')} />
                    ) : (
                      <span className="cell-truncate" title={product.uom || '-'}>{product.uom || '-'}</span>
                    )}
                  </td>
                ) : null}
                {isProductTableColumnVisible('expiry') ? (
                  <td className={cellClassName('col-expiry')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'expiry_date') : undefined}>
                    {isEditingRow ? <input id={`table-edit-expiry-date-${product.id}`} ref={setTableEditFieldRef('expiry_date')} className="table-edit-input" name="table_edit_expiry_date" type="date" value={tableEditForm.expiry_date} onChange={(e) => handleTableEditChange('expiry_date', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'expiry_date')} /> : (product.expiry_date ? new Date(product.expiry_date).toLocaleDateString() : '-')}
                  </td>
                ) : null}
                {isProductTableColumnVisible('discount') ? (
                  <td className={cellClassName('col-discount')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'defaultDiscount') : undefined}>
                    {isEditingRow ? <input id={`table-edit-discount-${product.id}`} ref={setTableEditFieldRef('defaultDiscount')} className="table-edit-input" name="table_edit_default_discount" type="number" min="0" step="0.01" value={tableEditForm.defaultDiscount} onChange={(e) => handleTableEditChange('defaultDiscount', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'defaultDiscount')} /> : asNumber(product.defaultDiscount, 0)}
                  </td>
                ) : null}
                {isProductTableColumnVisible('discountType') ? (
                  <td className={cellClassName('col-discountType')} onClick={!isEditingRow ? () => handleTableCellClick(product, 'discountType') : undefined}>
                    {isEditingRow ? (
                      <select id={`table-edit-discount-type-${product.id}`} ref={setTableEditFieldRef('discountType')} className="table-edit-input" name="table_edit_discount_type" value={tableEditForm.discountType} onChange={(e) => handleTableEditChange('discountType', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'discountType')}>
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
                    {isEditingRow ? <input id={`table-edit-image-${product.id}`} ref={setTableEditFieldRef('image')} className="table-edit-input" name="table_edit_image" value={tableEditForm.image} onChange={(e) => handleTableEditChange('image', e.target.value)} onKeyDown={(e) => handleTableEditKeyDown(e, product, 'image')} /> : <span className="src-cell" title={product.image || '-'}>{product.image || '-'}</span>}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </>
);

export default ProductsTablePanel;
