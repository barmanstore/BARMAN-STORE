import React, { memo, useId, useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import './ProductSearchCombobox.css';

const ProductSearchCombobox = ({
  inputId,
  inputRef,
  value,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  placeholder = 'Type product name',
  disabled = false,
  loading = false,
  results = [],
  activeIndex = 0,
  showRecentItems = false,
  selectedItem = null,
  hintContent = null,
  resultsSummaryText = '',
  noResultsText = 'No product found.',
  footerAction = null,
  footerActionPosition = 'bottom',
  getOptionKey = (product, index) => String(product?.id || index),
  getOptionPrimaryText = (product) => String(product?.name || 'Product'),
  getOptionSecondaryText = () => '',
  onSelect,
  onOptionHover,
  inputClassName = '',
  shellClassName = '',
  dropdownClassName = '',
  Icon = PackageSearch,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const generatedId = useId();
  const resolvedInputId = inputId || `product-search-${generatedId}`;
  const listboxId = `${resolvedInputId}-results`;
  const trimmedValue = String(value || '').trim();
  const hasVisibleResults = !loading && results.length > 0;
  const showNoResults = Boolean(
    isFocused &&
    trimmedValue &&
    !loading &&
    !selectedItem &&
    !showRecentItems &&
    results.length === 0
  );
  const showDropdown = Boolean(
    isFocused && (loading || hasVisibleResults || showNoResults || footerAction)
  );
  const activeDescendantId = useMemo(() => {
    if (showRecentItems || !results.length) return undefined;
    return `${listboxId}-option-${activeIndex}`;
  }, [activeIndex, listboxId, results.length, showRecentItems]);
  const actionButton = footerAction ? (
    <button
      type="button"
      className={`product-search-footer-action${footerActionPosition === 'top' ? ' top' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={footerAction.onClick}
      disabled={footerAction.disabled}
    >
      {footerAction.label}
    </button>
  ) : null;

  return (
    <div className={`product-search-shell${shellClassName ? ` ${shellClassName}` : ''}`}>
      <Icon size={18} />
      <input
        ref={inputRef}
        id={resolvedInputId}
        type="text"
        className={`product-search-input${inputClassName ? ` ${inputClassName}` : ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          setIsFocused(true);
          if (typeof onFocus === 'function') onFocus(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          if (typeof onBlur === 'function') onBlur(event);
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={activeDescendantId}
      />

      {showDropdown ? (
        <div
          className={`product-search-dropdown${dropdownClassName ? ` ${dropdownClassName}` : ''}`}
        >
          {hintContent ? <div className="product-search-hint">{hintContent}</div> : null}

          {resultsSummaryText ? (
            <div className="product-search-summary">{resultsSummaryText}</div>
          ) : null}

          {footerActionPosition === 'top' ? actionButton : null}

          {loading ? <div className="product-search-state">Searching products...</div> : null}

          {!loading && results.length > 0 ? (
            <div
              id={listboxId}
              className={`product-search-results${showRecentItems ? ' recent' : ''}`}
              role="listbox"
              aria-label={showRecentItems ? 'Recent products' : 'Product results'}
            >
              {results.map((product, index) => {
                const secondaryText = getOptionSecondaryText(product, index);
                return (
                  <button
                    key={getOptionKey(product, index)}
                    type="button"
                    className={`product-search-option${!showRecentItems && index === activeIndex ? ' active' : ''}`}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={!showRecentItems && index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (typeof onOptionHover === 'function') onOptionHover(index);
                    }}
                    onClick={() => {
                      if (typeof onSelect === 'function') onSelect(product);
                    }}
                  >
                    <span className="product-search-option-name">
                      {getOptionPrimaryText(product, index)}
                    </span>
                    {secondaryText ? (
                      <span className="product-search-option-meta">{secondaryText}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {showNoResults ? <div className="product-search-state">{noResultsText}</div> : null}

          {footerActionPosition === 'top' ? null : actionButton}
        </div>
      ) : null}
    </div>
  );
};

export default memo(ProductSearchCombobox);
