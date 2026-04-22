import React, { memo } from 'react';
import BillingBillList from './BillingBillList';
import BillingProductForm from './BillingProductForm';

const BillingItemSection = ({
  isMobile,
  mobileView,
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
  isSubmitting,
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
}) => {
  const showRecentProducts = !String(currentItem?.name || '').trim();
  const visibleEntryResults = showRecentProducts
    ? recentProducts.slice(0, 8)
    : productSearchResults.slice(0, 8);
  const productResultSummary = showRecentProducts
    ? !recentProducts.length
      ? 'No recent items.'
      : `${Math.min(visibleEntryResults.length, recentProducts.length)} of ${recentProducts.length} recent`
    : productSearchLoading
      ? ''
      : !String(currentItem?.name || '').trim()
        ? ''
        : !productSearchResults.length
          ? 'No matches.'
          : `${Math.min(visibleEntryResults.length, productSearchResults.length)} of ${productSearchResults.length} matches`;
  const showCustomItemAction = Boolean(
    String(currentItem?.name || '').trim() && !currentProduct && !productSearchLoading
  );
  const requiresExplicitSuggestionChoice = Boolean(
    String(currentItem?.name || '').trim() &&
    !showRecentProducts &&
    productSearchResults.length > 1 &&
    !hasExplicitSuggestionChoice &&
    !currentProduct
  );

  return (
    <div className={`billing-pos-layout${isMobile ? ' billing-pos-layout-mobile' : ''}`}>
      <div
        className={`billing-pos-left${isMobile ? ` billing-mobile-panel ${mobileView === 'search' ? 'active' : ''}` : ''}`}
      >
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

      <div
        className={`billing-pos-right${isMobile ? ` billing-mobile-panel ${mobileView === 'cart' ? 'active' : ''}` : ''}`}
      >
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
    </div>
  );
};

export default memo(BillingItemSection);
