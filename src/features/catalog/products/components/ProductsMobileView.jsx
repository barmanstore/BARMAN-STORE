import MobileBottomSheet from '../../../../components/mobile/MobileBottomSheet';
import MobileFooter from '../../../../components/mobile/MobileFooter';
import MobileProductsHeader from './MobileProductsHeader';
import MobileShopBody from './mobile/MobileShopBody';
import ProductDetailView from './ProductDetailView';

function ProductsMobileView({
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
  normalizeText,
  renderCategoryChipLabel,
  loading,
  productsLength,
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
}) {
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

      <MobileFooter
        cartCount={cartItemCount}
        onHome={() => handleMobileScrollTo('mobile-shop-top')}
        onTopPicks={() => handleMobileScrollTo('mobile-popular-section')}
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
    </div>
  );
}

export default ProductsMobileView;
