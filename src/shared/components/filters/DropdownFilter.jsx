import { Check, ChevronDown } from 'lucide-react';
import {
  getFieldContainerClassName,
  getFilterFrameClassName,
  getFilterLabelClassName,
  getPillClassName,
  getPillRowClassName,
} from './filterClassNames.js';
import './DropdownFilter.css';

const normalizeOption = (option) => {
  if (typeof option === 'string') {
    const value = String(option).trim();
    return value ? { value, label: value } : null;
  }

  const value = String(option?.value ?? option?.label ?? '').trim();
  const label = String(option?.label ?? option?.value ?? '').trim();
  if (!value || !label) return null;
  return { value, label };
};

function DropdownFilter({
  label,
  options = [],
  multiSelect = false,
  multiSelectMode = 'pills',
  selectedItems = [],
  onChange,
  width = '280px',
  allLabel,
  className = '',
  tone = 'sky',
  listMaxHeight = '200px',
  showSelectedCount = false,
  showBullets = false,
}) {
  const normalizedOptions = options.map(normalizeOption).filter(Boolean);
  const normalizedSelectedItems = Array.isArray(selectedItems)
    ? selectedItems.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const selectedSet = new Set(normalizedSelectedItems);
  const resolvedAllLabel = allLabel || (label ? `All ${label}` : 'All');
  const isChecklistMode = multiSelect && multiSelectMode === 'checklist';
  const selectedCountLabel = normalizedSelectedItems.length
    ? `${normalizedSelectedItems.length} selected`
    : resolvedAllLabel;
  const toneClassName = `ui-dropdown-filter--${tone}`;

  const handleMultiSelectToggle = (nextValue) => {
    const nextItems = selectedSet.has(nextValue)
      ? normalizedSelectedItems.filter((item) => item !== nextValue)
      : [...normalizedSelectedItems, nextValue];
    onChange?.(nextItems);
  };

  return (
    <div
      className={`${getFilterFrameClassName(className)} ui-dropdown-filter ${toneClassName}`}
      style={{ width, maxWidth: '100%' }}
    >
      {label ? (
        <div className="ui-dropdown-filter__heading">
          <span className={getFilterLabelClassName(tone)}>{label}</span>
          {showSelectedCount ? (
            <span className="ui-dropdown-filter__count">{selectedCountLabel}</span>
          ) : null}
        </div>
      ) : null}

      {multiSelect ? (
        isChecklistMode ? (
          <div className="ui-dropdown-filter__checklist-shell">
            <div
              role="group"
              aria-label={label ? `Filter by ${label}` : 'Filter'}
              className="ui-dropdown-filter__checklist"
              style={{ maxHeight: listMaxHeight }}
            >
              <label
                className={`ui-dropdown-filter__item ui-dropdown-filter__item--all ${
                  normalizedSelectedItems.length === 0 ? 'is-active' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={normalizedSelectedItems.length === 0}
                  onChange={() => onChange?.([])}
                  className="ui-dropdown-filter__checkbox"
                />
                {showBullets ? (
                  <span
                    aria-hidden="true"
                    className={`ui-dropdown-filter__bullet ${
                      normalizedSelectedItems.length === 0
                        ? 'ui-dropdown-filter__bullet--active'
                        : ''
                    }`}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{resolvedAllLabel}</span>
              </label>
              {normalizedOptions.map((option) => {
                const isActive = selectedSet.has(option.value);
                return (
                  <label
                    key={option.value}
                    className={`ui-dropdown-filter__item ${isActive ? 'is-active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => handleMultiSelectToggle(option.value)}
                      className="ui-dropdown-filter__checkbox"
                    />
                    {showBullets ? (
                      <span
                        aria-hidden="true"
                        className={`ui-dropdown-filter__bullet ${
                          isActive ? 'ui-dropdown-filter__bullet--active' : ''
                        }`}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            role="group"
            aria-label={label ? `Filter by ${label}` : 'Filter'}
            className={getPillRowClassName(tone)}
          >
            <button
              type="button"
              className={`${getPillClassName({ tone, active: normalizedSelectedItems.length === 0 })} dropdown-filter-pill${
                normalizedSelectedItems.length === 0 ? ' is-active' : ''
              }`}
              onClick={() => onChange?.([])}
              aria-pressed={normalizedSelectedItems.length === 0}
            >
              {normalizedSelectedItems.length === 0 ? (
                <Check size={12} className="dropdown-filter-pill-indicator" aria-hidden="true" />
              ) : null}
              {resolvedAllLabel}
            </button>
            {normalizedOptions.map((option) => {
              const isActive = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`${getPillClassName({ tone, active: isActive })} dropdown-filter-pill${
                    isActive ? ' is-active' : ''
                  }`}
                  onClick={() => handleMultiSelectToggle(option.value)}
                  aria-pressed={isActive}
                >
                  {isActive ? (
                    <Check
                      size={12}
                      className="dropdown-filter-pill-indicator"
                      aria-hidden="true"
                    />
                  ) : null}
                  {option.label}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className={`${getFieldContainerClassName(tone)} ui-dropdown-filter__select-shell`}>
          <select
            value={normalizedSelectedItems[0] || ''}
            onChange={(event) => onChange?.(event.target.value ? [event.target.value] : [])}
            aria-label={label || 'Filter'}
            className="ui-dropdown-filter__select"
          >
            <option value="">{resolvedAllLabel}</option>
            {normalizedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
            className="ui-dropdown-filter__select-chevron"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

export default DropdownFilter;
