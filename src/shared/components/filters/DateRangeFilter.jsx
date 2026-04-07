import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getDateFieldClassName,
  getFilterActionClassName,
  getFilterFrameClassName,
  getFilterIconClassName,
  getFilterLabelClassName,
  getFilterPopoverClassName,
  getFilterTriggerClassName,
  getPillClassName,
} from './filterClassNames.js';

const normalizeDateToken = (value) => {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

const formatDateToken = (value) => {
  const normalized = normalizeDateToken(value);
  if (!normalized) return 'DD/MM/YYYY';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
};

const normalizeDateRange = (startDate, endDate, changedField = null) => {
  let nextStartDate = normalizeDateToken(startDate);
  let nextEndDate = normalizeDateToken(endDate);

  if (nextStartDate && nextEndDate && nextStartDate > nextEndDate) {
    if (changedField === 'start') {
      nextEndDate = nextStartDate;
    } else if (changedField === 'end') {
      nextStartDate = nextEndDate;
    } else {
      [nextStartDate, nextEndDate] = [nextEndDate, nextStartDate];
    }
  }

  return [nextStartDate, nextEndDate];
};

function DateRangeFilter({
  label,
  value = ['', ''],
  onChange,
  width = '280px',
  presets = [],
  helperText = '',
  className = '',
  tone = 'sky',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const popoverId = useId();
  const [startDate, endDate] = normalizeDateRange(value?.[0], value?.[1]);

  const displayValue = `${formatDateToken(startDate)} - ${formatDateToken(endDate)}`;
  const hasValue = Boolean(startDate || endDate);
  const activePreset = useMemo(() => {
    return presets.find((preset) => {
      const [presetStartDate, presetEndDate] = normalizeDateRange(preset?.value?.[0], preset?.value?.[1]);
      return presetStartDate === startDate && presetEndDate === endDate;
    })?.label || '';
  }, [endDate, presets, startDate]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleRangeChange = (nextStartDate, nextEndDate, changedField = null) => {
    onChange?.(normalizeDateRange(nextStartDate, nextEndDate, changedField));
  };

  return (
    <div
      ref={wrapperRef}
      className={getFilterFrameClassName(['relative', className].filter(Boolean).join(' '))}
      style={{ width, maxWidth: '100%' }}
    >
      {label ? (
        <span className={getFilterLabelClassName(tone)}>
          {label}
        </span>
      ) : null}
      <button
        type="button"
        className={getFilterTriggerClassName({ tone, isOpen, hasValue })}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={popoverId}
      >
        <Calendar size={15} className={getFilterIconClassName(tone)} aria-hidden="true" />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[13px] font-medium">
          {displayValue}
        </span>
        {isOpen ? <ChevronUp size={15} className="shrink-0 text-slate-400" /> : <ChevronDown size={15} className="shrink-0 text-slate-400" />}
      </button>

      {isOpen ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={label || 'Date range filter'}
          className={getFilterPopoverClassName(tone)}
        >
          {presets.length ? (
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:thin]">
              {presets.map((preset) => {
                const isActive = preset.label === activePreset;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={getPillClassName({ tone, active: isActive })}
                    onClick={() => {
                      handleRangeChange(preset?.value?.[0], preset?.value?.[1]);
                      setIsOpen(false);
                    }}
                    aria-pressed={isActive}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => handleRangeChange(event.target.value, endDate, 'start')}
                className={getDateFieldClassName(tone)}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => handleRangeChange(startDate, event.target.value, 'end')}
                className={getDateFieldClassName(tone)}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <small className="text-[11px] font-medium text-slate-500">{helperText}</small>
            {hasValue ? (
              <button
                type="button"
                className={getFilterActionClassName(tone)}
                onClick={() => handleRangeChange('', '')}
              >
                Clear dates
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DateRangeFilter;
