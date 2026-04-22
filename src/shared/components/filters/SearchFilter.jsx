import { useId } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { getFilterFrameClassName } from './filterClassNames.js';
import './SearchFilter.css';

const VISUALLY_HIDDEN_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const normalizeScopeOption = (option) => {
  if (typeof option === 'string') {
    const value = String(option).trim();
    return value ? { value, label: value } : null;
  }

  const value = String(option?.value ?? option?.label ?? '').trim();
  const label = String(option?.label ?? option?.value ?? '').trim();
  if (!value || !label) return null;
  return { value, label };
};

function SearchFilter({
  placeholder = 'Search',
  value = '',
  onChange,
  onSubmit,
  width = '280px',
  stretch = false,
  className = '',
  id,
  ariaLabel,
  tone = 'sky',
  scopeOptions = [],
  scopeValue = '',
  onScopeChange,
  scopeAriaLabel = 'Search scope',
  submitAriaLabel = 'Search',
  ariaAutocomplete,
}) {
  const generatedId = useId();
  const inputId = id || `search-filter-${generatedId}`;
  const scopeId = `${inputId}-scope`;
  const normalizedScopeOptions = scopeOptions.map(normalizeScopeOption).filter(Boolean);
  const hasScopeOptions = normalizedScopeOptions.length > 0;
  const hasSubmitButton = typeof onSubmit === 'function';
  const toneClassName = `ui-search-filter--${tone}`;

  const handleSubmit = (event) => {
    event?.preventDefault?.();
    onSubmit?.(value);
  };

  const frameStyle = stretch
    ? { width, maxWidth: '100%', display: 'block' }
    : { width, maxWidth: '100%' };

  return (
    <div
      className={`${getFilterFrameClassName(className)} ui-search-filter ${
        stretch ? 'ui-search-filter--stretch' : ''
      }`}
      style={frameStyle}
    >
      <label htmlFor={inputId} style={VISUALLY_HIDDEN_STYLE}>
        {placeholder}
      </label>

      <form
        className={`ui-search-filter__shell ${toneClassName}`}
        role="search"
        aria-label={ariaLabel || placeholder}
        onSubmit={(event) => {
          event.preventDefault();
          if (hasSubmitButton) {
            handleSubmit(event);
          }
        }}
      >
        {hasScopeOptions ? (
          <>
            <div className="ui-search-filter__scope">
              <label htmlFor={scopeId} style={VISUALLY_HIDDEN_STYLE}>
                {scopeAriaLabel}
              </label>
              <select
                id={scopeId}
                value={scopeValue}
                onChange={(event) => onScopeChange?.(event.target.value)}
                aria-label={scopeAriaLabel}
                className="ui-search-filter__scope-select"
              >
                {normalizedScopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="ui-search-filter__scope-chevron"
                aria-hidden="true"
              />
            </div>
            <span className="ui-search-filter__divider" aria-hidden="true" />
          </>
        ) : null}

        <div className="ui-search-filter__input-shell">
          {!hasSubmitButton ? (
            <Search size={15} className="ui-search-filter__icon" aria-hidden="true" />
          ) : null}

          <input
            id={inputId}
            type="text"
            role="searchbox"
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            aria-label={ariaLabel || placeholder}
            aria-autocomplete={ariaAutocomplete}
            className={`ui-search-filter__input ${
              hasSubmitButton
                ? 'ui-search-filter__input--with-submit'
                : 'ui-search-filter__input--with-icon'
            }`}
          />
        </div>

        {hasSubmitButton ? (
          <>
            <span className="ui-search-filter__divider" aria-hidden="true" />
            <button
              type="submit"
              className="ui-search-filter__submit"
              aria-label={submitAriaLabel}
              title={submitAriaLabel}
            >
              <Search size={15} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </form>
    </div>
  );
}

export default SearchFilter;
