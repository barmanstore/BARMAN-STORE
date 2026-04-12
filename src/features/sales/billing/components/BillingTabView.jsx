import React, { memo, useEffect, useMemo, useState } from 'react';
import { CreditCard, Search, ShoppingCart } from 'lucide-react';
import UserEditModal from '../../../../shared/components/UserEditModal';
import BillingItemSection from './BillingItemSection';
import BillingPaymentSection from './BillingPaymentSection';

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
  paidAmount,
  setPaidAmount,
  selectedPaymentMethod,
  effectivePaymentMethod,
  setSelectedPaymentMethod,
  createBillConfirmationOpen,
  clearBillConfirmationOpen,
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

  const customerSectionProps = useMemo(() => ({
    isOrderLinked,
    isSubmitting,
    customer,
    customersList,
    handleCustomerChange,
    handleAddCustomer,
    fulfillmentMode,
    setFulfillmentMode,
  }), [
    customer,
    customersList,
    fulfillmentMode,
    handleAddCustomer,
    handleCustomerChange,
    isOrderLinked,
    isSubmitting,
    setFulfillmentMode,
  ]);

  const summaryProps = useMemo(() => ({
    activeLineItemsCount,
    subtotalAmount,
    totalDiscount,
    totalBill,
    paidClamped,
    creditAmount,
    paymentStatusLabel,
  }), [
    activeLineItemsCount,
    creditAmount,
    paidClamped,
    paymentStatusLabel,
    subtotalAmount,
    totalBill,
    totalDiscount,
  ]);

  const paymentPanelProps = useMemo(() => ({
    isSubmitting,
    activeLineItemsCount,
    totalBill,
    paidClamped,
    paidAmount,
    setPaidAmount,
    creditAmount,
    paidAmountWarning,
    selectedPaymentMethod,
    effectivePaymentMethod,
    setSelectedPaymentMethod,
    createBillConfirmationOpen,
    clearBillConfirmationOpen,
    handleSelectCashPayment,
    handleSelectUpiPayment,
    handleSelectCreditPayment,
    onClear,
    onCancelCreateBill,
    onCancelClearBill,
    onCreateBill: handleCreateBill,
    lastShareText,
    onSendBill: handleSendWhatsApp,
    customerName: String(customer?.name || '').trim(),
  }), [
    activeLineItemsCount,
    clearBillConfirmationOpen,
    creditAmount,
    createBillConfirmationOpen,
    customer?.name,
    effectivePaymentMethod,
    onCancelCreateBill,
    handleSelectCashPayment,
    handleSelectCreditPayment,
    handleSelectUpiPayment,
    handleSendWhatsApp,
    handleCreateBill,
    isSubmitting,
    lastShareText,
    onCancelClearBill,
    onClear,
    paidAmount,
    paidAmountWarning,
    paidClamped,
    selectedPaymentMethod,
    setPaidAmount,
    setSelectedPaymentMethod,
    totalBill,
  ]);

  const customerCreatePrefill = useMemo(() => ({
    name: customerCreateName,
  }), [customerCreateName]);

  return (
    <div className={`billing-content${isMobile ? ' billing-content-mobile' : ''}`}>
      <div className="billing-header">
        <div>
          <h1>Billing</h1>
          <p className="billing-header-copy">
            Add items and checkout.
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
          Linked order. Edit and bill here.
        </div>
      ) : null}
      {pricingPreviewLoading ? (
        <div className="billing-prefill-note">Refreshing prices...</div>
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
            <strong>Loading billing...</strong>
            <span>Products and customers.</span>
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
            Items
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

      <BillingItemSection
        isMobile={isMobile}
        mobileView={mobileView}
        currentItem={currentItem}
        currentProduct={currentProduct}
        pendingProductSelectionReview={pendingProductSelectionReview}
        isManualPrice={isManualPrice}
        isEntryActionLocked={isEntryActionLocked}
        productSearchMessage={productSearchMessage}
        hasExplicitSuggestionChoice={hasExplicitSuggestionChoice}
        currentUnitOptions={currentUnitOptions}
        productSearchInputRef={productSearchInputRef}
        priceInputRef={priceInputRef}
        qtyInputRef={qtyInputRef}
        unitInputRef={unitInputRef}
        discountInputRef={discountInputRef}
        submitButtonRef={submitButtonRef}
        productSearchResults={productSearchResults}
        recentProducts={recentProducts}
        productSearchLoading={productSearchLoading}
        activeProductSuggestionIndex={activeProductSuggestionIndex}
        getProductOptionLabel={getProductOptionLabel}
        handleCurrentItemChange={handleCurrentItemChange}
        handleProductSearchKeyDown={handleProductSearchKeyDown}
        handleEntryFieldKeyDown={handleEntryFieldKeyDown}
        handleSelectSearchProduct={handleSelectSearchProduct}
        handleStartCustomItem={handleStartCustomItem}
        handleCommitCurrentItem={handleCommitCurrentItem}
        handleCancelEdit={handleCancelEdit}
        lowStockWarning={lowStockWarning}
        billDisplayItems={billDisplayItems}
        editIndex={editIndex}
        selectedBillIndex={selectedBillIndex}
        latestAddedItemId={latestAddedItemId}
        lastRemovedItem={lastRemovedItem}
        handleSelectBillItem={handleSelectBillItem}
        handleDeleteBillItem={handleDeleteBillItem}
        handleUndoLastRemoval={handleUndoLastRemoval}
      />

      <BillingPaymentSection
        customerSectionProps={customerSectionProps}
        summaryProps={summaryProps}
        paymentPanelProps={paymentPanelProps}
      />

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
              Items
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
            <strong>Share {lastShareNumber ? `#${lastShareNumber}` : 'Bill'}</strong>
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
          createPrefill={customerCreatePrefill}
          onClose={handleCustomerModalClose}
          onSave={handleCustomerModalSave}
        />
      ) : null}
    </div>
  );
};

export default memo(BillingTabView);
