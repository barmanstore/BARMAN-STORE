import { useState } from 'react';
import MobileBottomSheet from '../../../../shared/components/mobile/MobileBottomSheet';
import MobileFooter from '../../../../shared/components/mobile/MobileFooter';
import MobileProductsHeader from './MobileProductsHeader';
import MobileShopBody from './mobile/MobileShopBody';
import ProductDetailView from './ProductDetailView';

function ProductsMobileView({
  loading,
  productsLength,
  productsPageRef,
  mobileHeaderRef,
  logoImage,
  storeTitle,
  disableMobileLogoLink,
  profileHref,
  profileImageSrc,
  profileName,
  profileInitials,
  onAvatarError,
  normalizeText,
  searchInputValue,
  handleMobileSearchChange,
  handleMobileSearchFocus,
  handleMobileSearchKeyDown,
  showSearchSuggestions,
  searchSuggestions,
  searchSuggestionsListId,
  activeSuggestionIndex,
  setActiveSuggestionIndex,
  selectSearchSuggestion,
  clearSearchQuery,
  isLoadingSuggestions,
  SEARCH_SUGGESTIONS_MAX_ITEMS,
  getSuggestionImageSrc,
  getProductFallbackImage,
  formatCurrency,
  selectedCategory,
  handleMobileCategorySelect,
  mobileRootCategories,
  renderCategoryChipLabel,
  notice,
  error,
  mobileSubcategories,
  selectedSubcategory,
  handleMobileSubcategorySelect,
  mobileOffers,
  handleMobileOfferAction,
  repeatOrderFamilies,
  recentlyBoughtFamilies,
  handleRepeatOrder,
  openFamilyDetails,
  getSelectedVariation,
  getFamilyPreviewVariation,
  popularFamilies,
  renderMobileProductCard,
  smartRestockItems,
  handleRestockAll,
  addToCart,
  quickAddFamilies,
  MOBILE_TAB_OPTIONS,
  activeMobileTab,
  setActiveMobileTab,
  activeTabFamilies,
  productsHasMore,
  productsLoadTriggerRef,
  isLoadingMore,
  loadMoreProductsRef,
  cartItemCount,
  handleMobileScrollTo,
  activeMobileFamily,
  setActiveMobileFamilyId,
  handleSelectVariation,
  decreaseFromCart,
  cartQtyById,
  buttonStatus,
  snackbar = { show: false, message: '', undo: null },
  dismissSnackbar,
}) {
  const [isCartExpanded, setIsCartExpanded] = useState(false);

  const handleCartClick = () => {
    if (cartItemCount > 0) {
      setIsCartExpanded((prev) => !prev);
    }
  };

  return (
    <div className="mobile-shop-page" ref={productsPageRef}>
      <MobileProductsHeader
        headerRef={mobileHeaderRef}
        logoImage={logoImage}
        storeTitle={storeTitle}
        disableLogoLink={disableMobileLogoLink}
        profileHref={profileHref}
        profileImageSrc={profileImageSrc}
        profileName={profileName}
        profileInitials={profileInitials}
        onAvatarError={onAvatarError}
        searchInputValue={searchInputValue}
        onSearchInputChange={handleMobileSearchChange}
        onSearchFocus={handleMobileSearchFocus}
        onSearchKeyDown={handleMobileSearchKeyDown}
        showSearchSuggestions={showSearchSuggestions}
        searchSuggestions={searchSuggestions}
        searchSuggestionsListId={searchSuggestionsListId}
        activeSuggestionIndex={activeSuggestionIndex}
        onHoverSuggestion={setActiveSuggestionIndex}
        onSelectSuggestion={selectSearchSuggestion}
        clearSearchQuery={clearSearchQuery}
        isLoadingSuggestions={isLoadingSuggestions}
        maxSuggestionItems={SEARCH_SUGGESTIONS_MAX_ITEMS}
        getSuggestionImageSrc={getSuggestionImageSrc}
        getProductFallbackImage={getProductFallbackImage}
        formatCurrency={formatCurrency}
        selectedCategory={selectedCategory}
        handleMobileCategorySelect={handleMobileCategorySelect}
        mobileRootCategories={mobileRootCategories}
        normalizeText={normalizeText}
        renderCategoryChipLabel={renderCategoryChipLabel}
      />

      <MobileShopBody
        loading={loading}
        productsLength={productsLength}
        notice={notice}
        error={error}
        selectedCategory={selectedCategory}
        mobileSubcategories={mobileSubcategories}
        selectedSubcategory={selectedSubcategory}
        handleMobileSubcategorySelect={handleMobileSubcategorySelect}
        normalizeText={normalizeText}
        mobileOffers={mobileOffers}
        handleMobileOfferAction={handleMobileOfferAction}
        repeatOrderFamilies={repeatOrderFamilies}
        recentlyBoughtFamilies={recentlyBoughtFamilies}
        handleRepeatOrder={handleRepeatOrder}
        openFamilyDetails={openFamilyDetails}
        getSelectedVariation={getSelectedVariation}
        getFamilyPreviewVariation={getFamilyPreviewVariation}
        popularFamilies={popularFamilies}
        renderMobileProductCard={renderMobileProductCard}
        smartRestockItems={smartRestockItems}
        handleRestockAll={handleRestockAll}
        addToCart={addToCart}
        quickAddFamilies={quickAddFamilies}
        MOBILE_TAB_OPTIONS={MOBILE_TAB_OPTIONS}
        activeMobileTab={activeMobileTab}
        setActiveMobileTab={setActiveMobileTab}
        activeTabFamilies={activeTabFamilies}
        productsHasMore={productsHasMore}
        productsLoadTriggerRef={productsLoadTriggerRef}
        isLoadingMore={isLoadingMore}
        loadMoreProductsRef={loadMoreProductsRef}
      />

      {isCartExpanded && <MiniCartPreview onClose={() => setIsCartExpanded(false)} />}

      <MobileFooter
        cartCount={cartItemCount}
        onHome={() => handleMobileScrollTo('mobile-shop-top')}
        onTopPicks={() => handleMobileScrollTo('mobile-popular-section')}
        onCartClick={handleCartClick}
      />

      {activeMobileFamily && (
        <MobileBottomSheet
          open={!!activeMobileFamily}
          onClose={() => setActiveMobileFamilyId(null)}
          title={activeMobileFamily.name}
          className="products-detail-sheet"
        >
          <ProductDetailView
            family={activeMobileFamily}
            selectedVariationId={getSelectedVariation(activeMobileFamily)?.id}
            onSelectVariation={handleSelectVariation}
            onIncreaseQty={addToCart}
            onDecreaseQty={decreaseFromCart}
            cartQtyById={cartQtyById}
            buttonStatus={buttonStatus}
            showImage
          />
        </MobileBottomSheet>
      )}

      {snackbar.show && (
        <div className="mobile-snackbar">
          <span>{snackbar.message}</span>
          {snackbar.undo && (
            <button
              onClick={() => {
                snackbar.undo();
                dismissSnackbar();
              }}
            >
              Undo
            </button>
          )}
          <button onClick={dismissSnackbar}>×</button>
        </div>
      )}
    </div>
  );
}

function MiniCartPreview({ onClose }) {
  return (
    <div className="mini-cart-preview">
      <div className="mini-cart-header">
        <h3>Your Cart</h3>
        <button type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mini-cart-items">
        <p>Cart items preview here</p>
      </div>
      <div className="mini-cart-actions">
        <button type="button" onClick={onClose}>
          Continue Shopping
        </button>
        <button type="button">Checkout</button>
      </div>
    </div>
  );
}

export default ProductsMobileView;
