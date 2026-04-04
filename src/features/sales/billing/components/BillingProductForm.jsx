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
        ? <>Multiple matches. Use <strong>Arrow keys</strong> or click.</>
        : <>Top: <strong>{autocompleteCandidate.name}</strong>. Press `Tab` or `Enter`.</>
    )
    : null;

  return (
    <section className="billing-pos-panel billing-entry-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Item</p>
        <h2>{isEditing ? 'Edit Item' : 'Add Item'}</h2>
        <p className="billing-panel-copy">Search, qty, save.</p>
      </div>
      {isEditing ? (
        <span className="billing-panel-badge">Editing</span>
      ) : (
        <span className="billing-panel-badge neutral">Ready</span>
      )}
    </div>

    {isEditing ? (
      <div className="billing-entry-editing-state" role="status" aria-live="polite">
        Editing selected row.
      </div>
    ) : null}

    <div className="billing-entry-grid">
      <label className="billing-entry-field billing-entry-field-search" htmlFor="billing-product-search">
        <span>Search</span>
        <ProductSearchCombobox
          inputId="billing-product-search"
          inputRef={productSearchInputRef}
          value={currentItem.name}
          onChange={(value) => onFieldChange('name', value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Scan or search product"
          loading={productSearchLoading}
          results={visibleProductResults}
          activeIndex={activeProductSuggestionIndex}
          showRecentItems={showRecentProducts}
          selectedItem={currentProduct}
          hintContent={searchHint}
          resultsSummaryText={productResultSummary}
          noResultsText="No match. Press Enter for custom item."
          getOptionKey={(product) => String(product?.id || '')}
          getOptionPrimaryText={(product) => product?.name || 'Product'}
          getOptionSecondaryText={(product) => getProductOptionLabel(product)}
          onSelect={onSelectProduct}
          footerAction={showCustomItemAction ? {
            label: 'Custom Item',
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
        <small className="billing-entry-field-note">Enter saves. Shift+Enter goes to price.</small>
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
          {isManualPrice ? 'Manual price. Enter saves.' : 'Auto price. Change only if needed.'}
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
        <small className="billing-entry-field-note">Flat discount only.</small>
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
        Search name, code, or barcode.
      </span>
      <span>
        <strong>Line</strong> Rs {Number(currentItem.amount || 0).toFixed(2)}
      </span>
    </div>

    {currentProduct ? (
      <div className={`billing-entry-selection${pendingProductSelectionReview ? ' review' : ''}`}>
        <span>{pendingProductSelectionReview ? 'Selected' : 'Matched'}</span>
        <strong>{currentProduct.name}</strong>
        {pendingProductSelectionReview ? (
          <small>Press Enter in Qty to add.</small>
        ) : null}
      </div>
    ) : null}

    {lowStockWarning ? (
      <div className={`billing-entry-warning${lowStockWarning?.tone === 'danger' ? ' critical' : ''}`}>
        <strong>{lowStockWarning?.tone === 'danger' ? 'Stock:' : 'Low stock:'}</strong> {lowStockWarning?.text || ''}
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
          Cancel
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
        {isEditing ? 'Update' : 'Add'}
      </button>
    </div>
  </section>
  );
};

export default memo(BillingProductForm);
