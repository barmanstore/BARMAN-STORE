import { forwardRef } from 'react';
import { ChevronDown, ChevronUp, Search, SlidersHorizontal } from 'lucide-react';
import { joinClassNames } from './filterClassNames.js';

function SearchFilterSubmitButton({
  ariaLabel = 'Search',
  className = '',
  tone = 'sky',
  title,
}) {
  return (
    <button
      type="submit"
      className={joinClassNames(
        'ui-search-filter__submit',
        `ui-search-filter--${tone}`,
        className
      )}
      aria-label={ariaLabel}
      title={title || ariaLabel}
    >
      <Search size={15} aria-hidden="true" />
    </button>
  );
}

const FilterToggleButton = forwardRef(function FilterToggleButton(
  {
    label = 'Filters',
    count = 0,
    open = false,
    onClick,
    ariaControls,
    ariaExpanded = open,
    className = '',
    tone = 'sky',
    title,
  },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={joinClassNames(
        'ui-search-filter__action-button',
        `ui-search-filter--${tone}`,
        open ? 'is-open' : '',
        className
      )}
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      title={title || label}
    >
      <SlidersHorizontal size={14} aria-hidden="true" />
      <span>{label}</span>
      {count ? <strong>{count}</strong> : null}
      {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
    </button>
  );
});

export { FilterToggleButton, SearchFilterSubmitButton };
