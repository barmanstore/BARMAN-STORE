import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react';
import {
  getDateRangePopoverClassName,
  getFilterActionClassName,
  getFilterFrameClassName,
  getFilterIconClassName,
  getFilterIconTriggerClassName,
  getFilterLabelClassName,
  getPillClassName,
  getPillRowClassName,
  getFilterTriggerClassName,
} from './filterClassNames.js';
import './DateRangeFilter.css';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const normalizeDateToken = (value) => {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

const toDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateToken = (value) => {
  const normalized = normalizeDateToken(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const nextDate = new Date(year, month - 1, day);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
};

const formatShortDate = (value) => {
  const date = fromDateToken(value);
  if (!date) return 'DD/MM/YYYY';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

const formatCompactDate = (value) => {
  const date = fromDateToken(value);
  if (!date) return '';
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
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

const startOfMonthToken = (value) => {
  const date = fromDateToken(value) || new Date();
  return toDateToken(new Date(date.getFullYear(), date.getMonth(), 1));
};

const shiftMonthToken = (value, delta) => {
  const date = fromDateToken(value) || new Date();
  return toDateToken(new Date(date.getFullYear(), date.getMonth() + delta, 1));
};

const compareTokens = (left, right) => String(left || '').localeCompare(String(right || ''));

const isBetweenInclusive = (value, start, end) => {
  if (!value || !start || !end) return false;
  return compareTokens(value, start) >= 0 && compareTokens(value, end) <= 0;
};

const buildMonthGrid = (monthToken, weekStartsOn = 1) => {
  const monthDate = fromDateToken(monthToken) || new Date();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const weekStart = Math.min(Math.max(Number(weekStartsOn) || 1, 0), 6);
  const monthOffset = (monthStart.getDay() - weekStart + 7) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - monthOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const token = toDateToken(date);
    return {
      token,
      day: date.getDate(),
      inMonth: date.getMonth() === monthStart.getMonth(),
      isToday: token === toDateToken(new Date()),
      label: `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
    };
  });
};

function CompactCalendar({
  monthToken,
  selectedStartDate,
  selectedEndDate,
  hoverDate,
  onDateHover,
  onDateSelect,
  onMonthChange,
  weekStartsOn,
}) {
  const monthDate = fromDateToken(monthToken) || new Date();
  const monthLabel = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
  const monthGrid = useMemo(() => buildMonthGrid(monthToken, weekStartsOn), [monthToken, weekStartsOn]);

  const previewStart = selectedStartDate && !selectedEndDate && hoverDate
    ? (compareTokens(selectedStartDate, hoverDate) <= 0 ? selectedStartDate : hoverDate)
    : '';
  const previewEnd = selectedStartDate && !selectedEndDate && hoverDate
    ? (compareTokens(selectedStartDate, hoverDate) <= 0 ? hoverDate : selectedStartDate)
    : '';

  return (
    <section className="date-calendar">
      <div className="date-calendar-header">
        <button type="button" className="date-calendar-nav" onClick={() => onMonthChange(-1)} aria-label="Previous month">
          <ChevronLeft size={14} />
        </button>
        <span className="date-calendar-title">{monthLabel}</span>
        <button type="button" className="date-calendar-nav" onClick={() => onMonthChange(1)} aria-label="Next month">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="date-weekdays">
        {WEEKDAY_LABELS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="date-grid" onMouseLeave={() => onDateHover?.('')}>
        {monthGrid.map((cell) => {
          const isStart = cell.token === selectedStartDate;
          const isEnd = cell.token === selectedEndDate;
          const committedRange = Boolean(selectedStartDate && selectedEndDate && isBetweenInclusive(cell.token, selectedStartDate, selectedEndDate));
          const previewRange = Boolean(previewStart && previewEnd && isBetweenInclusive(cell.token, previewStart, previewEnd));
          const inRange = committedRange || previewRange;

          return (
            <button
              key={cell.token}
              type="button"
              className={[
                'date-day',
                cell.inMonth ? '' : 'is-outside',
                cell.isToday ? 'is-today' : '',
                inRange ? 'is-range' : '',
                isStart ? 'is-start' : '',
                isEnd ? 'is-end' : '',
              ].filter(Boolean).join(' ')}
              onMouseEnter={() => onDateHover?.(cell.token)}
              onClick={() => onDateSelect?.(cell.token)}
              aria-label={cell.label}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DateRangeFilter({
  label,
  value = ['', ''],
  onChange,
  width = '280px',
  presets = [],
  helperText = '',
  className = '',
  tone = 'sky',
  triggerMode = 'default',
  showIcon = true,
  showPlaceholderText = true,
  alwaysOpen = false,
  weekStartsOn = 1,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [calendarMonthToken, setCalendarMonthToken] = useState('');
  const [hoverDate, setHoverDate] = useState('');
  const wrapperRef = useRef(null);
  const popoverId = useId();
  const safeValue = Array.isArray(value) ? value : [];
  const safePresets = Array.isArray(presets) ? presets : [];

  const [committedStartDate, committedEndDate] = normalizeDateRange(safeValue[0], safeValue[1]);

  const committedPresetLabel = useMemo(() => {
    if (!committedStartDate && !committedEndDate) return '';
    const committedRange = [committedStartDate, committedEndDate].join('|');
    return safePresets.find((preset) => {
      const [presetStart, presetEnd] = normalizeDateRange(preset?.value?.[0], preset?.value?.[1]);
      return [presetStart, presetEnd].join('|') === committedRange;
    })?.label || '';
  }, [committedEndDate, committedStartDate, safePresets]);

  const displayValue = committedPresetLabel || (
    committedStartDate && committedEndDate
      ? `${formatShortDate(committedStartDate)} – ${formatShortDate(committedEndDate)}`
      : showPlaceholderText ? 'Select dates' : ''
  );

  const activePresetLabel = selectedPreset || committedPresetLabel;
  const hasCommittedValue = Boolean(committedStartDate || committedEndDate);
  const hasCustomRange = Boolean((committedStartDate || committedEndDate) && !committedPresetLabel);
  const isPickerOpen = alwaysOpen || isOpen;
  const calendarAnchorToken = startOfMonthToken(draftStartDate || draftEndDate || committedStartDate || committedEndDate || new Date());
  const customStartLabel = formatCompactDate(draftStartDate || committedStartDate);
  const customEndLabel = formatCompactDate(draftEndDate || committedEndDate);
  const customChipLabel = (draftStartDate || draftEndDate || committedStartDate || committedEndDate)
    ? customEndLabel
      ? `${customStartLabel} - ${customEndLabel}`
      : `${customStartLabel} -`
    : 'Custom';

  const clearRange = () => {
    setSelectedPreset('');
    setDraftStartDate('');
    setDraftEndDate('');
    setShowCustom(false);
    setShowCalendar(false);
    setCalendarMonthToken(startOfMonthToken(new Date()));
    setHoverDate('');
    commitRange('', '');
  };

  const openCustomRange = () => {
    setSelectedPreset('');
    setShowCustom(true);
    setShowCalendar(true);
    setCalendarMonthToken(calendarAnchorToken);
    setHoverDate('');
  };

  const closeCustomRange = () => {
    setShowCustom(false);
    setShowCalendar(false);
    setHoverDate('');
  };

  useEffect(() => {
    if (!isPickerOpen) return undefined;

    setDraftStartDate(committedStartDate);
    setDraftEndDate(committedEndDate);
    setSelectedPreset(committedPresetLabel);
    setShowCustom(hasCustomRange);
    setShowCalendar(hasCustomRange);
    setCalendarMonthToken(calendarAnchorToken);
    setHoverDate('');

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
  }, [calendarAnchorToken, committedEndDate, committedPresetLabel, committedStartDate, hasCustomRange, isPickerOpen]);

  const commitRange = (nextStartDate, nextEndDate) => {
    const [normalizedStartDate, normalizedEndDate] = normalizeDateRange(nextStartDate, nextEndDate);
    onChange?.([normalizedStartDate, normalizedEndDate]);
  };

  const syncCustomRange = (nextStartDate, nextEndDate, changedField = null) => {
    const [normalizedStartDate, normalizedEndDate] = normalizeDateRange(nextStartDate, nextEndDate, changedField);
    setDraftStartDate(normalizedStartDate);
    setDraftEndDate(normalizedEndDate);
    setSelectedPreset('');
    setShowCustom(true);
    setShowCalendar(true);
    setHoverDate('');
    commitRange(normalizedStartDate, normalizedEndDate);
    if (normalizedStartDate && normalizedEndDate && changedField === 'end') {
      closeCustomRange();
    }
  };

  const handlePresetSelect = (preset) => {
    const [presetStart, presetEnd] = normalizeDateRange(preset?.value?.[0], preset?.value?.[1]);
    setSelectedPreset(preset?.label || '');
    setDraftStartDate(presetStart);
    setDraftEndDate(presetEnd);
    setShowCustom(false);
    setShowCalendar(false);
    setHoverDate('');
    commitRange(presetStart, presetEnd);
  };

  const handleDateSelect = (token) => {
    if (!token) return;
    if (!draftStartDate || (draftStartDate && draftEndDate)) {
      syncCustomRange(token, '', 'start');
      return;
    }

    if (compareTokens(token, draftStartDate) < 0) {
      syncCustomRange(token, '', 'start');
      return;
    }

    syncCustomRange(draftStartDate, token, 'end');
  };

  const triggerLabel = displayValue ? `${label || 'Date range'}: ${displayValue}` : (label || 'Date range');

  if (alwaysOpen) {
    return (
      <div
        ref={wrapperRef}
        className={getFilterFrameClassName([
          'date-filter',
          'relative',
          className,
        ].filter(Boolean).join(' '))}
        style={{ width, maxWidth: '100%' }}
      >
        {label ? <span className={getFilterLabelClassName(tone)}>{label}</span> : null}

        <div className="date-range-inline">
          <div
            role="group"
            aria-label={label ? `Filter by ${label}` : 'Date range filter'}
            className={getPillRowClassName()}
          >
            <button
              type="button"
              className={getPillClassName({ tone, active: !hasCommittedValue && !showCustom })}
              onClick={clearRange}
              aria-pressed={!hasCommittedValue && !showCustom}
            >
              All Dates
            </button>
            <button
              type="button"
              className={getPillClassName({ tone, active: showCustom || hasCustomRange })}
              onClick={() => {
                if (showCustom) {
                  closeCustomRange();
                  return;
                }

                openCustomRange();
              }}
              aria-pressed={showCustom || hasCustomRange}
              title={hasCustomRange ? customChipLabel : 'Open custom date range'}
            >
              Custom
            </button>
            {presets.map((preset) => {
              const isActive = preset.label === activePresetLabel;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={getPillClassName({ tone, active: isActive })}
                  onClick={() => handlePresetSelect(preset)}
                  aria-pressed={isActive}
                >
                  {preset.label}
                  </button>
                );
              })}
          </div>

          {showCustom ? (
            <div className="calendar-box calendar-box--inline">
              <CompactCalendar
                monthToken={calendarMonthToken || calendarAnchorToken}
                selectedStartDate={draftStartDate}
                selectedEndDate={draftEndDate}
                hoverDate={hoverDate}
                onDateHover={setHoverDate}
                onDateSelect={handleDateSelect}
                onMonthChange={(delta) => setCalendarMonthToken((current) => shiftMonthToken(current || calendarAnchorToken, delta))}
                weekStartsOn={weekStartsOn}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={getFilterFrameClassName([
        'date-filter',
        'relative',
        className,
        triggerMode === 'icon' ? 'date-range-filter--icon' : '',
      ].filter(Boolean).join(' '))}
      style={{ width, maxWidth: '100%' }}
    >
      {label ? <span className={getFilterLabelClassName(tone)}>{label}</span> : null}

      {triggerMode === 'icon' ? (
        <button
          type="button"
          className={`${getFilterIconTriggerClassName({ tone, isOpen, hasValue: hasCommittedValue })} date-range-trigger date-range-trigger--icon`}
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isPickerOpen}
          aria-haspopup="dialog"
          aria-controls={popoverId}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <Calendar size={16} className={getFilterIconClassName(tone)} aria-hidden="true" />
          {hasCommittedValue ? <span className="date-filter-trigger-dot" aria-hidden="true" /> : null}
          <span className="sr-only">{triggerLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          className={`${getFilterTriggerClassName({ tone, isOpen, hasValue: hasCommittedValue })} date-range-trigger`}
          onClick={alwaysOpen ? undefined : () => setIsOpen((current) => !current)}
          aria-expanded={isPickerOpen}
          aria-haspopup={alwaysOpen ? undefined : 'dialog'}
          aria-controls={popoverId}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          {showIcon ? <Calendar size={15} className={getFilterIconClassName(tone)} aria-hidden="true" /> : null}
          {displayValue ? (
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[13px] font-medium">
              {displayValue}
            </span>
          ) : null}
          {!alwaysOpen ? (
            isOpen ? <ChevronUp size={15} className="shrink-0 text-slate-400" /> : <ChevronDown size={15} className="shrink-0 text-slate-400" />
          ) : null}
        </button>
      )}

      {isPickerOpen ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={label || 'Date range filter'}
          className={`${getDateRangePopoverClassName(tone)} date-range-popover`}
        >
          {helperText ? (
            <div className="date-range-header">
              <span className="date-range-header-hint">{helperText}</span>
              {hasCommittedValue ? (
                <button
                  type="button"
                  className={`${getFilterActionClassName(tone)} date-range-clear`}
                  onClick={clearRange}
                >
                  <X size={12} aria-hidden="true" />
                  <span>Clear</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="date-presets">
            {presets.map((preset) => {
              const isActive = preset.label === activePresetLabel;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`date-chip${isActive ? ' active' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                  aria-pressed={isActive}
                >
                  <span>{preset.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`date-chip${showCustom ? ' active' : ''}`}
              onClick={openCustomRange}
              aria-pressed={showCustom}
            >
              <span>Custom</span>
              <Calendar size={12} aria-hidden="true" />
            </button>
          </div>

          {showCustom ? (
            <div className={`date-custom${showCalendar ? ' active' : ''}`}>
              <div className="date-custom-summary">
                <div className="date-custom-copy">
                  <span className="date-custom-label">Custom range</span>
                  <span className="date-custom-value">
                    {draftStartDate && draftEndDate
                      ? `${formatShortDate(draftStartDate)} - ${formatShortDate(draftEndDate)}`
                      : draftStartDate
                        ? `${formatShortDate(draftStartDate)} -`
                        : 'Pick two dates'}
                  </span>
                </div>
                <button
                  type="button"
                  className="calendar-toggle"
                  onClick={() => setShowCalendar((current) => !current)}
                  aria-label={showCalendar ? 'Hide calendar' : 'Show calendar'}
                >
                  <Calendar size={12} aria-hidden="true" />
                </button>
              </div>

              <div className={`calendar-box${showCalendar ? ' open' : ''}`}>
                {showCalendar ? (
                  <CompactCalendar
                    monthToken={calendarMonthToken || calendarAnchorToken}
                    selectedStartDate={draftStartDate}
                    selectedEndDate={draftEndDate}
                    hoverDate={hoverDate}
                    onDateHover={setHoverDate}
                    onDateSelect={handleDateSelect}
                    onMonthChange={(delta) => setCalendarMonthToken((current) => shiftMonthToken(current || calendarAnchorToken, delta))}
                    weekStartsOn={weekStartsOn}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default DateRangeFilter;
