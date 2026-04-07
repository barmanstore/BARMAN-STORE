import { useId } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  getFieldContainerClassName,
  getFilterFrameClassName,
  getFilterIconClassName,
  getScopeSelectClassName,
  getSearchButtonClassName,
} from './filterClassNames.js';

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

  const handleSubmit = (event) => {
    event?.preventDefault?.();
    onSubmit?.(value);
  };

  return (
    <div className={`${getFilterFrameClassName(className)} search-filter-frame`} style={{ width, maxWidth: '100%' }}>
      <label htmlFor={inputId} style={VISUALLY_HIDDEN_STYLE}>
        {placeholder}
      </label>

      <div
        className={`${getFieldContainerClassName(tone)} search-filter-shell`}
        role="search"
        aria-label={ariaLabel || placeholder}
      >
        {hasScopeOptions ? (
          <>
            <div className="relative flex h-full shrink-0 items-center search-filter-scope">
              <label htmlFor={scopeId} style={VISUALLY_HIDDEN_STYLE}>
                {scopeAriaLabel}
              </label>
              <select
                id={scopeId}
                value={scopeValue}
                onChange={(event) => onScopeChange?.(event.target.value)}
                aria-label={scopeAriaLabel}
                className={`${getScopeSelectClassName(tone)} search-filter-scope-select`}
              >
                {normalizedScopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 search-filter-scope-chevron"
                aria-hidden="true"
              />
            </div>
            <span className="h-5 w-px shrink-0 bg-slate-200 search-filter-divider" aria-hidden="true" />
          </>
        ) : null}

        <div className="relative flex min-w-0 flex-1 items-center search-filter-input-shell">
          {!hasSubmitButton ? (
            <Search
              size={15}
              className={['pointer-events-none absolute left-3', getFilterIconClassName(tone)].join(' ')}
              aria-hidden="true"
            />
          ) : null}

          <input
            id={inputId}
            type="text"
            role="searchbox"
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && hasSubmitButton) {
                handleSubmit(event);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            aria-label={ariaLabel || placeholder}
            aria-autocomplete={ariaAutocomplete}
            className={`h-[38px] w-full min-w-0 border-0 bg-transparent pr-3 text-[13px] font-medium text-slate-800 outline-none placeholder:text-slate-400 search-filter-input ${
              hasSubmitButton ? 'pl-3' : 'pl-9'
            }`}
          />
        </div>

        {hasSubmitButton ? (
          <>
            <span className="h-5 w-px shrink-0 bg-slate-200 search-filter-divider" aria-hidden="true" />
            <button
              type="button"
              className={`${getSearchButtonClassName(tone)} search-filter-submit`}
              aria-label={submitAriaLabel}
              title={submitAriaLabel}
              onClick={handleSubmit}
            >
              <Search size={15} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default SearchFilter;
