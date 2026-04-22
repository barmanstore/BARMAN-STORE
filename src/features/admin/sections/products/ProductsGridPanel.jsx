import { CheckCircle2, Circle, Edit, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import SignedCurrency from '../../../../shared/components/SignedCurrency';

const PRODUCT_GRID_COLUMNS = 4;
const PRODUCT_GRID_ROW_HEIGHT = 392;
const PRODUCT_GRID_OVERSCAN = 2;
const PRODUCT_GRID_MIN_ITEMS = 20;

const chunkProducts = (products = [], size = 1) => {
  const chunkSize = Math.max(1, Number(size || 1));
  const rows = [];
  for (let index = 0; index < products.length; index += chunkSize) {
    rows.push(products.slice(index, index + chunkSize));
  }
  return rows;
};

const findScrollableAncestor = (node) => {
  if (!node || typeof window === 'undefined') return null;

  let current = node.parentElement;
  while (current) {
    const styles = window.getComputedStyle(current);
    const overflowY = String(styles.overflowY || '').toLowerCase();
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return document.scrollingElement || document.documentElement || null;
};

const getScrollMetrics = (hostNode, scrollNode) => {
  if (!hostNode) return null;

  if (
    !scrollNode ||
    scrollNode === window ||
    scrollNode === document.scrollingElement ||
    scrollNode === document.documentElement
  ) {
    const hostRect = hostNode.getBoundingClientRect();
    return {
      componentTop: hostRect.top + window.scrollY,
      scrollTop: window.scrollY,
      viewportHeight: window.innerHeight,
    };
  }

  const hostRect = hostNode.getBoundingClientRect();
  const scrollRect = scrollNode.getBoundingClientRect();
  return {
    componentTop: hostRect.top - scrollRect.top + scrollNode.scrollTop,
    scrollTop: scrollNode.scrollTop,
    viewportHeight: scrollNode.clientHeight,
  };
};

function ProductsGridPanel({
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
  handleEditProduct,
  productEditLoadingId,
  handleDeleteProduct,
  productCategories,
  selectedProductIds,
  toggleProductSelection,
  isMobile,
}) {
  const hostRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [visibleRowRange, setVisibleRowRange] = useState({ start: 0, end: -1 });

  const shouldVirtualize =
    !isMobile && !quickEditId && visibleProducts.length >= PRODUCT_GRID_MIN_ITEMS;
  const productRows = useMemo(
    () => chunkProducts(visibleProducts, PRODUCT_GRID_COLUMNS),
    [visibleProducts]
  );
  const rowCount = productRows.length;
  const totalHeight = Math.max(0, rowCount * PRODUCT_GRID_ROW_HEIGHT);
  const windowedRows = useMemo(
    () =>
      productRows.slice(Math.max(0, visibleRowRange.start), Math.max(0, visibleRowRange.end) + 1),
    [productRows, visibleRowRange.end, visibleRowRange.start]
  );
  const virtualWindowOffset = Math.max(0, visibleRowRange.start) * PRODUCT_GRID_ROW_HEIGHT;

  useEffect(() => {
    if (!shouldVirtualize) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleRowRange({ start: 0, end: rowCount - 1 });
      return undefined;
    }

    const hostNode = hostRef.current;
    if (!hostNode || typeof window === 'undefined') return undefined;

    const scrollNode = findScrollableAncestor(hostNode) || window;
    scrollContainerRef.current = scrollNode;
    let frameId = 0;

    const computeRange = () => {
      frameId = 0;
      const metrics = getScrollMetrics(hostNode, scrollNode);
      if (!metrics) return;

      const { componentTop, scrollTop, viewportHeight } = metrics;
      const visibleTopPx = Math.max(0, scrollTop - componentTop);
      const visibleBottomPx = Math.max(
        0,
        Math.min(totalHeight, scrollTop + viewportHeight - componentTop)
      );
      const nextStartRow = Math.max(
        0,
        Math.floor(visibleTopPx / PRODUCT_GRID_ROW_HEIGHT) - PRODUCT_GRID_OVERSCAN
      );
      const nextEndRow = Math.min(
        Math.max(0, rowCount - 1),
        Math.floor(Math.max(0, visibleBottomPx - 1) / PRODUCT_GRID_ROW_HEIGHT) +
          PRODUCT_GRID_OVERSCAN
      );

      setVisibleRowRange((current) => {
        if (current.start === nextStartRow && current.end === nextEndRow) return current;
        return { start: nextStartRow, end: nextEndRow };
      });
    };

    const scheduleCompute = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(computeRange);
    };

    setVisibleRowRange({
      start: 0,
      end: Math.min(Math.max(0, rowCount - 1), PRODUCT_GRID_OVERSCAN * 2 + 1),
    });
    scheduleCompute();

    if (scrollNode && scrollNode !== window) {
      scrollNode.addEventListener('scroll', scheduleCompute, { passive: true });
    } else {
      window.addEventListener('scroll', scheduleCompute, { passive: true });
    }
    window.addEventListener('resize', scheduleCompute);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (scrollNode && scrollNode !== window) {
        scrollNode.removeEventListener('scroll', scheduleCompute);
      } else {
        window.removeEventListener('scroll', scheduleCompute);
      }
      window.removeEventListener('resize', scheduleCompute);
    };
  }, [rowCount, shouldVirtualize, totalHeight, visibleProducts.length]);

  useEffect(() => {
    if (!shouldVirtualize) return undefined;
    const scroller = scrollContainerRef.current;
    if (!scroller || scroller === window) return undefined;
    scroller.scrollTop = 0;
    return undefined;
  }, [shouldVirtualize, visibleProducts.length]);

  const renderProductCard = (product) => {
    const isEditingQuick = quickEditId === product.id;
    const isSelected = selectedProductIds.includes(Number(product.id));
    const imageSourceProduct = isEditingQuick
      ? {
          image: quickEditForm.image,
          name: quickEditForm.name || product.name,
          category: quickEditForm.category || getCategoryPath(product),
          brand: getBrandPath(product),
        }
      : product;

    return (
      <div key={product.id} className={`product-admin-card ${isSelected ? 'is-selected' : ''}`}>
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
              onChange={(e) => setQuickEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              id={`quick-edit-category-${product.id}`}
              name="category"
              type="text"
              list="admin-product-category-list"
              placeholder="Category"
              value={quickEditForm.category}
              onChange={(e) => setQuickEditForm((prev) => ({ ...prev, category: e.target.value }))}
            />
            <input
              id={`quick-edit-price-${product.id}`}
              name="price"
              type="number"
              placeholder="Price"
              min="0"
              step="0.01"
              value={quickEditForm.price}
              onChange={(e) => setQuickEditForm((prev) => ({ ...prev, price: e.target.value }))}
            />
            <input
              id={`quick-edit-stock-${product.id}`}
              name="stock"
              type="number"
              placeholder="Stock"
              min="0"
              step="1"
              value={quickEditForm.stock}
              onChange={(e) => setQuickEditForm((prev) => ({ ...prev, stock: e.target.value }))}
            />
            <input
              id={`quick-edit-image-${product.id}`}
              name="image"
              type="text"
              placeholder="Image URL (optional)"
              value={quickEditForm.image}
              onChange={(e) => setQuickEditForm((prev) => ({ ...prev, image: e.target.value }))}
            />
            <div className="quick-form-actions">
              <button className="admin-btn" onClick={cancelQuickEdit} disabled={quickSaving}>
                Cancel
              </button>
              <button
                className="admin-btn primary"
                onClick={() => handleQuickEditSave(product)}
                disabled={quickSaving}
              >
                {quickSaving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="product-card-title-row">
              <div className="product-card-title-copy">
                <h3>{product.name}</h3>
                {Number(product.is_active ?? 1) === 0 ? (
                  <span className="product-status-badge inactive">Inactive</span>
                ) : null}
              </div>
              <button
                type="button"
                className={`product-card-select ${isSelected ? 'is-selected' : ''}`}
                onClick={(e) => toggleProductSelection(product.id, { shiftKey: e.shiftKey })}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${product.name || 'product'}`}
                title={isSelected ? 'Deselect product' : 'Select product'}
              >
                {isSelected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                <span>{isSelected ? 'Selected' : 'Select'}</span>
              </button>
            </div>
            <p className="product-meta">{getBrandPath(product) || 'Unbranded'}</p>
            <p className="product-meta">{getCategoryPath(product)}</p>
            <p className="product-meta">
              <SignedCurrency amount={product.price} />
            </p>
            <p
              className={
                product.stock < 10 ? 'product-stock-label low-stock' : 'product-stock-label'
              }
            >
              Stock: {product.stock}
            </p>
            <div className="product-card-actions">
              <button
                className="action-btn edit"
                onClick={() => startQuickEdit(product)}
                title="Quick edit"
              >
                <Edit size={16} />
              </button>
              <button
                className="action-btn edit"
                onClick={() => handleEditProduct(product)}
                title={
                  Number(productEditLoadingId || 0) === Number(product.id || 0)
                    ? 'Loading full product details...'
                    : 'Advanced edit'
                }
                disabled={Number(productEditLoadingId || 0) === Number(product.id || 0)}
              >
                <FolderOpen size={16} />
              </button>
              <button
                className="action-btn delete"
                onClick={() => handleDeleteProduct(product.id)}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderProductRow = (row, rowIndex) => (
    <div key={`row-${rowIndex}`} className="products-grid-admin-row">
      {row.map((product) => renderProductCard(product))}
      {row.length < PRODUCT_GRID_COLUMNS
        ? Array.from({ length: PRODUCT_GRID_COLUMNS - row.length }, (_, emptyIndex) => (
            <div
              key={`placeholder-${rowIndex}-${emptyIndex}`}
              className="product-admin-card products-grid-admin-card-placeholder"
              aria-hidden="true"
            />
          ))
        : null}
    </div>
  );

  return (
    <div className={`products-grid-admin ${shouldVirtualize ? 'is-virtual' : ''}`}>
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
              onChange={(e) => setQuickAddForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              id="quick-add-category"
              name="category"
              type="text"
              list="admin-product-category-list"
              placeholder="Category"
              value={quickAddForm.category}
              onChange={(e) => setQuickAddForm((prev) => ({ ...prev, category: e.target.value }))}
            />
            <input
              id="quick-add-price"
              name="price"
              type="number"
              placeholder="Price"
              min="0"
              step="0.01"
              value={quickAddForm.price}
              onChange={(e) => setQuickAddForm((prev) => ({ ...prev, price: e.target.value }))}
            />
            <input
              id="quick-add-stock"
              name="stock"
              type="number"
              placeholder="Stock"
              min="0"
              step="1"
              value={quickAddForm.stock}
              onChange={(e) => setQuickAddForm((prev) => ({ ...prev, stock: e.target.value }))}
            />
            <input
              id="quick-add-image"
              name="image"
              type="text"
              placeholder="Image URL (optional)"
              value={quickAddForm.image}
              onChange={(e) => setQuickAddForm((prev) => ({ ...prev, image: e.target.value }))}
            />
            <div className="quick-form-actions">
              <button
                className="admin-btn"
                onClick={() => {
                  setShowQuickAdd(false);
                  resetQuickAdd();
                }}
                disabled={quickSaving}
              >
                Cancel
              </button>
              <button
                className="admin-btn primary"
                onClick={handleQuickAddSave}
                disabled={quickSaving}
              >
                {quickSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {shouldVirtualize ? (
        <div ref={hostRef} className="products-grid-admin-virtual-host">
          <div
            className="products-grid-admin-virtual-spacer"
            style={{ height: `${totalHeight}px` }}
            aria-hidden="true"
          />
          <div
            className="products-grid-admin-virtual-window"
            style={{ transform: `translateY(${virtualWindowOffset}px)` }}
          >
            {windowedRows.map((row, rowOffset) =>
              renderProductRow(row, visibleRowRange.start + rowOffset)
            )}
          </div>
        </div>
      ) : (
        <div className="products-grid-admin-full-grid">
          {visibleProducts.map((product) => renderProductCard(product))}
        </div>
      )}

      <datalist id="admin-product-category-list">
        {productCategories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}

export default ProductsGridPanel;
