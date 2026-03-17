import DesktopProductsHeader from './desktop/DesktopProductsHeader';
import ProductsCategoryStrip from './desktop/ProductsCategoryStrip';
import ProductsControls from './desktop/ProductsControls';
import ProductsEmptyState from './desktop/ProductsEmptyState';
import ProductsGroupedList from './desktop/ProductsGroupedList';
import ProductsLoadMore from './desktop/ProductsLoadMore';
import ProductsMobileFilterSheet from './desktop/ProductsMobileFilterSheet';
import ProductsSmartSections from './ProductsSmartSections';

function ProductsDesktopView({
  productsPageRef,
  loading,
  productsLength,
  notice,
  error,
  cartItemCount,
  controlsRef,
  searchInputRef,
  searchInputValue,
  onSearchInputChange,
  onSearchFocus,
  onSearchKeyDown,
  clearSearchQuery,
  showSearchSuggestions,
  searchSuggestions,
  searchSuggestionsListId,
  activeSuggestionIndex,
  onHoverSuggestion,
  onSelectSuggestion,
  getSuggestionImageSrc,
  getProductFallbackImage,
  formatCurrency,
  maxSuggestionItems,
  isLoadingSuggestions,
  cartPreviewTotal,
  isMobile,
  setShowMobileFilters,
  groupBy,
  setGroupBy,
  sortBy,
  setSortBy,
  inStockOnly,
  setInStockOnly,
  GROUP_BY_OPTIONS,
  activeFilterOptions,
  selectedCategory,
  setSelectedCategory,
  renderCategoryChipLabel,
  normalizeText,
  visibleFamilies,
  groupedVisibleFamilies,
  renderFamilyCard,
  estimatedGridColumns,
  VIRTUALIZE_GROUP_THRESHOLD,
  hasMoreProducts,
  isLoadingMore,
  productsLoadTriggerRef,
  loadMoreProductsRef,
  filteredFamilies,
  commitSearchQuery,
  DEFAULT_SORT_BY,
  showMobileFilters,
  smartSectionsProps,
}) {
  return (
    <div className="products-page" ref={productsPageRef}>
      {loading && productsLength > 0 ? (
        <div className="products-refresh-banner" aria-live="polite">
          Updating products...
        </div>
      ) : null}
      {notice && (
        <div className={`products-notice ${notice.type === 'error' ? 'error' : 'info'}`}>
          {notice.message}
        </div>
      )}

      <DesktopProductsHeader cartItemCount={cartItemCount} />

      {error && <div className="products-error">{error}</div>}

      <ProductsControls
        controlsRef={controlsRef}
        searchInputRef={searchInputRef}
        searchInputValue={searchInputValue}
        onSearchInputChange={onSearchInputChange}
        onSearchFocus={onSearchFocus}
        onSearchKeyDown={onSearchKeyDown}
        clearSearchQuery={clearSearchQuery}
        showSearchSuggestions={showSearchSuggestions}
        searchSuggestions={searchSuggestions}
        searchSuggestionsListId={searchSuggestionsListId}
        activeSuggestionIndex={activeSuggestionIndex}
        onHoverSuggestion={onHoverSuggestion}
        onSelectSuggestion={onSelectSuggestion}
        getSuggestionImageSrc={getSuggestionImageSrc}
        getProductFallbackImage={getProductFallbackImage}
        formatCurrency={formatCurrency}
        maxSuggestionItems={maxSuggestionItems}
        isLoadingSuggestions={isLoadingSuggestions}
        cartItemCount={cartItemCount}
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
      />

      <ProductsCategoryStrip
        activeFilterOptions={activeFilterOptions}
        selectedCategory={selectedCategory}
        groupBy={groupBy}
        setSelectedCategory={setSelectedCategory}
        renderCategoryChipLabel={renderCategoryChipLabel}
        normalizeText={normalizeText}
        GROUP_BY_OPTIONS={GROUP_BY_OPTIONS}
      />

      <div className="result-summary" aria-live="polite">
        <span>
          {visibleFamilies.length} product groups
        </span>
      </div>

      <ProductsGroupedList
        groupedVisibleFamilies={groupedVisibleFamilies}
        renderFamilyCard={renderFamilyCard}
        estimatedGridColumns={estimatedGridColumns}
        VIRTUALIZE_GROUP_THRESHOLD={VIRTUALIZE_GROUP_THRESHOLD}
        isMobile={isMobile}
      />

      <ProductsLoadMore
        hasMoreProducts={hasMoreProducts}
        isLoadingMore={isLoadingMore}
        productsLoadTriggerRef={productsLoadTriggerRef}
        loadMoreProductsRef={loadMoreProductsRef}
      />

      <ProductsEmptyState
        show={!loading && filteredFamilies.length === 0}
        setSelectedCategory={setSelectedCategory}
        commitSearchQuery={commitSearchQuery}
        setSortBy={setSortBy}
        setGroupBy={setGroupBy}
        setInStockOnly={setInStockOnly}
        DEFAULT_SORT_BY={DEFAULT_SORT_BY}
        GROUP_BY_OPTIONS={GROUP_BY_OPTIONS}
      />

      {filteredFamilies.length > 0 ? (
        <ProductsSmartSections {...smartSectionsProps} />
      ) : null}

      {isMobile && showMobileFilters ? (
        <ProductsMobileFilterSheet
          showMobileFilters={showMobileFilters}
          setShowMobileFilters={setShowMobileFilters}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortBy={sortBy}
          setSortBy={setSortBy}
          activeFilterOptions={activeFilterOptions}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          renderCategoryChipLabel={renderCategoryChipLabel}
          normalizeText={normalizeText}
          GROUP_BY_OPTIONS={GROUP_BY_OPTIONS}
        />
      ) : null}
    </div>
  );
}

export default ProductsDesktopView;
