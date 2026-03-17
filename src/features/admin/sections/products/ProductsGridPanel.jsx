import { Edit, FolderOpen, Plus, Trash2 } from 'lucide-react';

const ProductsGridPanel = ({
  showQuickAdd,
  setShowQuickAdd,
  quickAddForm,
  setQuickAddForm,
  resetQuickAdd,
  quickSaving,
  handleQuickAddSave,
  visibleProducts,
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
  handleEditProduct,
  productEditLoadingId,
  handleDeleteProduct,
  productCategories,
}) => (
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
    {visibleProducts.map((product) => {
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
      {productCategories.map((category) => (
        <option key={category} value={category} />
      ))}
    </datalist>
  </div>
);

export default ProductsGridPanel;
