import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { billingApi } from '../../../../shared/services/api';
import useProductSearchCombobox from '../../../../shared/hooks/useProductSearchCombobox';
import WindowModal from '../../../../shared/components/window/WindowModal';
import PurchaseDistributorSelector from './PurchaseDistributorSelector';
import PurchaseOrderEntryControlPanel from './PurchaseOrderEntryControlPanel';
import PurchaseOrderPosEntry from './PurchaseOrderPosEntry';
import PurchaseOrderPosList from './PurchaseOrderPosList';
import PurchaseOrderSummaryPanel from './PurchaseOrderSummaryPanel';

const PRODUCT_SEARCH_SUGGESTION_LIMIT = 8;
const PRODUCT_SEARCH_MIN_CHARS = 2;
const createInlineProductCreateState = () => ({
  open: false,
  targetIndex: null,
  name: '',
  price: '',
  uom: 'pcs',
  error: '',
  submitting: false,
});

const getPreferredActiveIndex = (items = []) => {
  if (!Array.isArray(items) || !items.length) return 0;
  const draftIndex = items.findIndex((item) => !String(item?.product_query || '').trim() && !String(item?.product_id || '').trim());
  if (draftIndex >= 0) return draftIndex;
  return Math.max(0, items.length - 1);
};

export function PurchaseOrderFormModal({
  open,
  closeOrderForm,
  poModalRef,
  isMobile,
  poModalSize,
  editingOrderId,
  handleOrderSubmit,
  orderFullMode,
  setOrderFullMode,
  loadingDistributorItems,
  handleLoadDistributorItems,
  orderFormData,
  setOrderFormData,
  orderDraftProjection,
  handleDistributorInputChange,
  distributors,
  orderProductOptions,
  getAllowedPurchaseUnitsForProduct,
  getPurchasePackStep,
  handleOrderProductInputChange,
  handleOrderProductFieldFocus,
  handleOrderItemChange,
  GST_RATE_OPTIONS,
  toNumber,
  handleOrderItemRemove,
  handleOrderItemAdd,
  handleInlineProductCreate,
  orderTotals,
  orderSubmitting,
  inline = false,
}) {
  const [mobileStep, setMobileStep] = useState(0);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [productSearchMessage, setProductSearchMessage] = useState('');
  const productInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const uomInputRef = useRef(null);
  const rateInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const gstInputRef = useRef(null);
  const inlineCreateNameRef = useRef(null);
  const inlineCreatePriceRef = useRef(null);
  const inlineCreateUomRef = useRef(null);
  const [inlineProductCreate, setInlineProductCreate] = useState(createInlineProductCreateState);

  const items = Array.isArray(orderFormData?.items) ? orderFormData.items : [];
  const draftProjection = orderDraftProjection || {
    rows: [],
    diagnostics: {
      rowDiagnostics: [],
      hasDuplicateErrors: false,
      hasRateConfirmationErrors: false,
      hasDiscountErrors: false,
      hasDiscountConfirmationErrors: false,
      blockingMessage: '',
      rateWarningCount: 0,
      rateConfirmationCount: 0,
      rateAcknowledgedCount: 0,
      discountWarningCount: 0,
      discountConfirmationCount: 0,
      discountAcknowledgedCount: 0,
    },
    totals: orderTotals,
  };
  const resolvedActiveItemIndex = items[activeItemIndex] ? activeItemIndex : 0;
  const activeRow = draftProjection.rows[resolvedActiveItemIndex] || null;
  const activeItem = activeRow?.item || null;
  const activeProduct = activeRow?.product || null;
  const activeLine = activeRow?.line || null;
  const activeUomOptions = getAllowedPurchaseUnitsForProduct(activeProduct);
  const activeDistributors = distributors.filter((distributor) => distributor.status === 'active');
  const canLoadDistributorItems = Boolean(String(orderFormData.distributor_id || '').trim());
  const draftDiagnostics = draftProjection.diagnostics;
  const activeRowDiagnostics = draftDiagnostics.rowDiagnostics[resolvedActiveItemIndex] || {};
  const prioritizedProductIds = useMemo(() => new Set(
    (Array.isArray(orderProductOptions?.prioritized) ? orderProductOptions.prioritized : [])
      .map((product) => String(product?.id || '').trim())
      .filter(Boolean)
  ), [orderProductOptions?.prioritized]);
  const searchPurchaseProducts = useCallback((query, options = {}) =>
    billingApi.searchProducts(query, undefined, options), []);
  const productSearchLocalProducts = useMemo(() => [
    ...(Array.isArray(orderProductOptions?.prioritized) ? orderProductOptions.prioritized : []),
    ...(Array.isArray(orderProductOptions?.all) ? orderProductOptions.all : []),
  ], [
    orderProductOptions?.all,
    orderProductOptions?.prioritized,
  ]);
  const recentProductPool = useMemo(() => {
    const prioritized = Array.isArray(orderProductOptions?.prioritized) ? orderProductOptions.prioritized : [];
    if (prioritized.length > 0) {
      return prioritized;
    }
    return productSearchLocalProducts;
  }, [orderProductOptions?.prioritized, productSearchLocalProducts]);
  const recentProducts = useMemo(
    () => recentProductPool.slice(0, PRODUCT_SEARCH_SUGGESTION_LIMIT),
    [recentProductPool]
  );
  const {
    searchResults: productSearchResults,
    searchLoading: productSearchLoading,
    activeIndex: activeProductSuggestionIndex,
    setActiveIndex: setActiveProductSuggestionIndex,
    hasExplicitChoice: hasExplicitSuggestionChoice,
    setHasExplicitChoice: setHasExplicitSuggestionChoice,
    resolveExactMatch: resolveExactProductMatch,
    resolveHighlightedProduct,
    clearSearchState,
  } = useProductSearchCombobox({
    query: activeItem?.product_query || '',
    selectedProductId: activeItem?.product_id || '',
    localProducts: productSearchLocalProducts,
    searchProducts: searchPurchaseProducts,
    suggestionLimit: PRODUCT_SEARCH_SUGGESTION_LIMIT,
    minChars: PRODUCT_SEARCH_MIN_CHARS,
  });
  const trimmedProductQuery = String(activeItem?.product_query || '').trim();
  const showRecentProducts = !trimmedProductQuery;
  const visibleProductResults = useMemo(() => {
    if (showRecentProducts) {
      return recentProducts.slice(0, PRODUCT_SEARCH_SUGGESTION_LIMIT);
    }
    return productSearchResults.slice(0, PRODUCT_SEARCH_SUGGESTION_LIMIT);
  }, [productSearchResults, recentProducts, showRecentProducts]);
  const productResultSummary = useMemo(() => {
    if (showRecentProducts) {
      if (!recentProductPool.length) return 'No recent products yet.';
      return `Showing ${Math.min(visibleProductResults.length, recentProductPool.length)} of ${recentProductPool.length} recent products.`;
    }
    if (productSearchLoading) return '';
    if (!trimmedProductQuery) return '';
    if (!productSearchResults.length) return 'No matching products yet.';
    return `Showing ${Math.min(visibleProductResults.length, productSearchResults.length)} of ${productSearchResults.length} matching products.`;
  }, [
    productSearchLoading,
    productSearchResults.length,
    recentProductPool.length,
    showRecentProducts,
    trimmedProductQuery,
    visibleProductResults.length,
  ]);
  const requiresExplicitSuggestionChoice = Boolean(
    trimmedProductQuery
    && !showRecentProducts
    && productSearchResults.length > 1
    && !hasExplicitSuggestionChoice
    && !String(activeItem?.product_id || '').trim()
  );
  const canInlineCreateProduct = Boolean(
    trimmedProductQuery
    && trimmedProductQuery.length >= PRODUCT_SEARCH_MIN_CHARS
    && !showRecentProducts
    && !productSearchLoading
    && productSearchResults.length === 0
    && !String(activeItem?.product_id || '').trim()
  );
  const productSelectionWarning = productSearchMessage || (
    trimmedProductQuery && !String(activeItem?.product_id || '').trim()
      ? (canInlineCreateProduct
          ? 'No product found. Add it as a new product if needed.'
          : 'Pick a product from search results before continuing.')
      : ''
  );
  const getProductSearchMeta = useCallback((product) => {
    const parts = [];
    if (String(product?.sku || '').trim()) {
      parts.push(`SKU: ${String(product.sku).trim()}`);
    }
    if (String(product?.brand || '').trim()) {
      parts.push(String(product.brand).trim());
    }
    if (prioritizedProductIds.has(String(product?.id || '').trim())) {
      parts.push('Recent distributor match');
    }
    return parts.join(' | ');
  }, [prioritizedProductIds]);
  const formTitle = editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order';
  const formSubtitle = 'POS-style purchase entry with one active row and a live PO list.';
  const closeButtonLabel = inline ? 'Reset Form' : 'Cancel';

  const focusField = useCallback((field = 'product', select = false) => {
    const refs = {
      product: productInputRef.current,
      qty: qtyInputRef.current,
      uom: uomInputRef.current,
      rate: rateInputRef.current,
      discount: discountInputRef.current,
      gst: gstInputRef.current,
    };
    const target = refs[field];
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.focus();
      if (select && typeof target.select === 'function') target.select();
    });
  }, []);

  const focusInlineCreateField = useCallback((field = 'name', select = false) => {
    const refs = {
      name: inlineCreateNameRef.current,
      price: inlineCreatePriceRef.current,
      uom: inlineCreateUomRef.current,
    };
    const target = refs[field];
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.focus();
      if (select && typeof target.select === 'function') target.select();
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setMobileStep(0);
    setActiveItemIndex(getPreferredActiveIndex(items));
    setProductSearchMessage('');
    setInlineProductCreate(createInlineProductCreateState());
    const frameId = window.requestAnimationFrame(() => focusField('product'));
    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    setProductSearchMessage('');
  }, [activeItem?.product_id, activeItem?.product_query, resolvedActiveItemIndex]);

  useEffect(() => {
    if (!open) return;
    if (!items.length) {
      setActiveItemIndex(0);
      return;
    }
    if (resolvedActiveItemIndex !== activeItemIndex) {
      setActiveItemIndex(resolvedActiveItemIndex);
    }
  }, [activeItemIndex, items.length, open, resolvedActiveItemIndex]);

  const handleSelectRow = (index) => {
    setInlineProductCreate(createInlineProductCreateState());
    setActiveItemIndex(index);
    handleOrderProductFieldFocus(index);
    if (isMobile) setMobileStep(1);
    focusField('product');
  };

  const handleAddRow = () => {
    const nextIndex = items.length;
    setInlineProductCreate(createInlineProductCreateState());
    handleOrderItemAdd();
    setActiveItemIndex(nextIndex);
    if (isMobile) setMobileStep(1);
    focusField('product');
  };

  const handleRemoveRow = (index = resolvedActiveItemIndex) => {
    const nextIndex = Math.max(0, Math.min(index, items.length - 2));
    setInlineProductCreate(createInlineProductCreateState());
    handleOrderItemRemove(index);
    setActiveItemIndex(nextIndex);
    focusField('product');
  };

  const handleNextRow = () => {
    const nextIndex = resolvedActiveItemIndex + 1;
    setInlineProductCreate(createInlineProductCreateState());
    if (nextIndex >= items.length) {
      handleOrderItemAdd();
      setActiveItemIndex(nextIndex);
    } else {
      setActiveItemIndex(nextIndex);
    }
    focusField('product');
  };

  const openInlineProductCreate = useCallback((draftName = '') => {
    const resolvedName = String(draftName || activeItem?.product_query || '').trim();
    const resolvedRate = Number(activeItem?.rate ?? activeItem?.unit_price ?? 0);
    const resolvedUom = String(
      activeItem?.uom
      || activeLine?.uom
      || activeProduct?.base_unit
      || activeProduct?.uom
      || 'pcs'
    ).trim() || 'pcs';
    setInlineProductCreate({
      open: true,
      targetIndex: resolvedActiveItemIndex,
      name: resolvedName,
      price: resolvedRate > 0 ? String(resolvedRate) : '',
      uom: resolvedUom,
      error: '',
      submitting: false,
    });
    setProductSearchMessage('');
    focusInlineCreateField(resolvedRate > 0 ? 'price' : 'name', true);
  }, [
    activeItem?.product_query,
    activeItem?.rate,
    activeItem?.unit_price,
    activeItem?.uom,
    activeLine?.uom,
    activeProduct?.base_unit,
    activeProduct?.uom,
    resolvedActiveItemIndex,
  ]);

  const closeInlineProductCreate = useCallback((focusTarget = null) => {
    setInlineProductCreate(createInlineProductCreateState());
    if (focusTarget) {
      focusField(focusTarget, focusTarget !== 'product');
    }
  }, []);

  const handleInlineProductCreateChange = useCallback((field, value) => {
    setInlineProductCreate((prev) => ({
      ...prev,
      [field]: value,
      error: '',
    }));
  }, []);

  const handleInlineProductCreateSubmit = useCallback(async () => {
    if (!inlineProductCreate.open || inlineProductCreate.submitting) return;

    const trimmedName = String(inlineProductCreate.name || '').trim();
    const resolvedPrice = Number(inlineProductCreate.price || 0);
    const resolvedUom = String(inlineProductCreate.uom || '').trim() || 'pcs';

    if (!trimmedName) {
      setInlineProductCreate((prev) => ({ ...prev, error: 'Product name is required.' }));
      focusInlineCreateField('name', true);
      return;
    }
    if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
      setInlineProductCreate((prev) => ({ ...prev, error: 'Enter a valid rate before adding the new product.' }));
      focusInlineCreateField('price', true);
      return;
    }

    setInlineProductCreate((prev) => ({ ...prev, submitting: true, error: '' }));

    try {
      await handleInlineProductCreate({
        targetIndex: inlineProductCreate.targetIndex,
        name: trimmedName,
        price: resolvedPrice,
        uom: resolvedUom,
      });
      clearSearchState();
      setHasExplicitSuggestionChoice(false);
      setProductSearchMessage('');
      setInlineProductCreate(createInlineProductCreateState());
      focusField('qty', true);
    } catch (err) {
      setInlineProductCreate((prev) => ({
        ...prev,
        submitting: false,
        error: err?.message || 'Failed to add product.',
      }));
      focusInlineCreateField('name', true);
    }
  }, [
    clearSearchState,
    handleInlineProductCreate,
    inlineProductCreate,
    setHasExplicitSuggestionChoice,
  ]);

  const handleInlineProductCreateKeyDown = useCallback((field) => (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeInlineProductCreate('product');
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (field === 'name') {
      focusInlineCreateField('price', true);
      return;
    }
    if (field === 'price') {
      focusInlineCreateField('uom');
      return;
    }
    void handleInlineProductCreateSubmit();
  }, [closeInlineProductCreate, handleInlineProductCreateSubmit]);

  const handleProductChange = (value) => {
    handleOrderProductFieldFocus(resolvedActiveItemIndex);
    handleOrderProductInputChange(resolvedActiveItemIndex, value);
    setHasExplicitSuggestionChoice(false);
    setProductSearchMessage('');
    setInlineProductCreate((prev) => (prev.open
      ? {
          ...prev,
          name: String(value || '').trim(),
          error: '',
        }
      : prev));
  };

  const handleProductFocus = () => {
    handleOrderProductFieldFocus(resolvedActiveItemIndex);
    setProductSearchMessage('');
  };

  const handleSelectSuggestedProduct = (product, { focusQty = false } = {}) => {
    if (!product) return false;
    handleOrderItemChange(resolvedActiveItemIndex, 'product_id', String(product.id));
    clearSearchState();
    setProductSearchMessage('');
    setInlineProductCreate(createInlineProductCreateState());
    if (focusQty) {
      focusField('qty', true);
    }
    return true;
  };

  const handleItemChange = (field, value) => {
    handleOrderItemChange(resolvedActiveItemIndex, field, field === 'gst_rate' ? toNumber(value) : value);
  };

  const handleConfirmDiscountWarning = () => {
    if (!activeItem) return;
    handleOrderItemChange(resolvedActiveItemIndex, 'discount_warning_acknowledged', true);
  };

  const handleConfirmRateWarning = () => {
    if (!activeItem) return;
    handleOrderItemChange(resolvedActiveItemIndex, 'rate_warning_acknowledged', true);
  };

  const handleProductKeyDown = (event) => {
    const query = String(activeItem?.product_query || '').trim();
    const normalizedSelectedProductId = String(activeItem?.product_id || '').trim();
    const highlightedProduct = resolveHighlightedProduct(activeItem?.product_query, productSearchResults);
    const exactMatch = resolveExactProductMatch(activeItem?.product_query, productSearchResults);
    const exactCodeMatch = exactMatch && [
      String(exactMatch?.sku || '').trim().toLowerCase(),
      String(exactMatch?.barcode || '').trim().toLowerCase(),
    ].includes(query.toLowerCase());

    const handleSearchEnter = async () => {
      if (exactCodeMatch) {
        handleSelectSuggestedProduct(exactMatch, { focusQty: true });
        return;
      }

      if (productSearchResults.length === 1 && highlightedProduct) {
        handleSelectSuggestedProduct(highlightedProduct, { focusQty: true });
        return;
      }

      if (productSearchResults.length > 1) {
        if (hasExplicitSuggestionChoice && highlightedProduct) {
          handleSelectSuggestedProduct(highlightedProduct, { focusQty: true });
          return;
        }
        setProductSearchMessage('Multiple products found. Use Arrow keys or click to select the correct item.');
        return;
      }

      if (normalizedSelectedProductId) {
        focusField('qty', true);
        return;
      }

      if (query) {
        if (canInlineCreateProduct) {
          openInlineProductCreate(query);
          return;
        }
        if (productSearchLoading) {
          setProductSearchMessage('Searching products. Press Enter again when results appear.');
          return;
        }
        setProductSearchMessage('Pick a product from search results before continuing.');
      }
    };

    if (event.key === 'ArrowDown') {
      if (!productSearchResults.length) return;
      event.preventDefault();
      setHasExplicitSuggestionChoice(true);
      setProductSearchMessage('');
      setActiveProductSuggestionIndex((prev) => Math.min(prev + 1, productSearchResults.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!productSearchResults.length) return;
      event.preventDefault();
      setHasExplicitSuggestionChoice(true);
      setProductSearchMessage('');
      setActiveProductSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Escape') {
      setProductSearchMessage('');
      return;
    }
    if (
      (event.key === 'Tab' || event.key === 'ArrowRight')
      && !event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !normalizedSelectedProductId
      && query
    ) {
      if (productSearchResults.length > 1 && !hasExplicitSuggestionChoice) {
        event.preventDefault();
        setProductSearchMessage('Multiple products found. Use Arrow keys or click to select the correct item.');
        return;
      }
      if (!highlightedProduct) return;
      event.preventDefault();
      handleSelectSuggestedProduct(highlightedProduct, { focusQty: true });
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void handleSearchEnter();
  };

  const handleFieldKeyDown = (field) => (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (field === 'qty') {
      if (!String(activeItem?.product_id || '').trim()) {
        focusField('product');
        return;
      }
      const currentRate = Number(activeItem?.rate ?? activeItem?.unit_price ?? 0);
      if (orderFullMode && (event.shiftKey || currentRate <= 0)) {
        focusField('rate', true);
        return;
      }
      handleNextRow();
      return;
    }
    if (field === 'uom') {
      focusField(orderFullMode ? 'rate' : 'qty', orderFullMode);
      return;
    }
    if (field === 'rate') {
      handleNextRow();
      return;
    }
    if (field === 'discount') {
      handleNextRow();
      return;
    }
    if (field === 'gst') {
      handleNextRow();
    }
  };

  if (!open) return null;

  const content = (
    <div ref={poModalRef} className={inline ? 'po-entry-inline-shell' : ''} style={isMobile ? undefined : { width: '100%', height: '100%' }}>
      {isMobile ? (
        <div className="po-mobile-stepper" role="tablist" aria-label="Purchase order steps">
          <button type="button" className={`po-mobile-step-btn${mobileStep === 0 ? ' active' : ''}`} onClick={() => setMobileStep(0)}>Basics</button>
          <button type="button" className={`po-mobile-step-btn${mobileStep === 1 ? ' active' : ''}`} onClick={() => setMobileStep(1)}>Entry</button>
          <button type="button" className={`po-mobile-step-btn${mobileStep === 2 ? ' active' : ''}`} onClick={() => setMobileStep(2)}>Review</button>
        </div>
      ) : null}

      <form onSubmit={handleOrderSubmit} className={`po-entry-form po-entry-view-form${isMobile ? ' mobile-step-mode' : ''}`} noValidate>
        <div className="po-invoice-preview po-entry-preview">
          <div className="po-invoice-header po-entry-preview-header">
            <div>
              <h3>{editingOrderId ? `PO Edit ${editingOrderId ? `#${editingOrderId}` : ''}` : 'New Purchase Order'}</h3>
              <p>{orderFullMode ? 'Full mode keeps tax and discount controls inside the active POS row.' : 'Quick mode keeps the PO fast with one active row at a time.'}</p>
            </div>
            <div className="po-entry-toolbar">
              <label
                className="po-entry-full-toggle"
                title="Full Mode: show all PO fields inside the active row."
                aria-label="Full Mode: show all PO fields inside the active row."
              >
                <input id="po-entry-full-mode" name="full_mode" type="checkbox" checked={orderFullMode} onChange={(event) => setOrderFullMode(event.target.checked)} />
                <span>Full Mode</span>
              </label>
              <button
                type="button"
                className="po-icon-action-btn"
                onClick={handleLoadDistributorItems}
                disabled={!canLoadDistributorItems || loadingDistributorItems}
                title="Load: import recent items for the selected distributor into this draft PO."
                aria-label="Load recent items for the selected distributor into this draft purchase order"
              >
                {loadingDistributorItems ? '...' : 'Load Items'}
              </button>
              <button type="button" className="po-icon-action-btn" onClick={handleAddRow} title="Add row">
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className={`po-party-grid po-entry-header-grid po-mobile-panel${!isMobile || mobileStep === 0 ? ' active' : ''}`}>
            <PurchaseDistributorSelector
              activeDistributors={activeDistributors}
              orderFormData={orderFormData}
              handleDistributorInputChange={handleDistributorInputChange}
              setOrderFormData={setOrderFormData}
            />

            <PurchaseOrderEntryControlPanel
              items={items}
              resolvedActiveItemIndex={resolvedActiveItemIndex}
              orderTotals={orderTotals}
              draftDiagnostics={draftDiagnostics}
              orderFullMode={orderFullMode}
              orderFormData={orderFormData}
              setOrderFormData={setOrderFormData}
            />
          </div>

          <div className={`po-entry-table-shell po-mobile-panel${!isMobile || mobileStep === 1 ? ' active' : ''}`}>
            <div className="po-pos-layout">
              <PurchaseOrderPosEntry
                activeItem={activeItem}
                activeItemIndex={resolvedActiveItemIndex}
                activeLine={activeLine}
                activeProduct={activeProduct}
                activeUomOptions={activeUomOptions}
                orderFullMode={orderFullMode}
                getProductSearchMeta={getProductSearchMeta}
                getPurchasePackStep={getPurchasePackStep}
                GST_RATE_OPTIONS={GST_RATE_OPTIONS}
                draftWarning={activeRowDiagnostics.rateWarningMessage}
                rateChangeLabel={activeRowDiagnostics.rateChangeLabel}
                rateChangeTone={activeRowDiagnostics.rateChangeTone}
                rateNeedsConfirmation={activeRowDiagnostics.rateRequiresAcknowledgement}
                rateConfirmedLabel={activeRowDiagnostics.rateAcknowledgedLabel}
                rateConfirmationWarning={activeRowDiagnostics.rateAcknowledgementMessage}
                discountWarning={activeRowDiagnostics.discountWarningMessage}
                discountBlockingWarning={activeRowDiagnostics.discountBlockingMessage}
                discountNeedsConfirmation={activeRowDiagnostics.discountRequiresAcknowledgement}
                discountConfirmedLabel={activeRowDiagnostics.discountAcknowledgedLabel}
                duplicateWarning={activeRowDiagnostics.duplicateMessage}
                productSelectionWarning={productSelectionWarning}
                orderSubmitting={orderSubmitting}
                visibleProductResults={visibleProductResults}
                productResultSummary={productResultSummary}
                showRecentProducts={showRecentProducts}
                productSearchLoading={productSearchLoading}
                activeProductSuggestionIndex={activeProductSuggestionIndex}
                requiresExplicitSuggestionChoice={requiresExplicitSuggestionChoice}
                productInputRef={productInputRef}
                qtyInputRef={qtyInputRef}
                uomInputRef={uomInputRef}
                rateInputRef={rateInputRef}
                discountInputRef={discountInputRef}
                gstInputRef={gstInputRef}
                inlineCreateNameRef={inlineCreateNameRef}
                inlineCreatePriceRef={inlineCreatePriceRef}
                inlineCreateUomRef={inlineCreateUomRef}
                inlineProductCreate={inlineProductCreate}
                onAddRow={handleAddRow}
                onProductChange={handleProductChange}
                onProductFocus={handleProductFocus}
                onProductKeyDown={handleProductKeyDown}
                onProductSuggestionHover={setActiveProductSuggestionIndex}
                onProductSuggestionPick={handleSelectSuggestedProduct}
                canInlineCreateProduct={canInlineCreateProduct}
                onCreateProductFromSearch={openInlineProductCreate}
                onInlineProductCreateChange={handleInlineProductCreateChange}
                onInlineProductCreateSubmit={handleInlineProductCreateSubmit}
                onInlineProductCreateCancel={closeInlineProductCreate}
                onInlineProductCreateKeyDown={handleInlineProductCreateKeyDown}
                onItemChange={handleItemChange}
                onConfirmRateWarning={handleConfirmRateWarning}
                onConfirmDiscountWarning={handleConfirmDiscountWarning}
                onFieldKeyDown={handleFieldKeyDown}
              />

              <PurchaseOrderPosList
                rows={draftProjection.rows}
                activeItemIndex={resolvedActiveItemIndex}
                orderTotals={orderTotals}
                orderFullMode={orderFullMode}
                draftDiagnostics={draftDiagnostics}
                onSelectItem={handleSelectRow}
                onRemoveItem={handleRemoveRow}
              />
            </div>
          </div>
        </div>

        <div className={`form-section po-form-section po-form-footer po-mobile-panel${!isMobile || mobileStep === 2 ? ' active' : ''}`}>
          <PurchaseOrderSummaryPanel orderFullMode={orderFullMode} orderTotals={orderTotals} />
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closeOrderForm}>{closeButtonLabel}</button>
            <button type="submit" className="submit-btn" disabled={orderSubmitting}>{orderSubmitting ? 'Saving...' : (editingOrderId ? 'Update Order' : 'Create Order')}</button>
          </div>
        </div>

        {isMobile ? (
          <div className="po-mobile-step-footer">
            <button type="button" className="cancel-btn" onClick={mobileStep === 0 ? closeOrderForm : () => setMobileStep((prev) => Math.max(prev - 1, 0))}>{mobileStep === 0 ? closeButtonLabel : 'Back'}</button>
            {mobileStep < 2 ? (
              <button type="button" className="submit-btn" onClick={() => setMobileStep((prev) => Math.min(prev + 1, 2))}>Next</button>
            ) : (
              <button type="submit" className="submit-btn" disabled={orderSubmitting}>{orderSubmitting ? 'Saving...' : (editingOrderId ? 'Update Order' : 'Create Order')}</button>
            )}
          </div>
        ) : null}
      </form>
    </div>
  );

  if (inline) {
    return (
      <section className="po-entry-inline-surface" aria-label={formTitle}>
        <div className="po-entry-inline-banner">
          <div>
            <h2>{formTitle}</h2>
            <p>{formSubtitle}</p>
          </div>
        </div>
        {content}
      </section>
    );
  }

  return (
    <WindowModal
      open={open}
      title={formTitle}
      subtitle={formSubtitle}
      onClose={closeOrderForm}
      dismissible={!orderSubmitting}
      themeClassName="purchase-management"
      dialogClassName="purchase-modal-frame large po-form-modal po-entry-view-modal"
      headerClassName="purchase-modal-header"
      closeButtonClassName="purchase-modal-close-btn"
      initialSize={{ width: Math.min(poModalSize.width, 1080), height: 820 }}
      minWidth={720}
      minHeight={520}
      minimizable={!isMobile}
      maximizable={!isMobile}
      draggable={!isMobile}
      resizable={!isMobile}
    >
      {content}
    </WindowModal>
  );
}
