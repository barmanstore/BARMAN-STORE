import { Link } from 'react-router-dom';
import { Search, User, X } from 'lucide-react';
import SearchSuggestionsList from './SearchSuggestionsList';

const MobileProductsHeader = ({
  headerRef,
  logoImage,
  storeTitle,
  disableLogoLink,
  profileHref,
  profileImageSrc,
  profileName,
  profileInitials,
  onAvatarError,
  searchInputValue,
  onSearchInputChange,
  onSearchFocus,
  onSearchKeyDown,
  showSearchSuggestions,
  searchSuggestions,
  searchSuggestionsListId,
  activeSuggestionIndex,
  onHoverSuggestion,
  onSelectSuggestion,
  clearSearchQuery,
  isLoadingSuggestions,
  maxSuggestionItems,
  getSuggestionImageSrc,
  getProductFallbackImage,
  formatCurrency,
  selectedCategory,
  handleMobileCategorySelect,
  mobileRootCategories,
  normalizeText,
  renderCategoryChipLabel,
}) => {
  // WAI-ARIA roving tabindex for tabs.
  const handleTabKeyDown = (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    if (!tabs || tabs.length === 0) return;
    const currentIndex = Array.from(tabs).indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
    tabs[nextIndex].focus();
  };

  const isAllSelected = selectedCategory === 'all';

  return (
    <header className="mobile-shop-header" id="mobile-shop-top" ref={headerRef}>
      <div className="mobile-header-row">
        {disableLogoLink ? (
          <div className="mobile-logo mobile-logo-disabled" aria-label="Store">
            <img src={logoImage} alt="Logo" className="mobile-logo-image" />
            <div className="mobile-logo-text">
              <span className="mobile-store-title">{storeTitle}</span>
              <span className="mobile-store-subtitle">Groceries & Essentials</span>
            </div>
          </div>
        ) : (
          <Link to="/" className="mobile-logo" aria-label="Go to home">
            <img src={logoImage} alt="Logo" className="mobile-logo-image" />
            <div className="mobile-logo-text">
              <span className="mobile-store-title">{storeTitle}</span>
              <span className="mobile-store-subtitle">Groceries & Essentials</span>
            </div>
          </Link>
        )}
        <div className="mobile-header-actions">
          <Link to={profileHref} className="mobile-profile-btn" aria-label={profileHref === '/profile' ? 'Profile' : 'Login'}>
            {profileImageSrc ? (
              <img
                src={profileImageSrc}
                alt={profileName || 'User'}
                className="mobile-profile-avatar"
                onError={onAvatarError}
              />
            ) : profileInitials ? (
              <span className="mobile-profile-fallback" aria-hidden="true">{profileInitials}</span>
            ) : (
              <User size={18} />
            )}
          </Link>
        </div>
      </div>

      <div className="mobile-search-row">
        <Search size={16} />
        <input
          id="mobile-products-search"
          name="search"
          type="text"
          placeholder="Search products..."
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
          <button type="button" className="mobile-search-clear" onClick={clearSearchQuery} aria-label="Clear search">
            <X size={14} />
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

      <div className="mobile-category-scroller" role="tablist" aria-label="Categories">
        <button
          type="button"
          className={`mobile-category-chip ${isAllSelected ? 'active' : ''}`}
          onClick={() => handleMobileCategorySelect('all')}
          role="tab"
          aria-selected={isAllSelected}
          tabIndex={isAllSelected ? 0 : -1}
          onKeyDown={handleTabKeyDown}
        >
          All
        </button>
        {mobileRootCategories.map((category) => {
          const isSelected = normalizeText(selectedCategory) === normalizeText(category.name);
          return (
            <button
              type="button"
              key={category.id}
              className={`mobile-category-chip ${isSelected ? 'active' : ''}`}
              onClick={() => handleMobileCategorySelect(category.name)}
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={handleTabKeyDown}
            >
              {renderCategoryChipLabel(category)}
            </button>
          );
        })}
      </div>
    </header>
  );
};

export default MobileProductsHeader;

