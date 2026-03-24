import React, { memo, useEffect, useMemo, useState } from 'react';
import { CreditCard, Search, ShoppingCart } from 'lucide-react';
import UserEditModal from '../../../../shared/components/UserEditModal';
import BillingBillList from './BillingBillList';
import BillingPaymentPanel from './BillingPaymentPanel';
import BillingProductForm from './BillingProductForm';
import BillingSummary from './BillingSummary';

const BillingTabView = ({
  isMobile,
  loading,
  error,
  prefillSummary,
  isOrderLinked,
  isSubmitting,
  currentItem,
  currentProduct,
  pendingProductSelectionReview,
  isManualPrice,
  isEntryActionLocked,
  productSearchMessage,
  hasExplicitSuggestionChoice,
  currentUnitOptions,
  productSearchInputRef,
  priceInputRef,
  qtyInputRef,
  unitInputRef,
  discountInputRef,
  submitButtonRef,
  productSearchResults,
  recentProducts,
  productSearchLoading,
  activeProductSuggestionIndex,
  getProductOptionLabel,
  handleCurrentItemChange,
  handleProductSearchKeyDown,
  handleEntryFieldKeyDown,
  handleSelectSearchProduct,
  handleStartCustomItem,
  handleCommitCurrentItem,
  handleCancelEdit,
  lowStockWarning,
  billDisplayItems,
  editIndex,
  selectedBillIndex,
  latestAddedItemId,
  lastRemovedItem,
  handleSelectBillItem,
  handleDeleteBillItem,
  handleUndoLastRemoval,
  activeLineItemsCount,
  subtotalAmount,
  totalDiscount,
  totalBill,
  pricingPreviewLoading,
  pricingPreviewError,
  paidClamped,
  creditAmount,
  paidAmountWarning,
  paymentStatusLabel,
  customer,
  customersList,
  handleCustomerChange,
  handleAddCustomer,
  fulfillmentMode,
  setFulfillmentMode,
  createBillConfirmationOpen,
  clearBillConfirmationOpen,
  paidAmount,
  setPaidAmount,
  selectedPaymentMethod,
  effectivePaymentMethod,
  setSelectedPaymentMethod,
  handleSelectCashPayment,
  handleSelectUpiPayment,
  handleSelectCreditPayment,
  onClear,
  onCancelCreateBill,
  onCancelClearBill,
  handleCreateBill,
  lastShareText,
  lastShareNumber,
  handleCopyShare,
  handleSendWhatsApp,
  showCustomerCreateModal,
  handleCustomerModalClose,
  handleCustomerModalSave,
  customerCreateName,
}) => {
  const [mobileView, setMobileView] = useState('search');

  useEffect(() => {
    if (!isMobile) {
      setMobileView('search');
    }
  }, [isMobile]);

  const showRecentProducts = !String(currentItem?.name || '').trim();
  const visibleEntryResults = useMemo(() => {
    if (showRecentProducts) {
      return recentProducts.slice(0, 8);
    }
    return productSearchResults.slice(0, 8);
  }, [productSearchResults, recentProducts, showRecentProducts]);
  const productResultSummary = useMemo(() => {
    if (showRecentProducts) {
      if (!recentProducts.length) return 'No recent products yet.';
      return `Showing ${Math.min(visibleEntryResults.length, recentProducts.length)} of ${recentProducts.length} recent products.`;
    }
    if (productSearchLoading) return '';
    const trimmedName = String(currentItem?.name || '').trim();
    if (!trimmedName) return '';
    if (!productSearchResults.length) return 'No matching products yet.';
    return `Showing ${Math.min(visibleEntryResults.length, productSearchResults.length)} of ${productSearchResults.length} matching products.`;
  }, [
    currentItem?.name,
    productSearchLoading,
    productSearchResults.length,
    recentProducts.length,
    showRecentProducts,
    visibleEntryResults.length,
  ]);
  const showCustomItemAction = Boolean(
    String(currentItem?.name || '').trim()
    && !currentProduct
    && !productSearchLoading
  );
  const requiresExplicitSuggestionChoice = Boolean(
    String(currentItem?.name || '').trim()
    && !showRecentProducts
    && productSearchResults.length > 1
    && !hasExplicitSuggestionChoice
    && !currentProduct
  );

  const handleMobilePrimaryAction = () => {
    if (mobileView === 'search') {
      setMobileView('cart');
      return;
    }
    if (mobileView === 'cart') {
      setMobileView('checkout');
      return;
    }
    handleCreateBill();
  };

  return (
    <div className={`billing-content${isMobile ? ' billing-content-mobile' : ''}`}>
      <div className="billing-header">
        <div>
          <h1>Retail POS Billing</h1>
          <p className="billing-header-copy">
            Keyboard-first billing with one-item entry, live bill updates, and inline correction.
          </p>
        </div>
        <div className="billing-header-actions">
          <div className="billing-header-chip">
            <span>Items</span>
            <strong>{activeLineItemsCount}</strong>
          </div>
          <div className="billing-header-chip">
            <span>Total</span>
            <strong>Rs {Number(totalBill || 0).toFixed(2)}</strong>
          </div>
          <div className="billing-header-chip">
            <span>Due</span>
            <strong>Rs {Number(creditAmount || 0).toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {prefillSummary ? <div className="billing-prefill-note">{prefillSummary}</div> : null}
      {isOrderLinked ? (
        <div className="billing-prefill-note">
          Linked order mode is active. You can still edit line items and complete the bill inline.
        </div>
      ) : null}
      {pricingPreviewLoading ? (
        <div className="billing-prefill-note">Refreshing offer pricing for the current bill...</div>
      ) : null}
      {pricingPreviewError ? (
        <div className="billing-prefill-note">{pricingPreviewError}</div>
      ) : null}

      {error ? (
        <div className="error-message" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="billing-loading-shell" role="status" aria-live="polite">
          <div className="billing-loading-shell__copy">
            <strong>Loading billing data...</strong>
            <span>Preparing products, customers, and billing shortcuts.</span>
          </div>
          <div className="billing-loading-shell__grid" aria-hidden="true">
            <span className="billing-loading-shell__card billing-loading-shell__card--wide" />
            <span className="billing-loading-shell__card" />
            <span className="billing-loading-shell__card" />
          </div>
        </div>
      ) : null}

      {isMobile ? (
        <div className="billing-mobile-stepper" role="tablist" aria-label="Billing steps">
          <button
            type="button"
            className={`billing-mobile-step${mobileView === 'search' ? ' active' : ''}`}
            onClick={() => setMobileView('search')}
          >
            <Search size={16} />
            Entry
          </button>
          <button
            type="button"
            className={`billing-mobile-step${mobileView === 'cart' ? ' active' : ''}`}
            onClick={() => setMobileView('cart')}
          >
            <ShoppingCart size={16} />
            Bill
          </button>
          <button
            type="button"
            className={`billing-mobile-step${mobileView === 'checkout' ? ' active' : ''}`}
            onClick={() => setMobileView('checkout')}
          >
            <CreditCard size={16} />
            Checkout
          </button>
        </div>
      ) : null}

      <div className={`billing-pos-layout${isMobile ? ' billing-pos-layout-mobile' : ''}`}>
        <div className={`billing-pos-left${isMobile ? ` billing-mobile-panel ${mobileView === 'search' ? 'active' : ''}` : ''}`}>
          <BillingProductForm
            currentItem={currentItem}
            currentProduct={currentProduct}
            pendingProductSelectionReview={pendingProductSelectionReview}
            isManualPrice={isManualPrice}
            isEntryActionLocked={isEntryActionLocked}
            productSearchMessage={productSearchMessage}
            requiresExplicitSuggestionChoice={requiresExplicitSuggestionChoice}
            showCustomItemAction={showCustomItemAction}
            currentUnitOptions={currentUnitOptions}
            isEditing={editIndex !== null}
            isSubmitting={isSubmitting}
            productSearchInputRef={productSearchInputRef}
            priceInputRef={priceInputRef}
            qtyInputRef={qtyInputRef}
            unitInputRef={unitInputRef}
            discountInputRef={discountInputRef}
            submitButtonRef={submitButtonRef}
            visibleProductResults={visibleEntryResults}
            productResultSummary={productResultSummary}
            showRecentProducts={showRecentProducts}
            productSearchLoading={productSearchLoading}
            activeProductSuggestionIndex={activeProductSuggestionIndex}
            getProductOptionLabel={getProductOptionLabel}
            onFieldChange={handleCurrentItemChange}
            onSearchKeyDown={handleProductSearchKeyDown}
            onFieldKeyDown={handleEntryFieldKeyDown}
            onSelectProduct={handleSelectSearchProduct}
            onStartCustomItem={handleStartCustomItem}
            onSubmitItem={handleCommitCurrentItem}
            onCancelEdit={handleCancelEdit}
            lowStockWarning={lowStockWarning}
          />
        </div>

        <div className={`billing-pos-right${isMobile ? ` billing-mobile-panel ${mobileView === 'cart' ? 'active' : ''}` : ''}`}>
          <BillingBillList
            billItems={billDisplayItems}
            editIndex={editIndex}
            selectedBillIndex={selectedBillIndex}
            latestAddedItemId={latestAddedItemId}
            lastRemovedItem={lastRemovedItem}
            onSelectItem={handleSelectBillItem}
            onDeleteItem={handleDeleteBillItem}
            onUndoLastRemoval={handleUndoLastRemoval}
          />
        </div>

        <div className={`billing-pos-footer${isMobile ? ` billing-mobile-panel ${mobileView === 'checkout' ? 'active' : ''}` : ''}`}>
          <BillingSummary
            activeLineItemsCount={activeLineItemsCount}
            subtotalAmount={subtotalAmount}
            totalDiscount={totalDiscount}
            totalBill={totalBill}
            paidClamped={paidClamped}
            creditAmount={creditAmount}
            paymentStatusLabel={paymentStatusLabel}
          />
          <BillingPaymentPanel
            isOrderLinked={isOrderLinked}
            isSubmitting={isSubmitting}
            customer={customer}
            customersList={customersList}
            handleCustomerChange={handleCustomerChange}
            handleAddCustomer={handleAddCustomer}
            fulfillmentMode={fulfillmentMode}
            setFulfillmentMode={setFulfillmentMode}
            activeLineItemsCount={activeLineItemsCount}
            totalBill={totalBill}
            paidClamped={paidClamped}
            paidAmount={paidAmount}
            setPaidAmount={setPaidAmount}
            creditAmount={creditAmount}
            paidAmountWarning={paidAmountWarning}
            selectedPaymentMethod={selectedPaymentMethod}
            effectivePaymentMethod={effectivePaymentMethod}
            setSelectedPaymentMethod={setSelectedPaymentMethod}
            createBillConfirmationOpen={createBillConfirmationOpen}
            clearBillConfirmationOpen={clearBillConfirmationOpen}
            handleSelectCashPayment={handleSelectCashPayment}
            handleSelectUpiPayment={handleSelectUpiPayment}
            handleSelectCreditPayment={handleSelectCreditPayment}
            onClear={onClear}
            onCancelCreateBill={onCancelCreateBill}
            onCancelClearBill={onCancelClearBill}
            onCreateBill={handleCreateBill}
            lastShareText={lastShareText}
            onSendBill={handleSendWhatsApp}
          />
        </div>
      </div>

      {isMobile ? (
        <div className="billing-mobile-footer">
          <div className="billing-mobile-footer-summary">
            <div>
              <span>Total</span>
              <strong>Rs {Number(totalBill || 0).toFixed(2)}</strong>
            </div>
            <div className={creditAmount > 0 ? 'due' : 'settled'}>
              <span>Due</span>
              <strong>Rs {Number(creditAmount || 0).toFixed(2)}</strong>
            </div>
          </div>
          <div className="billing-mobile-footer-nav">
            <button
              type="button"
              className={`billing-mobile-nav-btn${mobileView === 'search' ? ' active' : ''}`}
              onClick={() => setMobileView('search')}
            >
              Entry
            </button>
            <button
              type="button"
              className={`billing-mobile-nav-btn${mobileView === 'cart' ? ' active' : ''}`}
              onClick={() => setMobileView('cart')}
            >
              Bill ({activeLineItemsCount})
            </button>
            <button
              type="button"
              className={`billing-mobile-nav-btn${mobileView === 'checkout' ? ' active' : ''}`}
              onClick={() => setMobileView('checkout')}
            >
              Checkout
            </button>
          </div>
          <button
            type="button"
            className="billing-mobile-footer-primary"
            onClick={handleMobilePrimaryAction}
            disabled={isSubmitting}
          >
            {mobileView === 'search'
              ? 'Review Bill'
              : mobileView === 'cart'
                ? 'Go To Checkout'
                : createBillConfirmationOpen
                  ? 'Confirm Save'
                  : 'Create Bill'}
          </button>
        </div>
      ) : null}

      {lastShareText ? (
        <div className="share-box">
          <div className="share-header">
            <strong>Share Bill {lastShareNumber ? `#${lastShareNumber}` : ''}</strong>
          </div>
          <textarea
            className="share-text"
            id="billing-share-text"
            name="share_text"
            readOnly
            value={lastShareText}
          />
          <div className="share-actions">
            <button className="billing-secondary-btn" type="button" onClick={handleCopyShare}>
              Copy
            </button>
            <button
              type="button"
              className="billing-primary-btn billing-share-whatsapp"
              onClick={handleSendWhatsApp}
            >
              WhatsApp
            </button>
          </div>
        </div>
      ) : null}

      {showCustomerCreateModal ? (
        <UserEditModal
          isCreate={true}
          createPrefill={{ name: customerCreateName }}
          onClose={handleCustomerModalClose}
          onSave={handleCustomerModalSave}
        />
      ) : null}
    </div>
  );
};

export default memo(BillingTabView);
