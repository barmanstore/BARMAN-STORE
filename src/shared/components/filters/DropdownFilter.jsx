import { Check, ChevronDown } from 'lucide-react';
import {
  getFieldContainerClassName,
  getFilterFrameClassName,
  getFilterLabelClassName,
  getPillClassName,
  getPillRowClassName,
} from './filterClassNames.js';

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

  const handleMultiSelectToggle = (nextValue) => {
    const nextItems = selectedSet.has(nextValue)
      ? normalizedSelectedItems.filter((item) => item !== nextValue)
      : [...normalizedSelectedItems, nextValue];
    onChange?.(nextItems);
  };

  return (
    <div
      className={`${getFilterFrameClassName(className)} dropdown-filter-frame`}
      style={{ width, maxWidth: '100%' }}
    >
      {label ? (
        <div className="dropdown-filter-heading flex items-center justify-between gap-2">
          <span className={getFilterLabelClassName(tone)}>{label}</span>
          {showSelectedCount ? (
            <span className="dropdown-filter-selected-count rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              {selectedCountLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {multiSelect ? (
        isChecklistMode ? (
          <div className="dropdown-filter-checklist-shell rounded-2xl border border-slate-200/90 bg-white/92 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <div
              role="group"
              aria-label={label ? `Filter by ${label}` : 'Filter'}
              className="dropdown-filter-checklist grid gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]"
              style={{ maxHeight: listMaxHeight }}
            >
              <label
                className={`dropdown-filter-checklist-item dropdown-filter-checklist-item--all flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 ${
                  normalizedSelectedItems.length === 0 ? 'is-active bg-slate-50 text-slate-900' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={normalizedSelectedItems.length === 0}
                  onChange={() => onChange?.([])}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                {showBullets ? (
                  <span
                    aria-hidden="true"
                    className={`dropdown-filter-checklist-bullet h-1.5 w-1.5 rounded-full ${
                      normalizedSelectedItems.length === 0 ? 'bg-slate-700' : 'bg-slate-300'
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
                    className={`dropdown-filter-checklist-item flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 ${
                      isActive ? 'is-active bg-slate-50 text-slate-900' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => handleMultiSelectToggle(option.value)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    {showBullets ? (
                      <span
                        aria-hidden="true"
                        className={`dropdown-filter-checklist-bullet h-1.5 w-1.5 rounded-full ${
                          isActive ? 'bg-slate-700' : 'bg-slate-300'
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
        <div className={getFieldContainerClassName(tone)}>
          <select
            value={normalizedSelectedItems[0] || ''}
            onChange={(event) => onChange?.(event.target.value ? [event.target.value] : [])}
            aria-label={label || 'Filter'}
            className="h-[38px] w-full appearance-none border-0 bg-transparent px-3 pr-9 text-[13px] font-medium text-slate-800 outline-none"
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
            className="pointer-events-none absolute right-3 text-slate-400"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

export default DropdownFilter;
