import { memo, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import ProductSearchCombobox from '../../../../shared/components/product-search/ProductSearchCombobox';
import { formatCurrency } from '../../../../shared/utils/formatters';
import { getLastPurchaseMeta } from '../utils/orderDrafts';

const PurchaseOrderPosEntry = ({
  activeItem,
  activeItemIndex,
  activeLine,
  activeProduct,
  activeUomOptions,
  orderFullMode,
  getProductSearchMeta,
  getPurchasePackStep,
  GST_RATE_OPTIONS,
  draftWarning,
  rateChangeLabel,
  rateChangeTone,
  rateNeedsConfirmation,
  rateConfirmedLabel,
  rateConfirmationWarning,
  discountWarning,
  discountBlockingWarning,
  discountNeedsConfirmation,
  discountConfirmedLabel,
  duplicateWarning,
  productSelectionWarning,
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
  onConfirmRateWarning,
  onConfirmDiscountWarning,
  onFieldKeyDown,
}) => {
  const suggestedRate = Number(activeItem?.reference_rate || activeItem?.rate || 0);
  const lastPurchaseMeta = getLastPurchaseMeta(activeItem);
  const discountAppliedAmount = Number(activeLine?.discountAmount || 0);
  const grossAmount = Number(activeLine?.grossAmount || 0);
  const enteredQuantity = Math.max(0, Number(activeLine?.quantity || activeItem?.quantity || 0));
  const displayUom = String(activeLine?.uom || activeItem?.uom || 'pcs').trim() || 'pcs';
  const grossPerDisplayUnit = enteredQuantity > 0 ? grossAmount / enteredQuantity : 0;
  const effectivePerDisplayUnit = enteredQuantity > 0
    ? Number(activeLine?.totalAmount || 0) / enteredQuantity
    : 0;
  const taxablePerDisplayUnit = enteredQuantity > 0
    ? Number(activeLine?.taxableValue || 0) / enteredQuantity
    : 0;
  const baseRateUnitLabel = String(activeProduct?.base_unit || activeProduct?.uom || 'pcs').trim() || 'pcs';
  const defaultUom = String(activeUomOptions?.[0] || displayUom).trim().toLowerCase();
  const currentUom = displayUom.toLowerCase();
  const currentGstRate = Number(activeItem?.gst_rate ?? activeLine?.gstRate ?? 5) || 0;
  const hasAdvancedAdjustments = Boolean(
    discountAppliedAmount > 0
    || currentGstRate !== 5
    || currentUom !== defaultUom
  );
  const shouldExposeDiscountControls = Boolean(
    Number(activeItem?.discount_value || 0) > 0
    || discountAppliedAmount > 0
    || discountNeedsConfirmation
    || discountBlockingWarning
    || discountConfirmedLabel
  );
  const [showAdvancedAdjustments, setShowAdvancedAdjustments] = useState(false);
  const lastPurchaseLabel = lastPurchaseMeta.hasValue
    ? [
        lastPurchaseMeta.rate > 0 ? `Last ${formatCurrency(lastPurchaseMeta.rate)}` : 'Last purchase',
        lastPurchaseMeta.distributorName ? `Distributor: ${lastPurchaseMeta.distributorName}` : '',
        lastPurchaseMeta.ageLabel || lastPurchaseMeta.dateLabel,
      ].filter(Boolean).join(' | ') || lastPurchaseMeta.fallbackHint
    : '';
  const rateFieldMeta = lastPurchaseMeta.hasValue
    ? `Auto-filled from ${lastPurchaseMeta.poNumber || 'last purchase'}. Editable before saving.`
    : (activeItem?.reference_rate_source
        ? `Suggested from ${activeItem.reference_rate_source}. Editable before saving.`
        : 'Enter to save this row and open the next one.');
  const rateFieldInlineMeta = lastPurchaseMeta.hasValue || activeItem?.reference_rate_source
    ? 'Auto-filled'
    : 'Enter saves';
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
  const searchHint = autocompleteCandidate
    ? (
      requiresExplicitSuggestionChoice
        ? <>Multiple matches found. Use <strong>Arrow keys</strong> or click a product to confirm the right item.</>
        : <>Top match: <strong>{autocompleteCandidate.name}</strong>. Press `Tab` or `Enter` to use it.</>
    )
    : null;

  useEffect(() => {
    setShowAdvancedAdjustments(shouldExposeDiscountControls);
  }, [activeItemIndex, shouldExposeDiscountControls]);

  if (!activeItem) {
    return (
      <section className="po-pos-panel po-pos-entry-panel">
        <div className="po-pos-empty-state">
          <strong>No active row available.</strong>
          <p>Add a row to start entering purchase items.</p>
          <button type="button" className="submit-btn" onClick={onAddRow}>
            <Plus size={16} /> Add Row
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="po-pos-panel po-pos-entry-panel">
      <div className="po-pos-panel-header">
        <div>
          <p className="po-pos-panel-kicker">Active Entry</p>
          <h4>Row {activeItemIndex + 1}</h4>
          <p>Keep the row moving: product, qty, base rate, enter.</p>
        </div>
        <div className="po-pos-panel-actions">
          <button type="button" className="po-pos-action-btn" onClick={onAddRow}>
            <Plus size={15} /> New Row
          </button>
        </div>
      </div>

      <div className="po-pos-field-stage">
        <div className="po-pos-field-stage-header">
          <span>Entry Lane</span>
          <p>Primary operator flow for everyday entry.</p>
        </div>
        <div className="po-pos-status-row" aria-live="polite">
          {lastPurchaseLabel ? (
            <span className="po-pos-status-chip info">{lastPurchaseLabel}</span>
          ) : null}
          {lastPurchaseMeta.poNumber ? (
            <span className="po-pos-status-chip neutral">PO {lastPurchaseMeta.poNumber}</span>
          ) : null}
          {suggestedRate > 0 ? (
            <span className="po-pos-status-chip neutral">
              Suggested {formatCurrency(suggestedRate)}
            </span>
          ) : null}
          {rateChangeLabel ? (
            <span
              className={`po-pos-status-chip ${rateChangeTone || 'neutral'}`}
              title={draftWarning || rateConfirmationWarning || undefined}
            >
              {rateChangeLabel}
            </span>
          ) : null}
          {rateConfirmationWarning ? (
            <span className="po-pos-status-chip danger">{rateConfirmationWarning}</span>
          ) : null}
          {rateConfirmedLabel ? (
            <span className="po-pos-status-chip good">{rateConfirmedLabel}</span>
          ) : null}
          {rateNeedsConfirmation ? (
            <button
              type="button"
              className="po-pos-status-chip-btn danger"
              onClick={onConfirmRateWarning}
              disabled={orderSubmitting}
            >
              Intentional rate
            </button>
          ) : null}
          {enteredQuantity > 0 ? (
            <span className="po-pos-status-chip neutral">
              Effective {formatCurrency(effectivePerDisplayUnit)} / {displayUom}
            </span>
          ) : null}
          {activeLine?.discountAmount > 0 ? (
            <span className="po-pos-status-chip bad">
              Discount {formatCurrency(activeLine.discountAmount)} applied
            </span>
          ) : null}
          {activeLine?.discountAmount > 0 && grossAmount > 0 ? (
            <span className="po-pos-status-chip neutral">
              Net {formatCurrency(taxablePerDisplayUnit)} / {displayUom} before GST
            </span>
          ) : null}
          {discountWarning ? (
            <span className="po-pos-status-chip bad">{discountWarning}</span>
          ) : null}
          {discountConfirmedLabel ? (
            <span className="po-pos-status-chip good">{discountConfirmedLabel}</span>
          ) : null}
          {discountNeedsConfirmation ? (
            <button
              type="button"
              className="po-pos-status-chip-btn danger"
              onClick={onConfirmDiscountWarning}
              disabled={orderSubmitting}
            >
              Intentional discount
            </button>
          ) : null}
          {discountBlockingWarning ? (
            <span className="po-pos-status-chip danger">{discountBlockingWarning}</span>
          ) : null}
          {productSelectionWarning ? (
            <span className="po-pos-status-chip bad">{productSelectionWarning}</span>
          ) : null}
          {duplicateWarning ? (
            <span className="po-pos-status-chip danger">{duplicateWarning}</span>
          ) : null}
        </div>

        <div className="po-pos-entry-lane">
          <label className="po-pos-field po-pos-field-search po-pos-field-primary po-pos-field-search-wide" htmlFor="po-pos-product-search">
            <span>Product Search</span>
            <ProductSearchCombobox
              inputId="po-pos-product-search"
              inputRef={productInputRef}
              value={activeItem.product_query || ''}
              onChange={onProductChange}
              onKeyDown={onProductKeyDown}
              onFocus={onProductFocus}
              placeholder="Type product name, SKU, or barcode"
              disabled={orderSubmitting}
              loading={productSearchLoading}
              results={visibleProductResults}
              activeIndex={activeProductSuggestionIndex}
              showRecentItems={showRecentProducts}
              selectedItem={activeProduct}
              hintContent={searchHint}
              resultsSummaryText={productResultSummary}
              noResultsText={canInlineCreateProduct
                ? 'No product found. Add it as a new product if needed.'
                : 'No product found. Keep typing or check the product code.'}
              getOptionKey={(product) => String(product?.id || '')}
              getOptionPrimaryText={(product) => product?.name || 'Product'}
              getOptionSecondaryText={(product) => getProductSearchMeta(product)}
              onSelect={(product) => onProductSuggestionPick(product, { focusQty: true })}
              onOptionHover={onProductSuggestionHover}
              footerAction={canInlineCreateProduct ? {
                label: `Add "${trimmedProductQuery}" as new product`,
                onClick: () => onCreateProductFromSearch(trimmedProductQuery),
                disabled: orderSubmitting,
              } : null}
              footerActionPosition="top"
            />
          </label>

          {inlineProductCreate?.open ? (
            <div className="po-pos-inline-create" aria-live="polite">
              <div className="po-pos-inline-create-header">
                <div>
                  <strong>Add Product Inline</strong>
                  <p>Create the missing product here and continue the same PO row.</p>
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
                    {inlineProductCreate.submitting ? 'Adding...' : 'Add Product'}
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

                <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-inline-price">
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

                <label className="po-pos-field po-pos-field-secondary po-pos-field-compact" htmlFor="po-pos-inline-uom">
                  <span>UOM</span>
                  <select
                    ref={inlineCreateUomRef}
                    id="po-pos-inline-uom"
                    value={inlineProductCreate.uom}
                    onChange={(event) => onInlineProductCreateChange('uom', event.target.value)}
                    onKeyDown={onInlineProductCreateKeyDown('uom')}
                    disabled={inlineProductCreate.submitting}
                  >
                    {Array.from(new Set([
                      ...(Array.isArray(activeUomOptions) ? activeUomOptions : []),
                      inlineProductCreate.uom || 'pcs',
                    ])).map((uomOption) => (
                      <option key={uomOption} value={uomOption}>{uomOption}</option>
                    ))}
                  </select>
                </label>
              </div>

              {inlineProductCreate.error ? (
                <p className="po-pos-inline-create-error">{inlineProductCreate.error}</p>
              ) : (
                <p className="po-pos-inline-create-note">
                  No modal. No confirm. Save the product inline, then continue with qty.
                </p>
              )}
            </div>
          ) : null}

          <div className={`po-pos-primary-grid${orderFullMode ? ' full' : ''}`}>
          <label className="po-pos-field po-pos-field-primary po-pos-field-qty" htmlFor="po-pos-qty">
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
              disabled={orderSubmitting}
            />
          </label>

          {orderFullMode ? (
            <label className="po-pos-field po-pos-field-primary po-pos-field-rate" htmlFor="po-pos-rate">
              <div className="po-pos-field-label-row">
                <span>Base Rate / {baseRateUnitLabel}</span>
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
                disabled={orderSubmitting}
              />
            </label>
          ) : (
            <div className="po-pos-stat-card readonly">
              <span>Base Rate / {baseRateUnitLabel}</span>
              <strong>{formatCurrency(activeLine?.rate || 0)}</strong>
            </div>
          )}
          </div>
        </div>
      </div>

      {orderFullMode ? (
        <div className="po-pos-field-stage secondary compact">
          <div className="po-pos-field-stage-header po-pos-field-stage-header-inline">
            <div>
              <span>Price Adjustments</span>
              <p>{shouldExposeDiscountControls ? 'Discount is affecting the final total. Review it before saving.' : 'Open only when UOM, GST, or discount need correction.'}</p>
            </div>
            <button
              type="button"
              className="po-pos-action-btn subtle po-pos-stage-toggle-btn"
              onClick={() => setShowAdvancedAdjustments((prev) => !prev)}
            >
              {showAdvancedAdjustments ? 'Hide adjustments' : (hasAdvancedAdjustments ? 'Review adjustments' : 'Adjust pricing')}
            </button>
          </div>
          {showAdvancedAdjustments ? (
            <div className="po-pos-entry-grid po-pos-entry-grid-secondary">
              <label className="po-pos-field po-pos-field-secondary po-pos-field-compact" htmlFor="po-pos-uom">
                <span>UOM</span>
                <select
                  ref={uomInputRef}
                  id="po-pos-uom"
                  value={activeLine?.uom || activeItem.uom}
                  onChange={(event) => onItemChange('uom', event.target.value)}
                  onKeyDown={onFieldKeyDown('uom')}
                  disabled={orderSubmitting}
                >
                  {activeUomOptions.map((uomOption) => (
                    <option key={uomOption} value={uomOption}>{uomOption}</option>
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
                  disabled={orderSubmitting}
                >
                  {GST_RATE_OPTIONS.map((rate) => (
                    <option key={rate} value={rate}>{rate}%</option>
                  ))}
                </select>
              </label>

              <label className="po-pos-field po-pos-field-secondary" htmlFor="po-pos-discount-type">
                <span>Discount Type</span>
                <select
                  id="po-pos-discount-type"
                  value={activeItem.discount_type || 'percent'}
                  onChange={(event) => onItemChange('discount_type', event.target.value)}
                  disabled={orderSubmitting}
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
                  disabled={orderSubmitting}
                />
              </label>
            </div>
          ) : (
            <div className="po-pos-adjustments-preview" aria-live="polite">
              <span>UOM: {displayUom}</span>
              <span>GST: {Number(activeLine?.gstRate || 0).toFixed(0)}%</span>
              <span>
                Discount: {discountAppliedAmount > 0
                  ? `${formatCurrency(discountAppliedAmount)} applied`
                  : 'none'}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="po-pos-field-stage readonly">
          <div className="po-pos-field-stage-header">
            <span>Quick View</span>
            <p>Reference values stay visible while entry remains focused on product and qty.</p>
          </div>
          <div className="po-pos-entry-grid po-pos-entry-grid-quick">
            <div className="po-pos-stat-card readonly">
              <span>GST</span>
              <strong>{Number(activeLine?.gstRate || 0).toFixed(0)}%</strong>
            </div>
          </div>
        </div>
      )}

      <div className="po-pos-summary-block" aria-live="polite">
        <div className="po-pos-summary-header">
          <span>Per Item Totals</span>
          <p>
            {discountAppliedAmount > 0
              ? `${formatCurrency(grossPerDisplayUnit)} gross / ${displayUom} -> ${formatCurrency(taxablePerDisplayUnit)} net / ${displayUom} | Current line total ${formatCurrency(activeLine?.totalAmount || 0)}`
              : 'Current line pricing is calculated automatically from the editable fields above.'}
          </p>
        </div>
        <div className="po-pos-line-summary">
          <div>
            <span>Gross / {displayUom}</span>
            <strong>{formatCurrency(grossPerDisplayUnit)}</strong>
          </div>
          <div>
            <span>Net / {displayUom}</span>
            <strong>{formatCurrency(taxablePerDisplayUnit)}</strong>
          </div>
          <div>
            <span>Effective / {displayUom}</span>
            <strong>{formatCurrency(effectivePerDisplayUnit)}</strong>
          </div>
          <div className="total">
            <span>Line Total</span>
            <strong>{formatCurrency(activeLine?.totalAmount || 0)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
};

export default memo(PurchaseOrderPosEntry);
