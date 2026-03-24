import { Filter, Search, SlidersHorizontal } from 'lucide-react';
import SearchSuggestionsList from '../SearchSuggestionsList';

const ProductsControls = ({
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
  cartItemCount,
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
}) => (
  <div className="products-controls sticky-controls slide-in-left" ref={controlsRef}>
    <div className="search-row">
      <div className="search-input-wrap" ref={searchInputRef}>
        <Search size={18} />
        <input
          id="products-search-input"
          name="search"
          type="text"
          placeholder="Search milk, rice, biscuit..."
          value={searchInputValue}
          onChange={onSearchInputChange}
          onFocus={onSearchFocus}
          onKeyDown={onSearchKeyDown}
          aria-label="Search products"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSearchSuggestions && searchSuggestions.length > 0}
          aria-controls={searchSuggestionsListId}
          aria-activedescendant={
            activeSuggestionIndex >= 0 ? `products-search-suggestion-${activeSuggestionIndex}` : undefined
          }
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
        />
        {searchInputValue ? (
          <button
            type="button"
            className="search-clear-btn"
            onClick={clearSearchQuery}
            aria-label="Clear search"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {isLoadingSuggestions ? <span className="search-suggest-loading" aria-live="polite">Loading</span> : null}
        {showSearchSuggestions && searchSuggestions.length > 0 ? (
          <SearchSuggestionsList
            searchSuggestions={searchSuggestions}
            searchSuggestionsListId={searchSuggestionsListId}
            activeSuggestionIndex={activeSuggestionIndex}
            onHoverSuggestion={onHoverSuggestion}
            onSelectSuggestion={onSelectSuggestion}
            getSuggestionImageSrc={getSuggestionImageSrc}
            getProductFallbackImage={getProductFallbackImage}
            formatCurrency={formatCurrency}
            maxItems={maxSuggestionItems}
          />
        ) : null}
      </div>
    </div>
    <div className="products-control-summary">
      <span>{cartItemCount} items in cart</span>
      <strong>{formatCurrency(cartPreviewTotal)}</strong>
    </div>

    {isMobile ? (
      <div className="mobile-filter-launch-row">
        <button type="button" className="mobile-filter-btn" onClick={() => setShowMobileFilters(true)}>
          <Filter size={16} /> Filters & Sort
        </button>
        <label className="stock-only-toggle">
          <input
            id="products-stock-only-mobile"
            name="stock_only"
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
          />
          In-stock only
        </label>
      </div>
    ) : (
      <div className="desktop-sort-row">
        <div className="sort-group">
          <Filter size={16} />
          <select
            id="products-group-by"
            name="group_by"
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value)}
            aria-label="Group products"
          >
            <option value={GROUP_BY_OPTIONS.category}>Group: Category {'->'} Sub-category</option>
            <option value={GROUP_BY_OPTIONS.brand}>Group: Brand {'->'} Sub-brand</option>
          </select>
        </div>
        <div className="sort-group">
          <SlidersHorizontal size={16} />
          <select
            id="products-sort-by"
            name="sort_by"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Sort products"
          >
            <option value="popular">Popular for you</option>
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="discount-desc">Discount: High to Low</option>
            <option value="stock-desc">Stock: High to Low</option>
          </select>
        </div>
        <label className="stock-only-toggle">
          <input
            id="products-stock-only-desktop"
            name="stock_only"
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
          />
          In-stock only
        </label>
      </div>
    )}
  </div>
);

export default ProductsControls;

