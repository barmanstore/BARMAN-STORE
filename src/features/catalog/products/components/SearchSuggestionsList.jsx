const SearchSuggestionsList = ({
  searchSuggestions,
  searchSuggestionsListId,
  activeSuggestionIndex,
  onHoverSuggestion,
  onSelectSuggestion,
  getSuggestionImageSrc,
  getProductFallbackImage,
  formatCurrency,
  maxItems,
}) => (
  <div
    id={searchSuggestionsListId}
    className="search-suggestions"
    role="listbox"
    aria-label="Search suggestions"
  >
    {searchSuggestions.slice(0, maxItems).map((item, index) => (
      <button
        type="button"
        id={`products-search-suggestion-${index}`}
        key={`suggestion-${item.id}-${index}`}
        className={`search-suggestion-item ${index === activeSuggestionIndex ? 'active' : ''}`}
        onMouseEnter={() => onHoverSuggestion(index)}
        onClick={() => onSelectSuggestion(item)}
        role="option"
        aria-selected={index === activeSuggestionIndex}
      >
        <div className="search-suggestion-leading" aria-hidden="true">
          <img
            src={getSuggestionImageSrc(item)}
            alt=""
            className="search-suggestion-thumb"
            width={34}
            height={34}
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = getProductFallbackImage(item);
            }}
          />
        </div>
        <div className="search-suggestion-main">
          {item.brand ? <strong>{item.brand}</strong> : null}
          <span>{item.name}</span>
        </div>
        <div className="search-suggestion-meta">
          {item.size ? <small>{item.size}</small> : null}
          <small>{formatCurrency(item.price)}</small>
        </div>
      </button>
    ))}
  </div>
);

export default SearchSuggestionsList;
