import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, RefreshCw } from 'lucide-react';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import { cashbookApi } from '../../../shared/services/api';
import { formatCurrency, formatDate } from '../../../shared/utils/formatters';
import './CashbookSection.css';

const toDateFromKey = (dateKey) => {
  if (!dateKey) return null;
  if (typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [year, month, day] = dateKey.split('-').map((part) => Number(part));
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(dateKey);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const shiftDateKey = (dateKey, offsetDays) => {
  const date = toDateFromKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfMonthKey = (dateKey) => {
  const date = toDateFromKey(dateKey);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

const shiftMonthToken = (dateKey, offsetMonths) => {
  const date = toDateFromKey(dateKey) || new Date();
  return toDateToken(new Date(date.getFullYear(), date.getMonth() + offsetMonths, 1));
};

const normalizeDateRange = (startDate, endDate) => {
  const nextStart = String(startDate || '').trim();
  const nextEnd = String(endDate || '').trim();

  if (nextStart && nextEnd && nextStart > nextEnd) {
    return [nextEnd, nextStart];
  }

  return [nextStart, nextEnd];
};

const formatDateInputValue = (dateKey) => {
  const date = toDateFromKey(dateKey);
  if (!date) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const parseDateInputValue = (value) => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, dayPart, monthPart, yearPart] = match;
  const day = Number(dayPart);
  const month = Number(monthPart);
  const year = Number(yearPart);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return '';
  }
  return `${yearPart}-${monthPart}-${dayPart}`;
};

const normalizeDateInputDraft = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const getClientTimeToken = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

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

const toDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateToken = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
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

function MiniCalendar({
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
    <section className="cashbook-mini-calendar">
      <div className="cashbook-mini-calendar-header">
        <button type="button" className="cashbook-mini-calendar-nav" onClick={() => onMonthChange(-1)} aria-label="Previous month">
          <span aria-hidden="true">‹</span>
        </button>
        <span className="cashbook-mini-calendar-title">{monthLabel}</span>
        <button type="button" className="cashbook-mini-calendar-nav" onClick={() => onMonthChange(1)} aria-label="Next month">
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="cashbook-mini-calendar-weekdays">
        {WEEKDAY_LABELS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="cashbook-mini-calendar-grid" onMouseLeave={() => onDateHover?.('')}>
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
                'cashbook-mini-calendar-day',
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

const formatShortDate = (dateKey) => formatDate(dateKey, 'en-IN', { month: 'short', day: '2-digit' });

const getAmountTone = (entry) => {
  if (entry.type === 'task') return 'neutral';
  if (entry.direction === 'in') return 'in';
  if (entry.direction === 'out') return 'out';
  return 'neutral';
};

const getSignedAmountLabel = (entry) => {
  if (!entry || entry.type === 'task') return formatCurrency(0);
  if (entry.is_credit_history && entry.direction === 'neutral') {
    return formatCurrency(Math.abs(Number(entry.amount || 0)));
  }
  const signedAmount = Number(entry.signed_amount || 0);
  const prefix = signedAmount > 0 ? '+' : signedAmount < 0 ? '-' : '';
  return `${prefix}${formatCurrency(Math.abs(signedAmount))}`;
};

const isCreditHistoryEntry = (entry) => Boolean(
  entry?.is_credit_history || String(entry?.source_type || '').trim().toLowerCase() === 'credit_history'
);

const parseCashbookLine = (rawValue) => {
  const value = String(rawValue || '').trim().replace(/\s+/g, ' ');
  if (!value) return null;

  const lowered = value.toLowerCase();
  if (/^(task|todo|note)\s*[:\-]?\s*/.test(lowered) || value.startsWith('!')) {
    const note = value.replace(/^(task|todo|note)\s*[:\-]?\s*/i, '').replace(/^!\s*/, '').trim();
    return { type: 'task', amount: null, note };
  }

  const amountMatch = value.match(/-?\d[\d,]*\.?\d*/);
  const hasLeadingPlus = /^\s*\+/.test(value);
  const hasLeadingMinus = /^\s*-/.test(value);
  const isExplicitIncome = /\b(income|received|in|cash in|add)\b/.test(lowered);
  const isExplicitExpense = /\b(expense|spent|out|cash out|paid|payment|reduce|deduct)\b/.test(lowered);
  const isAdjustment = /\b(adjust|adjustment|correction|rectify)\b/.test(lowered);

  let type = 'expense';
  if (isAdjustment) type = 'adjustment';
  else if (hasLeadingPlus || isExplicitIncome) type = 'manual_in';
  else if (hasLeadingMinus || isExplicitExpense) type = 'expense';

  if (!amountMatch) {
    if (type === 'task') return { type, amount: null, note: value };
    return null;
  }

  const amount = Math.abs(Number(amountMatch[0].replace(/,/g, '')));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const cleanedNote = value
    .replace(amountMatch[0], ' ')
    .replace(/^[+\-]/, ' ')
    .replace(/\b(task|todo|note|income|received|in|cash in|add|expense|spent|out|cash out|paid|payment|reduce|deduct|adjust|adjustment|correction|rectify)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    type,
    amount,
    note: cleanedNote,
    adjustment_direction: hasLeadingMinus || /\b(reduce|deduct|subtract)\b/.test(lowered) ? 'reduce' : 'add',
  };
};

const isEditableCashbookEntry = (entry) => Boolean(
  entry && !entry.is_credit_history && !entry.is_auto
);

const buildComposerLineFromEntry = (entry) => {
  if (!isEditableCashbookEntry(entry)) return '';
  const note = String(entry.note || '').trim();
  if (entry.type === 'task') {
    return note ? `task: ${note}` : 'task:';
  }

  const signedAmount = Number(entry.signed_amount ?? entry.amount ?? 0);
  if (!Number.isFinite(signedAmount)) return '';
  const direction = signedAmount < 0 ? '-' : '+';
  const cleanedNote = note ? ` ${note}` : '';
  return `${direction}${Math.abs(signedAmount)}${cleanedNote}`.trim();
};

const CashbookEntryRow = memo(function CashbookEntryRow({
  entry,
  isEditing = false,
  editDraft = '',
  onStartEdit,
  onEditDraftChange,
  onEditKeyDown,
  editInputRef = null,
  showRunningBalance = false,
  isRecent = false,
  recentEntryFlash = '',
}) {
  const tone = getAmountTone(entry);
  const timeLabel = entry.time || '--:--';
  const runningBalance = entry.running_balance;
  const rowMetaLabel = entry.is_credit_history
    ? 'Credit'
    : entry.type === 'task'
      ? 'Task'
      : entry.is_auto
        ? 'Auto'
        : 'Manual';
  const rowFlowLabel = entry.is_credit_history
    ? (entry.type === 'payment' ? 'Payment' : 'Sale')
    : entry.type === 'task'
      ? 'Reminder'
      : entry.type === 'adjustment'
        ? 'Adjustment'
        : (tone === 'in' ? 'Cash in' : 'Cash out');
  const editPreview = parseCashbookLine(editDraft);
  const editPreviewAmount = editPreview ? getSignedAmountLabel({
    ...entry,
    type: editPreview.type,
    amount: editPreview.amount ?? entry.amount,
    signed_amount: editPreview.type === 'task'
      ? 0
      : editPreview.type === 'adjustment'
        ? (editPreview.adjustment_direction === 'reduce' ? -Math.abs(Number(editPreview.amount || 0)) : Math.abs(Number(editPreview.amount || 0)))
        : (editPreview.type === 'expense' ? -Math.abs(Number(editPreview.amount || 0)) : Math.abs(Number(editPreview.amount || 0))),
  }) : '';

  return (
    <div
      className={`cashbook-entry cashbook-entry-${tone}${entry.is_credit_history ? ' cashbook-entry-credit' : ''}${isEditing ? ' is-editing' : ''}${isRecent ? ' is-recent' : ''}${isRecent && recentEntryFlash ? ` ${recentEntryFlash}` : ''}`}
      role={isEditableCashbookEntry(entry) ? 'button' : undefined}
      tabIndex={isEditableCashbookEntry(entry) ? 0 : undefined}
      onClick={!isEditing && isEditableCashbookEntry(entry) ? () => onStartEdit?.(entry) : undefined}
      onKeyDown={!isEditing && isEditableCashbookEntry(entry) ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onStartEdit?.(entry);
        }
      } : undefined}
    >
      <div className="cashbook-entry-time">{timeLabel}</div>
      <div className="cashbook-entry-main">
        {isEditing ? (
          <>
            <div className="cashbook-entry-title">
              <span className="cashbook-entry-type">{entry.label}</span>
            </div>
            <div className="cashbook-entry-meta cashbook-entry-meta-edit">Editing · {rowMetaLabel}</div>
            <input
              className="cashbook-entry-edit-input"
              type="text"
              ref={editInputRef}
              value={editDraft}
              onChange={(event) => onEditDraftChange?.(event.target.value)}
              onKeyDown={onEditKeyDown}
              autoFocus
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder="500 rice, -150 petrol, task: call supplier"
            />
            <div className="cashbook-entry-edit-hint">Enter to save, Escape to cancel</div>
          </>
        ) : (
          <>
            <div className="cashbook-entry-title">
              <span className="cashbook-entry-type">{entry.label}</span>
            </div>
            <div className="cashbook-entry-meta">
              {rowMetaLabel} · {rowFlowLabel}
            </div>
            {entry.note ? (
              <div className="cashbook-entry-note">{entry.note}</div>
            ) : null}
            {showRunningBalance && entry.type !== 'task' ? (
              <div className="cashbook-entry-balance">
                Balance {formatCurrency(runningBalance)}
              </div>
            ) : null}
          </>
        )}
      </div>
      {isEditing ? (
        <div className="cashbook-entry-amount cashbook-entry-amount-editing">
          <strong>{editPreviewAmount || '...'}</strong>
        </div>
      ) : entry.type === 'task' ? (
        <div className="cashbook-entry-amount cashbook-entry-amount-task">
          <strong className="cashbook-entry-task-label">Task</strong>
        </div>
      ) : (
        <div className="cashbook-entry-amount">
          <strong>{getSignedAmountLabel(entry)}</strong>
        </div>
      )}
      {isRecent ? <CheckCircle2 size={14} className="cashbook-entry-saved" aria-hidden="true" /> : null}
    </div>
  );
});

const buildCashbookDisplaySnapshot = (snapshot, { dateRange = ['', ''], hideCreditHistory = false, todayKey = '' } = {}) => {
  if (!snapshot) return null;

  const groups = Array.isArray(snapshot?.groups) ? snapshot.groups : [];
  const [startDate, endDate] = dateRange;

  const rangeGroups = groups.filter((group) => {
    if (!group?.date) return false;
    if (startDate && group.date < startDate) return false;
    if (endDate && group.date > endDate) return false;
    return true;
  });

  if (rangeGroups.length === 0) {
    return { ...snapshot, groups: [], today_summary: null };
  }

  const ascendingGroups = [...rangeGroups].reverse();
  let nextOpening = Number(ascendingGroups[0]?.opening_balance ?? 0);

  const rebuiltAscending = ascendingGroups.map((group, index) => {
    const sourceEntries = Array.isArray(group.entries) ? group.entries : [];
    const visibleEntries = hideCreditHistory
      ? sourceEntries.filter((entry) => !isCreditHistoryEntry(entry))
      : sourceEntries;

    let openingBalance = index === 0 ? Number(group.opening_balance ?? nextOpening) : nextOpening;
    if (!Number.isFinite(openingBalance)) openingBalance = 0;

    let runningBalance = openingBalance;
    let inTotal = 0;
    let outTotal = 0;

    const entries = visibleEntries.map((entry) => {
      const signedAmount = Number(entry.signed_amount || 0);
      if (signedAmount > 0) {
        inTotal += signedAmount;
      } else if (signedAmount < 0) {
        outTotal += Math.abs(signedAmount);
      }

      runningBalance += signedAmount;

      return {
        ...entry,
        running_balance: runningBalance,
      };
    });

    const closingBalance = openingBalance + inTotal - outTotal;
    nextOpening = closingBalance;

    return {
      ...group,
      opening_balance: openingBalance,
      in_total: inTotal,
      out_total: outTotal,
      closing_balance: closingBalance,
      entry_count: entries.length,
      auto_count: entries.filter((entry) => entry.is_auto).length,
      manual_count: entries.filter((entry) => !entry.is_auto && !isCreditHistoryEntry(entry) && entry.type !== 'task').length,
      credit_count: entries.filter((entry) => isCreditHistoryEntry(entry)).length,
      task_count: entries.filter((entry) => entry.type === 'task').length,
      entries,
    };
  });

  const rebuiltDesc = rebuiltAscending.slice().reverse();
  const summaryGroup = rebuiltAscending.find((group) => group.date === todayKey) || rebuiltAscending[rebuiltAscending.length - 1] || null;

  return {
    ...snapshot,
    groups: rebuiltDesc,
    today_summary: summaryGroup ? {
      date: summaryGroup.date,
      label: summaryGroup.label,
      opening_balance: summaryGroup.opening_balance,
      in_total: summaryGroup.in_total,
      out_total: summaryGroup.out_total,
      closing_balance: summaryGroup.closing_balance,
      entry_count: summaryGroup.entry_count,
      auto_count: summaryGroup.auto_count,
      manual_count: summaryGroup.manual_count,
      task_count: summaryGroup.task_count,
      has_saved_opening_balance: summaryGroup.has_saved_opening_balance,
      opening_balance_updated_at: summaryGroup.opening_balance_updated_at,
      entries: summaryGroup.entries,
    } : null,
  };
};

function CashbookSection() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState(['', '']);
  const [composerDraft, setComposerDraft] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [openingDraft, setOpeningDraft] = useState('');
  const [openingSaving, setOpeningSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showRunningBalance, setShowRunningBalance] = useState(false);
  const [hideCreditHistory, setHideCreditHistory] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [customFromInput, setCustomFromInput] = useState('');
  const [customToInput, setCustomToInput] = useState('');
  const [calendarField, setCalendarField] = useState('');
  const [calendarMonthToken, setCalendarMonthToken] = useState('');
  const [customDateError, setCustomDateError] = useState('');
  const [hoverDate, setHoverDate] = useState('');
  const [recentEntryId, setRecentEntryId] = useState('');
  const [recentEntryFlash, setRecentEntryFlash] = useState('');
  const [editingEntryId, setEditingEntryId] = useState('');
  const [editingDraft, setEditingDraft] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);
  const [lastDeletedEntry, setLastDeletedEntry] = useState(null);
  const [undoToastVisible, setUndoToastVisible] = useState(false);

  const composerInputRef = useRef(null);
  const analysisPanelRef = useRef(null);
  const hasInitializedDateRange = useRef(false);
  const recentEntryTimerRef = useRef(null);
  const undoTimerRef = useRef(null);
  const undoHideTimerRef = useRef(null);
  const isMobile = useIsMobile();
  const editInputRef = useRef(null);
  const editingEntryIdRef = useRef('');
  const editingDraftRef = useRef('');
  const editingSavingRef = useRef(false);

  const todayKey = snapshot?.today_summary?.date || snapshot?.range?.end_date || '';
  const todayLabel = snapshot?.today_summary?.label || 'Today';
  const todayDateLabel = todayKey ? formatShortDate(todayKey) : '-';

  useEffect(() => {
    composerInputRef.current?.focus();
  }, []);

  useEffect(() => () => {
    if (recentEntryTimerRef.current) {
      clearTimeout(recentEntryTimerRef.current);
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    if (undoHideTimerRef.current) {
      clearTimeout(undoHideTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!snapshot?.today_summary) return;
    const openingValue = snapshot.today_summary.opening_balance ?? 0;
    setOpeningDraft(String(openingValue));
  }, [snapshot?.today_summary?.date, snapshot?.today_summary?.opening_balance]);

  useEffect(() => {
    editingEntryIdRef.current = editingEntryId;
  }, [editingEntryId]);

  useEffect(() => {
    editingDraftRef.current = editingDraft;
  }, [editingDraft]);

  useEffect(() => {
    editingSavingRef.current = editingSaving;
  }, [editingSaving]);

  useEffect(() => {
    if (!showAnalysisPanel) return;
    setCustomFromInput(formatDateInputValue(dateRange[0]));
    setCustomToInput(formatDateInputValue(dateRange[1]));
    setCalendarField('');
    setCalendarMonthToken(dateRange[0] || dateRange[1] || todayKey || '');
    setCustomDateError('');
    setHoverDate('');
  }, [dateRange, showAnalysisPanel]);

  useEffect(() => {
    if (!showAnalysisPanel) return undefined;

    const handlePointerDown = (event) => {
      if (!analysisPanelRef.current?.contains(event.target)) {
        setShowAnalysisPanel(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowAnalysisPanel(false);
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
  }, [showAnalysisPanel]);

  const loadSnapshot = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const payload = await cashbookApi.getSnapshot();
      setSnapshot(payload);
    } catch (err) {
      setError(err?.message || 'Failed to load cashbook');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const dateRangePresets = useMemo(() => {
    if (!todayKey) return [];
    return [
      { label: 'Today', value: [todayKey, todayKey] },
      { label: 'Yesterday', value: [shiftDateKey(todayKey, -1), shiftDateKey(todayKey, -1)] },
      { label: '7d', value: [shiftDateKey(todayKey, -6), todayKey] },
      { label: '30d', value: [shiftDateKey(todayKey, -29), todayKey] },
      { label: 'Month', value: [startOfMonthKey(todayKey), todayKey] },
    ];
  }, [todayKey]);

  const activeDatePreset = useMemo(() => (
    dateRangePresets.find((preset) => (
      dateRange[0] === preset.value[0] && dateRange[1] === preset.value[1]
    )) || null
  ), [dateRange, dateRangePresets]);

  const isCustomDateRange = Boolean(dateRange[0] || dateRange[1]) && !activeDatePreset;

  const customRangeLabel = useMemo(() => {
    if (!dateRange[0] && !dateRange[1]) return 'Custom';
    const start = dateRange[0] ? formatShortDate(dateRange[0]) : 'Start';
    const end = dateRange[1] ? formatShortDate(dateRange[1]) : 'End';
    return `${start} — ${end}`;
  }, [dateRange]);

  const displaySnapshot = useMemo(
    () => buildCashbookDisplaySnapshot(snapshot, {
      dateRange,
      hideCreditHistory,
      todayKey,
    }),
    [snapshot, dateRange, hideCreditHistory, todayKey]
  );

  const summarySnapshot = useMemo(
    () => buildCashbookDisplaySnapshot(snapshot, {
      dateRange: ['', ''],
      hideCreditHistory,
      todayKey,
    }),
    [snapshot, hideCreditHistory, todayKey]
  );

  const filteredGroups = Array.isArray(displaySnapshot?.groups) ? displaySnapshot.groups : [];
  const latestEditableEntry = useMemo(() => {
    for (const group of filteredGroups) {
      const entries = Array.isArray(group?.entries) ? group.entries : [];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (isEditableCashbookEntry(entry)) return entry;
      }
    }
    return null;
  }, [filteredGroups]);

  useEffect(() => {
    if (!todayKey || hasInitializedDateRange.current) return;
    if (!dateRange[0] && !dateRange[1]) {
      setDateRange([todayKey, todayKey]);
      hasInitializedDateRange.current = true;
    }
  }, [dateRange, todayKey]);

  const openingNumeric = Number(openingDraft);
  const openingDirty = snapshot?.today_summary
    ? String(snapshot.today_summary.opening_balance ?? 0) !== String(openingDraft)
    : false;
  const openingInvalid = openingDraft !== '' && !Number.isFinite(openingNumeric);

  const summary = summarySnapshot?.today_summary || null;
  const summaryOpening = summary?.opening_balance ?? 0;
  const summaryIn = summary?.in_total ?? 0;
  const summaryOut = summary?.out_total ?? 0;
  const summaryClosing = summary?.closing_balance ?? 0;

  const commitRecentEntryFlash = useCallback((entryId) => {
    if (!entryId) return;
    setRecentEntryId(String(entryId));
    setRecentEntryFlash('is-flash');
    if (recentEntryTimerRef.current) clearTimeout(recentEntryTimerRef.current);
    recentEntryTimerRef.current = setTimeout(() => {
      setRecentEntryFlash('');
    }, 1800);
  }, []);

  const clearUndoState = useCallback(() => {
    setLastDeletedEntry(null);
    setUndoToastVisible(false);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoHideTimerRef.current) {
      clearTimeout(undoHideTimerRef.current);
      undoHideTimerRef.current = null;
    }
  }, []);

  const queueUndoState = useCallback((entry) => {
    if (!entry) return;
    setLastDeletedEntry(entry);
    setUndoToastVisible(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoHideTimerRef.current) clearTimeout(undoHideTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoToastVisible(false);
      undoHideTimerRef.current = setTimeout(() => {
        clearUndoState();
      }, 140);
    }, 2500);
  }, [clearUndoState]);

  const repeatLastEntry = () => {
    if (!latestEditableEntry) return;
    setComposerDraft(buildComposerLineFromEntry(latestEditableEntry));
    setFormError('');
    composerInputRef.current?.focus();
  };

  const handleDeleteLastEntry = async () => {
    if (composerDraft || !latestEditableEntry?.id) return;

    try {
      setEntrySaving(true);
      setFormError('');
      const response = await cashbookApi.deleteEntry(latestEditableEntry.id);
      if (response?.snapshot) {
        setSnapshot(response.snapshot);
      } else {
        await loadSnapshot({ silent: true });
      }
      queueUndoState(response?.deleted_entry || latestEditableEntry);
      composerInputRef.current?.focus();
    } catch (err) {
      setFormError(err?.message || 'Failed to delete last entry.');
    } finally {
      setEntrySaving(false);
    }
  };

  const buildRestorePayload = useCallback((entry) => {
    if (!entry) return null;
    const type = String(entry.type || '').trim();
    const date = String(entry.date || todayKey || '').trim();
    if (!type || !date) return null;

    const payload = { date, type };
    if (type === 'task') {
      payload.note = String(entry.note || '').trim();
      if (entry.time) payload.time = entry.time;
      return payload;
    }

    payload.amount = Math.abs(Number(entry.amount || 0));
    if (entry.note) payload.note = String(entry.note || '').trim();
    if (type === 'adjustment') {
      const signedAmount = Number(entry.signed_amount ?? 0);
      payload.adjustment_direction = signedAmount < 0 ? 'reduce' : 'add';
    }
    if (entry.time) payload.time = entry.time;
    return payload;
  }, [todayKey]);

  const handleUndoDelete = useCallback(async () => {
    if (!lastDeletedEntry) return;
    const payload = buildRestorePayload(lastDeletedEntry);
    if (!payload) return;

    try {
      setEntrySaving(true);
      setFormError('');
      const response = await cashbookApi.createEntry(payload);
      if (response?.snapshot) {
        setSnapshot(response.snapshot);
      } else {
        await loadSnapshot({ silent: true });
      }
      commitRecentEntryFlash(response?.entry?.id);
      clearUndoState();
      composerInputRef.current?.focus();
    } catch (err) {
      setFormError(err?.message || 'Failed to restore entry.');
    } finally {
      setEntrySaving(false);
    }
  }, [buildRestorePayload, clearUndoState, commitRecentEntryFlash, lastDeletedEntry, loadSnapshot]);

  const handleStartEdit = useCallback((entry) => {
    if (!isEditableCashbookEntry(entry)) return;
    setFormError('');
    const nextDraft = buildComposerLineFromEntry(entry);
    setEditingEntryId(String(entry.id));
    setEditingDraft(nextDraft);
    editingEntryIdRef.current = String(entry.id);
    editingDraftRef.current = nextDraft;
    editingSavingRef.current = false;
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.setSelectionRange?.(editInputRef.current.value.length, editInputRef.current.value.length);
    }, 0);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingEntryId('');
    setEditingDraft('');
    editingEntryIdRef.current = '';
    editingDraftRef.current = '';
    setFormError('');
    composerInputRef.current?.focus();
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const entryId = editingEntryIdRef.current;
    const draft = editingDraftRef.current;
    if (!entryId || editingSavingRef.current) return;
    const parsed = parseCashbookLine(draft);
    if (!parsed) {
      setFormError('Type a cash line like `500 rice`, `-150 petrol`, `+2000`, or `task: call supplier`.');
      return;
    }

    try {
      setEditingSaving(true);
      editingSavingRef.current = true;
      setFormError('');
      clearUndoState();
      const response = await cashbookApi.updateEntry(entryId, {
        type: parsed.type,
        amount: parsed.type === 'task' ? undefined : parsed.amount,
        note: parsed.note,
        adjustment_direction: parsed.type === 'adjustment' ? (parsed.adjustment_direction || 'add') : undefined,
      });
      if (response?.snapshot) {
        setSnapshot(response.snapshot);
      } else {
        await loadSnapshot({ silent: true });
      }
      commitRecentEntryFlash(response?.entry?.id);
      setEditingEntryId('');
      setEditingDraft('');
      editingEntryIdRef.current = '';
      editingDraftRef.current = '';
      setTimeout(() => composerInputRef.current?.focus(), 0);
    } catch (err) {
      setFormError(err?.message || 'Failed to update entry.');
    } finally {
      setEditingSaving(false);
      editingSavingRef.current = false;
    }
  }, [clearUndoState, commitRecentEntryFlash, loadSnapshot]);

  const handleEditDraftChange = useCallback((value) => {
    setEditingDraft(value);
    editingDraftRef.current = value;
    setFormError('');
  }, []);

  const handleEditKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSaveEdit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
    }
  }, [handleCancelEdit, handleSaveEdit]);

  const handleSaveEntry = async () => {
    if (!todayKey) return;
    setFormError('');
    const parsed = parseCashbookLine(composerDraft);
    if (!parsed) {
      setFormError('Type a cash line like `500 rice`, `-150 petrol`, `+2000`, or `task: call supplier`.');
      return;
    }

    const payload = { date: todayKey, type: parsed.type };
    payload.time = getClientTimeToken();
    if (parsed.type !== 'task') {
      payload.amount = parsed.amount;
      if (parsed.note) payload.note = parsed.note;
      if (parsed.type === 'adjustment') {
        payload.adjustment_direction = parsed.adjustment_direction || 'add';
      }
    } else {
      payload.note = parsed.note;
    }

    try {
      setEntrySaving(true);
      clearUndoState();
      const response = await cashbookApi.createEntry(payload);
      if (response?.snapshot) {
        setSnapshot(response.snapshot);
      } else {
        await loadSnapshot({ silent: true });
      }
      commitRecentEntryFlash(response?.entry?.id);
      setComposerDraft('');
      setFormError('');
      setEditingEntryId('');
      setEditingDraft('');
      composerInputRef.current?.focus();
    } catch (err) {
      setFormError(err?.message || 'Failed to save entry.');
    } finally {
      setEntrySaving(false);
    }
  };

  const handleSaveOpening = async () => {
    if (!todayKey || openingInvalid || openingDraft === '') return;
    try {
      setOpeningSaving(true);
      setError('');
      const response = await cashbookApi.updateOpeningBalance({
        date: todayKey,
        opening_balance: Number(openingDraft),
      });
      if (response?.snapshot) {
        setSnapshot(response.snapshot);
      } else {
        await loadSnapshot({ silent: true });
      }
      composerInputRef.current?.focus();
    } catch (err) {
      setError(err?.message || 'Failed to update opening balance.');
    } finally {
      setOpeningSaving(false);
    }
  };

  return (
    <section className={`cashbook-page${isMobile ? ' is-mobile' : ''}`}>
      <BackofficePageHeader
        className="page-header cashbook-header"
        title="Cashbook"
        subtitle="Write the line, keep the list clean, and use filters only when you need them."
      />

      {error ? <p className="cashbook-error">{error}</p> : null}

      <div className={`cashbook-toprail${isMobile ? ' is-mobile' : ''}`}>
        <div className="cashbook-topbar">
          <div className="cashbook-topbar-title">
            <p className="cashbook-summary-kicker">{todayLabel.toUpperCase()} ({todayDateLabel})</p>
            <h2 className="cashbook-panel-title">Cashbook</h2>
          </div>
          <div className="cashbook-topbar-actions">
            <button
              type="button"
              className="cashbook-refresh-icon-btn"
              onClick={() => loadSnapshot()}
              disabled={loading}
              aria-label={loading ? 'Refreshing' : 'Refresh'}
              title={loading ? 'Refreshing' : 'Refresh'}
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span className="sr-only">{loading ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        <div className="cashbook-inline-controls">
          <div className="cashbook-opening-inline">
            <label htmlFor="cashbook-opening-balance" className="cashbook-opening-label">Opening</label>
            <input
              id="cashbook-opening-balance"
              type="number"
              inputMode="decimal"
              value={openingDraft}
              onChange={(event) => setOpeningDraft(String(event.target.value || '').trimStart())}
              disabled={!summary || openingSaving}
            />
            <button
              type="button"
              className="cashbook-opening-action"
              onClick={handleSaveOpening}
              disabled={!openingDirty || openingInvalid || openingSaving}
            >
              {openingSaving ? 'Saving...' : 'Save'}
            </button>
            {openingDirty ? (
              <button
                type="button"
                className="cashbook-opening-action is-muted"
                onClick={() => setOpeningDraft(String(summaryOpening))}
                disabled={openingSaving}
              >
                Reset
              </button>
            ) : null}
          </div>

          <div
            className={`cashbook-composer${composerFocused ? ' is-focused' : ''}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                composerInputRef.current?.focus();
              }
            }}
          >
            <input
              ref={composerInputRef}
              className="cashbook-line-input"
              type="text"
              value={composerDraft}
              onChange={(event) => {
                setComposerDraft(event.target.value);
              }}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Tab' && !event.shiftKey) {
                  event.preventDefault();
                  const current = String(composerDraft || '');
                  if (!current.trim()) {
                    setComposerDraft('+');
                  } else if (/^\s*\+/.test(current)) {
                    setComposerDraft(current.replace(/^\s*\+/, '-'));
                  } else if (/^\s*-/.test(current)) {
                    setComposerDraft(current.replace(/^\s*-\s*/, '+'));
                  } else {
                    setComposerDraft(`+${current}`);
                  }
                  composerInputRef.current?.focus();
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  repeatLastEntry();
                  return;
                }

                if (event.key === 'Backspace' && !composerDraft && latestEditableEntry?.id) {
                  event.preventDefault();
                  void handleDeleteLastEntry();
                  return;
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSaveEntry();
                }
              }}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              autoFocus
              placeholder="500 rice, -150 petrol, +2000, task: call supplier"
            />
          </div>

          {lastDeletedEntry ? (
            <div
              className={`cashbook-undo-toast${undoToastVisible ? ' is-visible' : ' is-hidden'}`}
              role="status"
              aria-live="polite"
            >
              <span>Entry deleted</span>
              <button
                type="button"
                className="cashbook-undo-button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void handleUndoDelete()}
                disabled={entrySaving}
              >
                Undo
              </button>
            </div>
          ) : null}

          {formError ? <p className="cashbook-form-error">{formError}</p> : null}
        </div>

        <div className="cashbook-summary-strip" aria-label="Today summary">
          <span>Opening <strong>{formatCurrency(summaryOpening)}</strong></span>
          <span>In <strong>{formatCurrency(summaryIn)}</strong></span>
          <span className="is-out">Out <strong>{formatCurrency(summaryOut)}</strong></span>
          <span>Closing <strong>{formatCurrency(summaryClosing)}</strong></span>
        </div>

        <div className="cashbook-analysis-panel" ref={analysisPanelRef}>
          <div className="cashbook-analysis-row" role="toolbar" aria-label="Cashbook filters">
            {dateRangePresets.map((preset) => {
              const isActive = activeDatePreset?.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`cashbook-preset-chip${isActive ? ' is-active' : ''}`}
                  onClick={() => {
                    setDateRange(preset.value);
                    setShowAnalysisPanel(false);
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`cashbook-preset-chip cashbook-preset-custom${showAnalysisPanel || isCustomDateRange ? ' is-active' : ''}`}
              onClick={() => setShowAnalysisPanel((current) => !current)}
              aria-expanded={showAnalysisPanel}
            >
              {isCustomDateRange ? customRangeLabel : 'Custom'} {showAnalysisPanel ? '▴' : '▾'}
            </button>
          </div>
          {showAnalysisPanel ? (
            <div className="cashbook-custom-popover" role="dialog" aria-label="Custom cashbook filter">
              <div className="cashbook-custom-row">
                <label className={`cashbook-custom-field${calendarField === 'from' ? ' is-active' : ''}`}>
                  <span>From</span>
                  <div className="cashbook-custom-input-shell">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customFromInput}
                      placeholder="DD/MM/YYYY"
                      onChange={(event) => {
                        const nextValue = normalizeDateInputDraft(event.target.value);
                        setCustomFromInput(nextValue);
                        setCustomDateError('');
                        const parsed = parseDateInputValue(nextValue);
                        if (!parsed) return;
                        const nextRange = normalizeDateRange(parsed, dateRange[1]);
                        setDateRange(nextRange);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          setCalendarField('from');
                          setCalendarMonthToken(parseDateInputValue(customFromInput) || parseDateInputValue(customToInput) || dateRange[0] || dateRange[1] || todayKey || '');
                        }
                        if (event.key === 'Enter') {
                          const parsed = parseDateInputValue(customFromInput);
                          if (parsed) {
                            const nextRange = normalizeDateRange(parsed, dateRange[1]);
                            setDateRange(nextRange);
                          } else if (customFromInput.trim()) {
                            setCustomDateError('Use DD/MM/YYYY');
                          }
                        }
                      }}
                      onBlur={() => {
                        if (customFromInput && !parseDateInputValue(customFromInput)) {
                          setCustomDateError('Use DD/MM/YYYY');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="cashbook-custom-calendar-button"
                      onClick={() => {
                        setCalendarField((current) => (current === 'from' ? '' : 'from'));
                        setCalendarMonthToken(parseDateInputValue(customFromInput) || dateRange[0] || dateRange[1] || todayKey || '');
                        setCustomDateError('');
                      }}
                      aria-label="Open from date picker"
                    >
                      <Calendar size={13} aria-hidden="true" />
                    </button>
                  </div>
                  {customDateError && customFromInput && !parseDateInputValue(customFromInput) ? (
                    <span className="cashbook-custom-error">{customDateError}</span>
                  ) : null}
                </label>
                <label className={`cashbook-custom-field${calendarField === 'to' ? ' is-active' : ''}`}>
                  <span>To</span>
                  <div className="cashbook-custom-input-shell">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customToInput}
                      placeholder="DD/MM/YYYY"
                      onChange={(event) => {
                        const nextValue = normalizeDateInputDraft(event.target.value);
                        setCustomToInput(nextValue);
                        setCustomDateError('');
                        const parsed = parseDateInputValue(nextValue);
                        if (!parsed) return;
                        const nextRange = normalizeDateRange(dateRange[0], parsed);
                        setDateRange(nextRange);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          setCalendarField('to');
                          setCalendarMonthToken(parseDateInputValue(customToInput) || parseDateInputValue(customFromInput) || dateRange[0] || dateRange[1] || todayKey || '');
                        }
                        if (event.key === 'Enter') {
                          const parsed = parseDateInputValue(customToInput);
                          if (parsed) {
                            const nextRange = normalizeDateRange(dateRange[0], parsed);
                            setDateRange(nextRange);
                          } else if (customToInput.trim()) {
                            setCustomDateError('Use DD/MM/YYYY');
                          }
                        }
                      }}
                      onBlur={() => {
                        if (customToInput && !parseDateInputValue(customToInput)) {
                          setCustomDateError('Use DD/MM/YYYY');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="cashbook-custom-calendar-button"
                      onClick={() => {
                        setCalendarField((current) => (current === 'to' ? '' : 'to'));
                        setCalendarMonthToken(parseDateInputValue(customToInput) || dateRange[1] || dateRange[0] || todayKey || '');
                        setCustomDateError('');
                      }}
                      aria-label="Open to date picker"
                    >
                      <Calendar size={13} aria-hidden="true" />
                    </button>
                  </div>
                  {customDateError && customToInput && !parseDateInputValue(customToInput) ? (
                    <span className="cashbook-custom-error">{customDateError}</span>
                  ) : null}
                </label>
              </div>
              <div className="cashbook-analysis-toggle-row">
                <label className="cashbook-toggle">
                  <input
                    type="checkbox"
                    checked={showRunningBalance}
                    onChange={(event) => setShowRunningBalance(event.target.checked)}
                  />
                  Running balance
                </label>
                <label className="cashbook-toggle">
                  <input
                    type="checkbox"
                    checked={hideCreditHistory}
                    onChange={(event) => setHideCreditHistory(event.target.checked)}
                  />
                  Hide credit history
                </label>
              </div>
              {calendarField ? (
                <div className="cashbook-mini-calendar-popover">
                  <MiniCalendar
                    monthToken={calendarMonthToken || parseDateInputValue(customFromInput) || parseDateInputValue(customToInput) || dateRange[0] || dateRange[1] || todayKey || ''}
                    selectedStartDate={parseDateInputValue(customFromInput) || dateRange[0] || ''}
                    selectedEndDate={parseDateInputValue(customToInput) || dateRange[1] || ''}
                    hoverDate={hoverDate}
                    onDateHover={setHoverDate}
                    onDateSelect={(token) => {
                      if (!token) return;
                      setCustomDateError('');
                      if (calendarField === 'from') {
                        const nextRange = normalizeDateRange(token, dateRange[1]);
                        setDateRange(nextRange);
                        setCustomFromInput(formatDateInputValue(token));
                        if (parseDateInputValue(customToInput)) {
                          setCalendarField('');
                        } else {
                          setCalendarField('to');
                          setCalendarMonthToken(shiftMonthToken(token, 1));
                        }
                      } else if (calendarField === 'to') {
                        const nextRange = normalizeDateRange(dateRange[0], token);
                        setDateRange(nextRange);
                        setCustomToInput(formatDateInputValue(token));
                        if (parseDateInputValue(customFromInput)) {
                          setCalendarField('');
                        } else {
                          setCalendarField('from');
                          setCalendarMonthToken(shiftMonthToken(token, -1));
                        }
                      }
                    }}
                    onMonthChange={(delta) => {
                      setCalendarMonthToken((current) => shiftMonthToken(current || todayKey || dateRange[0] || dateRange[1] || new Date(), delta));
                    }}
                    weekStartsOn={1}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="cashbook-timeline">
        {loading && !snapshot ? (
          <div className="cashbook-loading">Loading cashbook...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="cashbook-empty">
            <p>No cashbook activity yet.</p>
            <p>Write a line above and the timeline will build itself.</p>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <section key={group.date} className="cashbook-group">
              <div className="cashbook-group-header">
                <div className="cashbook-group-header-time" aria-hidden="true" />
                <div className="cashbook-group-header-main">
                  <h3>{group.label}</h3>
                  <p>{group.entry_count} line{group.entry_count === 1 ? '' : 's'}</p>
                </div>
                <div className="cashbook-group-header-amount">
                  <span>Closing</span>
                  <strong>{formatCurrency(group.closing_balance)}</strong>
                </div>
              </div>
              <div className="cashbook-group-entries">
                {group.entries.length === 0 ? (
                  <div className="cashbook-empty-row">No entries for this day.</div>
                ) : group.entries.map((entry) => {
                  const isRecent = String(entry.id) === String(recentEntryId);
                  const isEditing = String(editingEntryId) === String(entry.id);
                  return (
                    <CashbookEntryRow
                      key={entry.id}
                      entry={entry}
                      isEditing={isEditing}
                      editDraft={isEditing ? editingDraft : ''}
                      editInputRef={isEditing ? editInputRef : null}
                      onStartEdit={handleStartEdit}
                      onEditDraftChange={handleEditDraftChange}
                      onEditKeyDown={handleEditKeyDown}
                      showRunningBalance={showRunningBalance}
                      isRecent={isRecent}
                      recentEntryFlash={recentEntryFlash}
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

export default CashbookSection;
