const CategoryProductsPanel = ({
  selectedCategory,
  productsLoading,
  categoryProducts,
  editingProductId,
  editingProductCategoryId,
  editingProductCategoryQuery,
  editingProductCategoryFocusIndex,
  savingProductEdit,
  filteredProductCategoryOptions,
  productCategoryInputRef,
  onStartEditing,
  onCategoryQueryChange,
  onCategoryQueryKeyDown,
  onChooseCategory,
  onHoverCategoryIndex,
  onCancelEditing,
  onSaveEdit,
  onDragStart,
  onDragEnd,
}) => (
  <div className="category-products-panel">
    <h3>
      {selectedCategory ? `Products in ${selectedCategory.name}` : 'Category Products'}
    </h3>
    <p className="panel-help">
      Drag a product and drop it on another category node to reassign category directly.
    </p>

    {productsLoading ? (
      <div className="loading-message compact">Loading products...</div>
    ) : !selectedCategory ? (
      <div className="empty-message compact">Select a category to view and drag products.</div>
    ) : categoryProducts.length === 0 ? (
      <div className="empty-message compact">No products in this category.</div>
    ) : (
      <div className="category-products-list">
        {categoryProducts.map((product) => (
          <div
            key={product.id}
            className={`category-product-item${Number(editingProductId) === Number(product.id) ? ' is-editing' : ''}`}
            draggable={Number(editingProductId) !== Number(product.id)}
            onDragStart={() => onDragStart(product.id)}
            onDragEnd={onDragEnd}
            onClick={() => onStartEditing(product)}
          >
            <span className="product-name">{product.name}</span>
            <span className="product-meta">
              #{product.id} | Stock {Number(product.stock || 0)} | {String(product.category_path || product.category || '').trim() || '-'}
            </span>
            {Number(editingProductId) === Number(product.id) ? (
              <div
                className="product-inline-editor"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="text"
                  id="product-category-search"
                  name="product-category-search"
                  ref={productCategoryInputRef}
                  className="product-category-search-input"
                  placeholder="Type to search categories..."
                  value={editingProductCategoryQuery}
                  onChange={onCategoryQueryChange}
                  onKeyDown={onCategoryQueryKeyDown}
                  disabled={savingProductEdit}
                />
                <div className="product-category-search-results">
                  {filteredProductCategoryOptions.length === 0 ? (
                    <div className="product-category-no-results">No category matches</div>
                  ) : (
                    filteredProductCategoryOptions.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`product-category-option${Number(editingProductCategoryId) === Number(option.id) ? ' selected' : ''}${index === editingProductCategoryFocusIndex ? ' highlighted' : ''}`}
                        onClick={() => onChooseCategory(option.id)}
                        onMouseEnter={() => onHoverCategoryIndex(index)}
                        disabled={savingProductEdit}
                        title={option.path}
                      >
                        {option.path}
                      </button>
                    ))
                  )}
                </div>
                <div className="product-inline-actions">
                  <button
                    type="button"
                    className="inline-cancel-btn"
                    onClick={onCancelEditing}
                    disabled={savingProductEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-save-btn"
                    onClick={() => onSaveEdit(product)}
                    disabled={savingProductEdit}
                  >
                    {savingProductEdit ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default CategoryProductsPanel;
