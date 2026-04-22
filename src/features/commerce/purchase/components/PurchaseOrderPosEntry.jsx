import { memo, useMemo, useState } from 'react';
import { ListPlus, SlidersHorizontal } from 'lucide-react';
import ProductSearchCombobox from '../../../../shared/components/product-search/ProductSearchCombobox';
import { formatCurrency } from '../../../../shared/utils/formatters';
import { getLastPurchaseMeta } from '../utils/orderDrafts';

// Note: buildPrimaryRowStatus is not currently used in this component
/* 
const buildPrimaryRowStatus = ({
  duplicateWarning,
  productSelectionWarning,
  discountBlockingWarning,
  rateConfirmationWarning,
  discountNeedsConfirmation,
  discountWarning,
  rateChangeLabel,
  rateChangeTone,
  draftWarning,
  rateConfirmedLabel,
  discountConfirmedLabel,
}) => {
  if (duplicateWarning) {
    return { tone: 'danger', text: 'Duplicate row', title: duplicateWarning };
  }
  if (productSelectionWarning) {
    return { tone: 'bad', text: productSelectionWarning, title: productSelectionWarning };
  }
  if (discountBlockingWarning) {
    return { tone: 'danger', text: 'Fix discount', title: discountBlockingWarning };
  }
  if (rateConfirmationWarning) {
    return { tone: 'danger', text: 'Rate check', title: rateConfirmationWarning };
  }
  if (discountNeedsConfirmation || discountWarning) {
    return {
      tone: 'bad',
      text: 'Discount check',
      title: discountWarning || 'Review discount before saving.',
    };
  }
  if (rateChangeLabel) {
    return {
      tone: rateChangeTone || 'neutral',
      text: rateChangeLabel,
      title: draftWarning || rateChangeLabel,
    };
  }
  if (rateConfirmedLabel) {
    return { tone: 'good', text: 'Rate confirmed', title: rateConfirmedLabel };
  }
  if (discountConfirmedLabel) {
    return { tone: 'good', text: 'Discount confirmed', title: discountConfirmedLabel };
  }
  return null;
};
*/

const PurchaseOrderPosEntry = ({
  activeItem,
  activeItemIndex,
  activeLine,
  activeProduct,
  activeUomOptions,
  entryLocked,
  orderFullMode,
  getProductSearchMeta,
  getPurchasePackStep,
  GST_RATE_OPTIONS,
  orderSubmitting,
  visibleProductResults,
  productResultSummary,
  showRecentProducts,
  productSearchLoading,
  activeProductSuggestionIndex,
  requiresExplicitSuggestionChoice,
  canInlineCreateProduct,
  productInputRef,
  qtyInputRef,
  uomInputRef,
  rateInputRef,
  discountInputRef,
  gstInputRef,
  inlineCreateNameRef,
  inlineCreatePriceRef,
  inlineCreateUomRef,
  inlineProductCreate,
  onAddRow,
  onProductChange,
  onProductFocus,
  onProductKeyDown,
  onProductSuggestionHover,
  onProductSuggestionPick,
  onCreateProductFromSearch,
  onInlineProductCreateChange,
  onInlineProductCreateSubmit,
  onInlineProductCreateCancel,
  onInlineProductCreateKeyDown,
  onItemChange,
  onFieldKeyDown,
}) => {
  const lastPurchaseMeta = getLastPurchaseMeta(activeItem);
  const discountAppliedAmount = Number(activeLine?.discountAmount || 0);
  const enteredQuantity = Math.max(0, Number(activeLine?.quantity || activeItem?.quantity || 0));
  const displayUom = String(activeLine?.uom || activeItem?.uom || 'pcs').trim() || 'pcs';
  const effectivePerDisplayUnit =
    enteredQuantity > 0 ? Number(activeLine?.totalAmount || 0) / enteredQuantity : 0;
  const baseRateUnitLabel =
    String(activeProduct?.base_unit || activeProduct?.uom || 'pcs').trim() || 'pcs';
  const defaultUom = String(activeUomOptions?.[0] || displayUom)
    .trim()
    .toLowerCase();
  const currentUom = displayUom.toLowerCase();
  const currentGstRate = Number(activeItem?.gst_rate ?? activeLine?.gstRate ?? 5) || 0;
  const hasAdvancedAdjustments = Boolean(
    discountAppliedAmount > 0 || currentGstRate !== 5 || currentUom !== defaultUom
  );
  const shouldExposeDiscountControls = Boolean(
    Number(activeItem?.discount_value || 0) > 0 || discountAppliedAmount > 0
  );
  const shouldExposeMoreFields = Boolean(hasAdvancedAdjustments || shouldExposeDiscountControls);
  const [showAdvancedAdjustmentsOverride, setShowAdvancedAdjustmentsOverride] =
    useState(shouldExposeMoreFields);
  const showAdvancedAdjustments = Boolean(
    showAdvancedAdjustmentsOverride || shouldExposeMoreFields
  );
  const rateFieldMeta = lastPurchaseMeta.hasValue
    ? `Auto-filled from ${lastPurchaseMeta.poNumber || 'last purchase'}.`
    : activeItem?.reference_rate_source
      ? `Suggested from ${activeItem.reference_rate_source}.`
      : 'Enter saves this row.';
  const rateFieldInlineMeta =
    lastPurchaseMeta.hasValue || activeItem?.reference_rate_source ? 'Auto-filled' : 'Enter saves';
  const trimmedProductQuery = String(activeItem?.product_query || '').trim();
  const autocompleteCandidate = useMemo(() => {
    if (!trimmedProductQuery || showRecentProducts || !visibleProductResults.length) return null;
    return visibleProductResults[activeProductSuggestionIndex] || visibleProductResults[0] || null;
  }, [
    activeProductSuggestionIndex,
    showRecentProducts,
    trimmedProductQuery,
    visibleProductResults,
  ]);
  const searchHint = autocompleteCandidate ? (
    requiresExplicitSuggestionChoice ? (
      <>
        Use <strong>arrows</strong> to choose.
      </>
    ) : (
      <>
        Use <strong>Tab</strong> or <strong>Enter</strong> for {autocompleteCandidate.name}.
      </>
    )
  ) : null;

  if (!activeItem) {
    return (
      <section className="po-pos-panel po-pos-entry-panel">
        <div className="po-pos-empty-state">
          <strong>No active row available.</strong>
          <button type="button" className="po-pos-action-btn" onClick={onAddRow}>
            <ListPlus size={15} /> Row
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="po-pos-panel po-pos-entry-panel">
      <div className="po-pos-panel-header">
        <div className="po-pos-panel-heading">
          <h4>Row {activeItemIndex + 1}</h4>
          <small className={`po-pos-panel-inline-state${entryLocked ? ' locked' : ''}`}>
            {entryLocked ? 'Supplier first' : 'Active'}
          </small>
        </div>
        <div className="po-pos-panel-actions">
          <button
            type="button"
            className="po-pos-action-btn"
            onClick={onAddRow}
            disabled={entryLocked || orderSubmitting}
            title={entryLocked ? 'Choose supplier first' : 'Add new row'}
            aria-label={entryLocked ? 'Choose supplier first' : 'Add new row'}
          >
            <ListPlus size={15} /> Row
          </button>
        </div>
      </div>

      <div className="po-pos-field-stage">
        <div className="po-pos-field-stage-header">
          <span>Entry</span>
        </div>
        {entryLocked ? (
          <div className="po-pos-locked-note" aria-live="polite">
            Choose supplier first.
          </div>
        ) : null}
        <div className="po-pos-entry-lane">
          <label
            className="po-pos-field po-pos-field-search po-pos-field-primary po-pos-field-search-wide"
            htmlFor="po-pos-product-search"
          >
            <span>Product</span>
            <ProductSearchCombobox
              inputId="po-pos-product-search"
              inputRef={productInputRef}
              value={activeItem.product_query || ''}
              onChange={onProductChange}
              onKeyDown={onProductKeyDown}
              onFocus={onProductFocus}
              placeholder="Search product, SKU, barcode"
              disabled={orderSubmitting || entryLocked}
              loading={productSearchLoading}
              results={visibleProductResults}
              activeIndex={activeProductSuggestionIndex}
              showRecentItems={showRecentProducts}
              selectedItem={activeProduct}
              hintContent={searchHint}
              resultsSummaryText={productResultSummary}
              noResultsText={canInlineCreateProduct ? 'No match. Add new if needed.' : 'No match.'}
              getOptionKey={(product) => String(product?.id || '')}
              getOptionPrimaryText={(product) => product?.name || 'Product'}
              getOptionSecondaryText={(product) => getProductSearchMeta(product)}
              onSelect={(product) => onProductSuggestionPick(product, { focusQty: true })}
              onOptionHover={onProductSuggestionHover}
              footerAction={
                !entryLocked && canInlineCreateProduct
                  ? {
                      label: `Add new: ${trimmedProductQuery}`,
                      onClick: () => onCreateProductFromSearch(trimmedProductQuery),
                      disabled: orderSubmitting,
                    }
                  : null
              }
              footerActionPosition="top"
            />
          </label>

          {inlineProductCreate?.open ? (
            <div className="po-pos-inline-create" aria-live="polite">
              <div className="po-pos-inline-create-header">
                <div>
                  <strong>New Product</strong>
                </div>
                <div className="po-pos-inline-create-actions">
                  <button
                    type="button"
                    className="po-pos-action-btn subtle"
                    onClick={() => onInlineProductCreateCancel('product')}
                    disabled={inlineProductCreate.submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="po-pos-action-btn"
                    onClick={onInlineProductCreateSubmit}
                    disabled={inlineProductCreate.submitting}
                  >
                    {inlineProductCreate.submitting ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>

              <div className="po-pos-inline-create-grid">
                <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-inline-name">
                  <span>Name</span>
                  <input
                    ref={inlineCreateNameRef}
                    id="po-pos-inline-name"
                    type="text"
                    value={inlineProductCreate.name}
                    onChange={(event) => onInlineProductCreateChange('name', event.target.value)}
                    onKeyDown={onInlineProductCreateKeyDown('name')}
                    disabled={inlineProductCreate.submitting}
                  />
                </label>

                <label
                  className="po-pos-field po-pos-field-secondary"
                  htmlFor="po-pos-inline-price"
                >
                  <span>Rate</span>
                  <input
                    ref={inlineCreatePriceRef}
                    id="po-pos-inline-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={inlineProductCreate.price}
                    onChange={(event) => onInlineProductCreateChange('price', event.target.value)}
                    onKeyDown={onInlineProductCreateKeyDown('price')}
                    disabled={inlineProductCreate.submitting}
                  />
                </label>

                <label
                  className="po-pos-field po-pos-field-secondary po-pos-field-compact"
                  htmlFor="po-pos-inline-uom"
                >
                  <span>UOM</span>
                  <select
                    ref={inlineCreateUomRef}
                    id="po-pos-inline-uom"
                    value={inlineProductCreate.uom}
                    onChange={(event) => onInlineProductCreateChange('uom', event.target.value)}
                    onKeyDown={onInlineProductCreateKeyDown('uom')}
                    disabled={inlineProductCreate.submitting}
                  >
                    {Array.from(
                      new Set([
                        ...(Array.isArray(activeUomOptions) ? activeUomOptions : []),
                        inlineProductCreate.uom || 'pcs',
                      ])
                    ).map((uomOption) => (
                      <option key={uomOption} value={uomOption}>
                        {uomOption}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {inlineProductCreate.error ? (
                <p className="po-pos-inline-create-error">{inlineProductCreate.error}</p>
              ) : (
                <p className="po-pos-inline-create-note">Add here, then continue with qty.</p>
              )}
            </div>
          ) : null}

          <div className={`po-pos-primary-grid${orderFullMode ? ' full' : ''}`}>
            <label
              className="po-pos-field po-pos-field-primary po-pos-field-qty"
              htmlFor="po-pos-qty"
            >
              <span>Qty</span>
              <input
                ref={qtyInputRef}
                id="po-pos-qty"
                type="number"
                min="1"
                step={getPurchasePackStep(activeProduct, activeItem.uom || activeLine?.uom)}
                value={activeItem.quantity}
                onChange={(event) => onItemChange('quantity', event.target.value)}
                onKeyDown={onFieldKeyDown('qty')}
                disabled={orderSubmitting || entryLocked}
              />
            </label>

            {orderFullMode ? (
              <label
                className="po-pos-field po-pos-field-primary po-pos-field-rate"
                htmlFor="po-pos-rate"
              >
                <div className="po-pos-field-label-row">
                  <span>Rate / {baseRateUnitLabel}</span>
                  <small className="po-pos-field-inline-meta" title={rateFieldMeta}>
                    {rateFieldInlineMeta}
                  </small>
                </div>
                <input
                  ref={rateInputRef}
                  id="po-pos-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={activeItem.rate ?? activeItem.unit_price}
                  onChange={(event) => onItemChange('rate', event.target.value)}
                  onKeyDown={onFieldKeyDown('rate')}
                  disabled={orderSubmitting || entryLocked}
                />
              </label>
            ) : (
              <div className="po-pos-stat-card readonly">
                <span>Rate / {baseRateUnitLabel}</span>
                <strong>{formatCurrency(activeLine?.rate || 0)}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="po-pos-field-stage secondary compact">
        <div className="po-pos-field-stage-header po-pos-field-stage-header-inline">
          <div>
            <span>More Fields</span>
          </div>
          <button
            type="button"
            className="po-pos-action-btn po-pos-stage-toggle-btn"
            onClick={() => setShowAdvancedAdjustmentsOverride((prev) => !prev)}
          >
            <SlidersHorizontal size={15} />
            {showAdvancedAdjustments ? 'Less' : 'More'}
          </button>
        </div>
        {showAdvancedAdjustments ? (
          <div className="po-pos-entry-grid po-pos-entry-grid-secondary">
            {!orderFullMode ? (
              <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-rate-more">
                <span>Rate / {baseRateUnitLabel}</span>
                <input
                  ref={rateInputRef}
                  id="po-pos-rate-more"
                  type="number"
                  min="0"
                  step="0.01"
                  value={activeItem.rate ?? activeItem.unit_price}
                  onChange={(event) => onItemChange('rate', event.target.value)}
                  onKeyDown={onFieldKeyDown('rate')}
                  disabled={orderSubmitting || entryLocked}
                />
              </label>
            ) : null}

            <label
              className="po-pos-field po-pos-field-secondary po-pos-field-compact"
              htmlFor="po-pos-uom"
            >
              <span>UOM</span>
              <select
                ref={uomInputRef}
                id="po-pos-uom"
                value={activeLine?.uom || activeItem.uom}
                onChange={(event) => onItemChange('uom', event.target.value)}
                onKeyDown={onFieldKeyDown('uom')}
                disabled={orderSubmitting || entryLocked}
              >
                {activeUomOptions.map((uomOption) => (
                  <option key={uomOption} value={uomOption}>
                    {uomOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-gst">
              <span>GST %</span>
              <select
                ref={gstInputRef}
                id="po-pos-gst"
                value={activeItem.gst_rate}
                onChange={(event) => onItemChange('gst_rate', event.target.value)}
                onKeyDown={onFieldKeyDown('gst')}
                disabled={orderSubmitting || entryLocked}
              >
                {GST_RATE_OPTIONS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </label>

            <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-discount-type">
              <span>Discount Type</span>
              <select
                id="po-pos-discount-type"
                value={activeItem.discount_type || 'percent'}
                onChange={(event) => onItemChange('discount_type', event.target.value)}
                disabled={orderSubmitting || entryLocked}
              >
                <option value="percent">%</option>
                <option value="fixed">Fixed</option>
              </select>
            </label>

            <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-discount-value">
              <span>Discount</span>
              <input
                ref={discountInputRef}
                id="po-pos-discount-value"
                type="number"
                min="0"
                step="0.01"
                value={activeItem.discount_value ?? 0}
                onChange={(event) => onItemChange('discount_value', event.target.value)}
                onKeyDown={onFieldKeyDown('discount')}
                disabled={orderSubmitting || entryLocked}
              />
            </label>
          </div>
        ) : shouldExposeMoreFields ? (
          <div className="po-pos-adjustments-preview" aria-live="polite">
            {!orderFullMode ? <span>Rate: {formatCurrency(activeLine?.rate || 0)}</span> : null}
            {currentUom !== defaultUom ? <span>UOM: {displayUom}</span> : null}
            {currentGstRate !== 5 ? (
              <span>GST: {Number(activeLine?.gstRate || 0).toFixed(0)}%</span>
            ) : null}
            {discountAppliedAmount > 0 ? (
              <span>Discount: {formatCurrency(discountAppliedAmount)}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="po-pos-summary-block" aria-live="polite">
        <div className="po-pos-summary-header">
          <span>Totals</span>
          <p className="po-pos-summary-note">Auto from current row.</p>
        </div>
        <div className="po-pos-line-summary compact">
          <div>
            <span>Per unit</span>
            <strong>{formatCurrency(effectivePerDisplayUnit)}</strong>
          </div>
          <div className="total">
            <span>Line total</span>
            <strong>{formatCurrency(activeLine?.totalAmount || 0)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
};

export default memo(PurchaseOrderPosEntry);
