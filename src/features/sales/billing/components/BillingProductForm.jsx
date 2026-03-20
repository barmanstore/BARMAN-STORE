import React, { memo, useMemo } from 'react';
import { RotateCcw, ScanLine, Save } from 'lucide-react';
import ProductSearchCombobox from '../../../../shared/components/product-search/ProductSearchCombobox';

const BillingProductForm = ({
  currentItem,
  currentProduct,
  pendingProductSelectionReview,
  isManualPrice,
  isEntryActionLocked,
  productSearchMessage,
  requiresExplicitSuggestionChoice,
  showCustomItemAction,
  currentUnitOptions,
  isEditing,
  isSubmitting,
  productSearchInputRef,
  priceInputRef,
  qtyInputRef,
  unitInputRef,
  discountInputRef,
  submitButtonRef,
  visibleProductResults,
  productResultSummary,
  showRecentProducts,
  productSearchLoading,
  activeProductSuggestionIndex,
  getProductOptionLabel,
  onFieldChange,
  onSearchKeyDown,
  onFieldKeyDown,
  onSelectProduct,
  onStartCustomItem,
  onSubmitItem,
  onCancelEdit,
  lowStockWarning,
}) => {
  const trimmedSearch = String(currentItem?.name || '').trim();
  const autocompleteCandidate = useMemo(() => {
    if (!trimmedSearch || showRecentProducts || !visibleProductResults.length) return null;
    return visibleProductResults[activeProductSuggestionIndex] || visibleProductResults[0] || null;
  }, [
    activeProductSuggestionIndex,
    showRecentProducts,
    trimmedSearch,
    visibleProductResults,
  ]);
  const searchHint = autocompleteCandidate
    ? (
      requiresExplicitSuggestionChoice
        ? <>Multiple matches found. Use <strong>Arrow keys</strong> or click a product to confirm the right item.</>
        : <>Top match: <strong>{autocompleteCandidate.name}</strong>. Press `Tab` or `Enter` to use it.</>
    )
    : null;

  return (
    <section className="billing-pos-panel billing-entry-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Product Entry</p>
        <h2>{isEditing ? 'Update Selected Item' : 'Add One Item Fast'}</h2>
        <p className="billing-panel-copy">
          Type product name, code, or barcode. Fast path: product, qty, Enter. Use Shift+Enter when you want to review price or discount before saving.
        </p>
      </div>
      {isEditing ? (
        <span className="billing-panel-badge">Editing Item</span>
      ) : (
        <span className="billing-panel-badge neutral">Ready</span>
      )}
    </div>

    {isEditing ? (
      <div className="billing-entry-editing-state" role="status" aria-live="polite">
        Editing item. Updating will replace the selected bill row.
      </div>
    ) : null}

    <div className="billing-entry-grid">
      <label className="billing-entry-field billing-entry-field-search" htmlFor="billing-product-search">
        <span>Product Search</span>
        <ProductSearchCombobox
          inputId="billing-product-search"
          inputRef={productSearchInputRef}
          value={currentItem.name}
          onChange={(value) => onFieldChange('name', value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Scan barcode or type product name"
          loading={productSearchLoading}
          results={visibleProductResults}
          activeIndex={activeProductSuggestionIndex}
          showRecentItems={showRecentProducts}
          selectedItem={currentProduct}
          hintContent={searchHint}
          resultsSummaryText={productResultSummary}
          noResultsText="No product found. Press Enter or use Add Custom Item."
          getOptionKey={(product) => String(product?.id || '')}
          getOptionPrimaryText={(product) => product?.name || 'Product'}
          getOptionSecondaryText={(product) => getProductOptionLabel(product)}
          onSelect={onSelectProduct}
          footerAction={showCustomItemAction ? {
            label: 'Add Custom Item',
            onClick: () => onStartCustomItem(currentItem?.name),
            disabled: isEntryActionLocked,
          } : null}
        />
      </label>

      {productSearchMessage ? (
        <div className="billing-entry-search-note" role="status" aria-live="polite">
          {productSearchMessage}
        </div>
      ) : null}

      <label className="billing-entry-field" htmlFor="billing-product-qty">
        <span>Quantity</span>
        <input
          ref={qtyInputRef}
          id="billing-product-qty"
          type="number"
          min="1"
          step="1"
          className="form-input"
          value={currentItem.qty}
          onChange={(event) => onFieldChange('qty', event.target.value)}
          onKeyDown={onFieldKeyDown('qty')}
          placeholder="1"
        />
        <small className="billing-entry-field-note">Press Enter to add this line when the price is already correct. Use Shift+Enter to edit price first.</small>
      </label>

      <label className="billing-entry-field" htmlFor="billing-product-price">
        <span>Price</span>
        <input
          ref={priceInputRef}
          id="billing-product-price"
          type="number"
          min="0"
          step="0.01"
          className={`form-input${isManualPrice ? ' billing-price-input-manual' : ''}`}
          value={currentItem.price}
          onChange={(event) => onFieldChange('price', event.target.value)}
          onKeyDown={onFieldKeyDown('price')}
          placeholder="0.00"
        />
        <small className={`billing-entry-field-note${isManualPrice ? ' manual' : ''}`}>
          {isManualPrice ? 'Manual price active. Press Enter to save this line, or Shift+Enter to continue to discount.' : 'Auto-filled from the product. Edit only when the selling price needs correction.'}
        </small>
      </label>

      <label className="billing-entry-field" htmlFor="billing-product-discount">
        <span>Discount (Rs)</span>
        <input
          ref={discountInputRef}
          id="billing-product-discount"
          type="number"
          min="0"
          step="0.01"
          className="form-input"
          value={currentItem.disc}
          onChange={(event) => onFieldChange('disc', event.target.value)}
          onKeyDown={onFieldKeyDown('disc')}
          placeholder="0"
        />
        <small className="billing-entry-field-note">Flat amount discount only. It cannot exceed the line total.</small>
      </label>

      <label className="billing-entry-field" htmlFor="billing-product-unit">
        <span>Unit</span>
        <select
          ref={unitInputRef}
          id="billing-product-unit"
          className="form-input"
          value={currentItem.unit}
          onChange={(event) => onFieldChange('unit', event.target.value)}
          onKeyDown={onFieldKeyDown('unit')}
        >
          {currentUnitOptions.map((unitOption) => (
            <option key={unitOption} value={unitOption}>
              {unitOption}
            </option>
          ))}
        </select>
      </label>
    </div>

    <div className="billing-entry-help">
      <span>
        <ScanLine size={15} />
        Search by name, code, or barcode. Exact code matches stay fast. If multiple products match, choose one explicitly before continuing.
      </span>
      <span>
        <strong>Current Line</strong> Rs {Number(currentItem.amount || 0).toFixed(2)}
      </span>
    </div>

    {currentProduct ? (
      <div className={`billing-entry-selection${pendingProductSelectionReview ? ' review' : ''}`}>
        <span>{pendingProductSelectionReview ? 'Selected Product' : 'Matched Product'}</span>
        <strong>{currentProduct.name}</strong>
        {pendingProductSelectionReview ? (
          <small>Press Enter in Qty or review the line before Add Item.</small>
        ) : null}
      </div>
    ) : null}

    {lowStockWarning ? (
      <div className={`billing-entry-warning${lowStockWarning?.tone === 'danger' ? ' critical' : ''}`}>
        <strong>{lowStockWarning?.tone === 'danger' ? 'Stock alert:' : 'Low stock warning:'}</strong> {lowStockWarning?.text || ''}
      </div>
    ) : null}

    <div className="billing-entry-actions">
      {isEditing ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onCancelEdit}
        >
          <RotateCcw size={16} />
          Cancel Edit
        </button>
      ) : null}
      <button
        ref={submitButtonRef}
        type="button"
        className={`billing-primary-btn${isEditing ? ' billing-primary-btn-editing' : ''}`}
        onClick={() => onSubmitItem()}
        disabled={isSubmitting || isEntryActionLocked}
      >
        <Save size={16} />
        {isEditing ? 'Update Item' : 'Add Item'}
      </button>
    </div>
  </section>
  );
};

export default memo(BillingProductForm);
