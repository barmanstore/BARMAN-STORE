import ProductsDesktopView from './ProductsDesktopView';
import ProductsMobileView from './ProductsMobileView';

const ProductsPageLayout = ({
  isMobile,
  loading,
  productsLength,
  productsPageRef,
  mobileHeaderRef,
  logoImage,
  storeTitle,
  localUser,
  avatarLoadFailed,
  avatarSrc,
  setAvatarLoadFailed,
  normalizeText,
  getInitials,
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
  mobileTabFamilies,
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
  controlsRef,
  searchInputRef,
  handleDesktopSearchChange,
  handleDesktopSearchFocus,
  handleDesktopSearchKeyDown,
  cartPreviewTotal,
  setShowMobileFilters,
  groupBy,
  setGroupBy,
  sortBy,
  setSortBy,
  inStockOnly,
  setInStockOnly,
  GROUP_BY_OPTIONS,
  activeFilterOptions,
  setSelectedCategory,
  visibleFamilies,
  groupedVisibleFamilies,
  renderFamilyCard,
  estimatedGridColumns,
  VIRTUALIZE_GROUP_THRESHOLD,
  hasMoreProducts,
  filteredFamilies,
  commitSearchQuery,
  DEFAULT_SORT_BY,
  showMobileFilters,
  smartSectionsProps,
  snackbar,
  dismissSnackbar,
}) => {
  if (!isMobile && loading && productsLength === 0) {
    const skeletonCount = isMobile ? 6 : 8;
    return (
      <div className="products-page">
        <div className="products-skeleton-header shimmer-skeleton" aria-hidden="true" />
        <div className="products-skeleton-controls shimmer-skeleton" aria-hidden="true" />
        <div className="products-skeleton-grid" aria-hidden="true">
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <div
              key={`product-skeleton-${index}`}
              className="product-skeleton-card shimmer-skeleton"
            />
          ))}
        </div>
      </div>
    );
  }

  const activeTabFamilies = mobileTabFamilies[activeMobileTab] || [];
  const isLoggedIn = Boolean(
    localUser?.id ||
    String(localUser?.token || '').trim() ||
    String(localUser?.supabase_session?.access_token || '').trim() ||
    String(localUser?.email || '').trim() ||
    String(localUser?.phone || '').trim()
  );
  const profileHref = isLoggedIn ? '/profile' : '/login';
  const profileImageSrc = !avatarLoadFailed ? avatarSrc : '';
  const profileName = String(localUser?.name || '').trim();
  const profileInitials = profileName ? getInitials(profileName) : '';
  const disableMobileLogoLink = true;

  if (isMobile) {
    return (
      <ProductsMobileView
        productsPageRef={productsPageRef}
        mobileHeaderRef={mobileHeaderRef}
        logoImage={logoImage}
        storeTitle={storeTitle}
        disableMobileLogoLink={disableMobileLogoLink}
        profileHref={profileHref}
        profileImageSrc={profileImageSrc}
        profileName={profileName}
        profileInitials={profileInitials}
        onAvatarError={() => setAvatarLoadFailed(true)}
        searchInputValue={searchInputValue}
        handleMobileSearchChange={handleMobileSearchChange}
        handleMobileSearchFocus={handleMobileSearchFocus}
        handleMobileSearchKeyDown={handleMobileSearchKeyDown}
        showSearchSuggestions={showSearchSuggestions}
        searchSuggestions={searchSuggestions}
        searchSuggestionsListId={searchSuggestionsListId}
        activeSuggestionIndex={activeSuggestionIndex}
        setActiveSuggestionIndex={setActiveSuggestionIndex}
        selectSearchSuggestion={selectSearchSuggestion}
        clearSearchQuery={clearSearchQuery}
        isLoadingSuggestions={isLoadingSuggestions}
        SEARCH_SUGGESTIONS_MAX_ITEMS={SEARCH_SUGGESTIONS_MAX_ITEMS}
        getSuggestionImageSrc={getSuggestionImageSrc}
        getProductFallbackImage={getProductFallbackImage}
        formatCurrency={formatCurrency}
        selectedCategory={selectedCategory}
        handleMobileCategorySelect={handleMobileCategorySelect}
        mobileRootCategories={mobileRootCategories}
        normalizeText={normalizeText}
        renderCategoryChipLabel={renderCategoryChipLabel}
        loading={loading}
        productsLength={productsLength}
        notice={notice}
        error={error}
        mobileSubcategories={mobileSubcategories}
        selectedSubcategory={selectedSubcategory}
        handleMobileSubcategorySelect={handleMobileSubcategorySelect}
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
        cartItemCount={cartItemCount}
        handleMobileScrollTo={handleMobileScrollTo}
        activeMobileFamily={activeMobileFamily}
        setActiveMobileFamilyId={setActiveMobileFamilyId}
        handleSelectVariation={handleSelectVariation}
        decreaseFromCart={decreaseFromCart}
        cartQtyById={cartQtyById}
        buttonStatus={buttonStatus}
        snackbar={snackbar}
        dismissSnackbar={dismissSnackbar}
      />
    );
  }

  return (
    <ProductsDesktopView
      productsPageRef={productsPageRef}
      loading={loading}
      productsLength={productsLength}
      notice={notice}
      error={error}
      cartItemCount={cartItemCount}
      controlsRef={controlsRef}
      searchInputRef={searchInputRef}
      searchInputValue={searchInputValue}
      onSearchInputChange={handleDesktopSearchChange}
      onSearchFocus={handleDesktopSearchFocus}
      onSearchKeyDown={handleDesktopSearchKeyDown}
      clearSearchQuery={clearSearchQuery}
      showSearchSuggestions={showSearchSuggestions}
      searchSuggestions={searchSuggestions}
      searchSuggestionsListId={searchSuggestionsListId}
      activeSuggestionIndex={activeSuggestionIndex}
      onHoverSuggestion={setActiveSuggestionIndex}
      onSelectSuggestion={selectSearchSuggestion}
      getSuggestionImageSrc={getSuggestionImageSrc}
      getProductFallbackImage={getProductFallbackImage}
      formatCurrency={formatCurrency}
      maxSuggestionItems={SEARCH_SUGGESTIONS_MAX_ITEMS}
      isLoadingSuggestions={isLoadingSuggestions}
      cartPreviewTotal={cartPreviewTotal}
      isMobile={isMobile}
      setShowMobileFilters={setShowMobileFilters}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      sortBy={sortBy}
      setSortBy={setSortBy}
      inStockOnly={inStockOnly}
      setInStockOnly={setInStockOnly}
      GROUP_BY_OPTIONS={GROUP_BY_OPTIONS}
      activeFilterOptions={activeFilterOptions}
      selectedCategory={selectedCategory}
      setSelectedCategory={setSelectedCategory}
      renderCategoryChipLabel={renderCategoryChipLabel}
      normalizeText={normalizeText}
      visibleFamilies={visibleFamilies}
      groupedVisibleFamilies={groupedVisibleFamilies}
      renderFamilyCard={renderFamilyCard}
      estimatedGridColumns={estimatedGridColumns}
      VIRTUALIZE_GROUP_THRESHOLD={VIRTUALIZE_GROUP_THRESHOLD}
      hasMoreProducts={hasMoreProducts}
      isLoadingMore={isLoadingMore}
      productsLoadTriggerRef={productsLoadTriggerRef}
      loadMoreProductsRef={loadMoreProductsRef}
      filteredFamilies={filteredFamilies}
      commitSearchQuery={commitSearchQuery}
      DEFAULT_SORT_BY={DEFAULT_SORT_BY}
      showMobileFilters={showMobileFilters}
      smartSectionsProps={smartSectionsProps}
    />
  );
};

export default ProductsPageLayout;
