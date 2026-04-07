import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  FileText,
  MoreHorizontal,
  PenSquare,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { parseDateInputValue, toLocalDateKey } from '../../../../../../shared/utils/dateTime';

const ROUTINE_WINDOW_DAYS = 7;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const asAmount = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const normalizeDateKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (DATE_KEY_PATTERN.test(raw)) return raw;
  const parsed = parseDateInputValue(raw);
  return parsed ? toLocalDateKey(parsed) : '';
};

const addDaysToDateKey = (dateKey, offset = 0) => {
  const parsed = parseDateInputValue(dateKey);
  if (!parsed) return '';
  parsed.setDate(parsed.getDate() + Number(offset || 0));
  return toLocalDateKey(parsed);
};

const formatDayLabel = (dateKey) => {
  const parsed = parseDateInputValue(dateKey);
  if (!parsed) return dateKey || '-';
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const buildDaySeries = (todayKey) => Array.from({ length: ROUTINE_WINDOW_DAYS }, (_, index) => {
  const dateKey = addDaysToDateKey(todayKey, index);
  return {
    dateKey,
    label: formatDayLabel(dateKey),
    relativeLabel: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatDayLabel(dateKey),
    tone: index === 0 ? 'today' : index === 1 ? 'tomorrow' : 'other',
    isToday: index === 0,
  };
});

const getScheduleBaseKey = (entry = {}) => {
  const supplierId = String(entry?.supplier_id || '').trim();
  if (supplierId) return `supplier:${supplierId}`;
  const distributorId = String(entry?.distributor_id || '').trim();
  return distributorId ? `distributor:${distributorId}` : '';
};

const isSupplierScopedEntry = (entry = {}) => {
  const supplierId = Number(entry?.supplier_id || 0);
  if (supplierId > 0) return true;
  const supplierName = String(entry?.supplier_name || '').trim().toLowerCase();
  const distributorName = String(entry?.distributor_name || '').trim().toLowerCase();
  return Boolean(supplierName && supplierName !== distributorName);
};

const getEntryPendingDue = (entry = {}) => (
  asAmount(entry?.po_balance_due) + (isSupplierScopedEntry(entry) ? 0 : asAmount(entry?.ledger_balance))
);

const getDisplayName = (entry = {}) => (
  String(entry?.supplier_name || entry?.distributor_name || 'Supplier').trim() || 'Supplier'
);

const getSuggestedItemNames = (entry = {}, limit = 3) => (
  (Array.isArray(entry?.suggested_items) ? entry.suggested_items : [])
    .map((item) => String(item?.product_name || item?.name || '').trim())
    .filter(Boolean)
    .slice(0, limit)
);

const getSupplierRangeNames = (entry = {}, limit = 3) => (
  (Array.isArray(entry?.products_supplied_all) ? entry.products_supplied_all : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit)
);

const getScheduleTypeLabel = (value = '') => {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'daily') return 'Daily';
  if (type === 'weekly') return 'Weekly';
  return 'Irregular';
};

const buildPreparePreview = (entries = [], limit = 4) => {
  const picked = new Set();
  const names = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const candidates = [
      ...getSuggestedItemNames(entry, limit),
      ...getSupplierRangeNames(entry, limit),
    ];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim().toLowerCase();
      if (!normalized || picked.has(normalized)) continue;
      picked.add(normalized);
      names.push(String(candidate || '').trim());
      if (names.length >= limit) {
        return names;
      }
    }
  }
  return names;
};

const buildVisitStateMap = (entries = []) => {
  const next = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const supplierId = Number(entry?.supplier_id || 0);
    const dateKey = normalizeDateKey(entry?.date);
    if (!supplierId || !dateKey) return;
    next.set(`${supplierId}@@${dateKey}`, {
      poDone: Boolean(entry?.poDone),
      paymentDone: Boolean(entry?.paymentDone),
      visitClosed: Boolean(entry?.visitClosed),
      isHandled: Boolean(entry?.isHandled),
    });
  });
  return next;
};

const getOccurrenceVisitState = (entry = {}, sourceDate = '', visitStateMap = new Map()) => {
  const supplierId = Number(entry?.supplier_id || 0);
  if (!supplierId || !sourceDate) {
    return {
      poDone: false,
      paymentDone: false,
      visitClosed: false,
      isHandled: false,
    };
  }
  return visitStateMap.get(`${supplierId}@@${sourceDate}`) || {
    poDone: false,
    paymentDone: false,
    visitClosed: false,
    isHandled: false,
  };
};

const buildRoutineBoard = ({ operationsSummary, todayKey }) => {
  const daySeries = buildDaySeries(todayKey);
  const visibleDayKeys = new Set(daySeries.map((day) => day.dateKey));
  const activeEntriesByDay = new Map(daySeries.map((day) => [day.dateKey, []]));
  const handledEntriesByDay = new Map(daySeries.map((day) => [day.dateKey, []]));
  const visitStateMap = buildVisitStateMap(operationsSummary?.supplier_visits);
  let unscheduledCount = 0;

  const baseEntries = Array.isArray(operationsSummary?.weekly_distributors)
    ? operationsSummary.weekly_distributors
    : [];

  baseEntries.forEach((entry) => {
    const baseKey = getScheduleBaseKey(entry);
    if (!baseKey) return;

    const scheduleType = String(entry?.schedule_type || 'irregular').trim().toLowerCase() || 'irregular';
    const originalScheduleDate = normalizeDateKey(entry?.schedule_date);
    const occurrenceDates = scheduleType === 'daily'
      ? daySeries.map((day) => day.dateKey)
      : (originalScheduleDate && visibleDayKeys.has(originalScheduleDate) ? [originalScheduleDate] : []);

    if (!occurrenceDates.length && !originalScheduleDate) {
      unscheduledCount += 1;
    }

    occurrenceDates.forEach((sourceDate) => {
      const visitState = getOccurrenceVisitState(entry, sourceDate, visitStateMap);
      const pendingDue = getEntryPendingDue(entry);
      const preparedNames = getSuggestedItemNames(entry).length
        ? getSuggestedItemNames(entry)
        : getSupplierRangeNames(entry);
      const normalizedEntry = {
        ...entry,
        base_key: baseKey,
        occurrence_key: `${baseKey}@@${sourceDate}`,
        source_date: sourceDate,
        schedule_date: sourceDate,
        original_schedule_date: sourceDate,
        display_name: getDisplayName(entry),
        prepared_names: preparedNames,
        pending_due: pendingDue,
        schedule_type: scheduleType,
        poDone: visitState.poDone,
        paymentDone: visitState.paymentDone,
        visitClosed: visitState.visitClosed,
        isHandled: visitState.isHandled,
        hidden_reason: visitState.poDone ? 'PO confirmed for this visit' : 'Visit closed for today',
      };

      if (visitState.isHandled) {
        handledEntriesByDay.get(sourceDate)?.push(normalizedEntry);
        return;
      }

      activeEntriesByDay.get(sourceDate)?.push(normalizedEntry);
    });
  });

  const days = daySeries.map((day) => {
    const entries = (activeEntriesByDay.get(day.dateKey) || [])
      .sort((left, right) => (
        Number(Boolean(right?.payable_order_id)) - Number(Boolean(left?.payable_order_id))
        || Number(Boolean(left?.paymentDone)) - Number(Boolean(right?.paymentDone))
        || asAmount(right?.overdue_amount) - asAmount(left?.overdue_amount)
        || right.pending_due - left.pending_due
        || String(left.display_name || '').localeCompare(String(right.display_name || ''))
      ));
    const handledEntries = (handledEntriesByDay.get(day.dateKey) || [])
      .sort((left, right) => String(left.display_name || '').localeCompare(String(right.display_name || '')));
    return {
      ...day,
      entries,
      handled_entries: handledEntries,
      supplier_count: entries.length,
      handled_count: handledEntries.length,
      total_pending_due: entries.reduce((sum, entry) => sum + Number(entry.pending_due || 0), 0),
      prepare_preview: buildPreparePreview(entries),
    };
  });

  const todayDay = days[0] || null;
  const todayEntries = Array.isArray(todayDay?.entries) ? todayDay.entries : [];

  return {
    days,
    summary: {
      today_supplier_count: Number(todayDay?.supplier_count || 0),
      today_total_due: Number(todayDay?.total_pending_due || 0),
      po_pending_count: todayEntries.filter((entry) => !entry.poDone).length,
      payment_pending_count: todayEntries.filter((entry) => !entry.paymentDone).length,
      handled_count: days.reduce((sum, day) => sum + Number(day.handled_count || 0), 0),
      today_handled_count: Number(todayDay?.handled_count || 0),
      unscheduled_count: unscheduledCount,
    },
  };
};

const buildDueHint = (entry, formatCurrency) => {
  const parts = [];
  const poBalance = asAmount(entry?.po_balance_due);
  const showLedgerBalance = !isSupplierScopedEntry(entry) && asAmount(entry?.ledger_balance) > 0;
  const overdueAmount = asAmount(entry?.overdue_amount);
  const dueTodayAmount = asAmount(entry?.due_today_amount);

  if (poBalance > 0) parts.push(`PO ${formatCurrency(poBalance)}`);
  if (showLedgerBalance) parts.push(`Ledger ${formatCurrency(asAmount(entry?.ledger_balance))}`);
  if (overdueAmount > 0) parts.push(`Overdue ${formatCurrency(overdueAmount)}`);
  if (dueTodayAmount > 0) parts.push(`Due today ${formatCurrency(dueTodayAmount)}`);

  return parts.join(' | ') || 'No due';
};

const RoutineStatusIcon = ({ icon: Icon, label, tone = 'pending' }) => (
  <span className={`purchase-routine-status-icon ${tone}`} title={label} aria-label={label}>
    <Icon size={14} />
  </span>
);

const closeRoutineMenu = (event) => {
  const details = event.currentTarget.closest('details');
  if (details) details.removeAttribute('open');
};

const RoutineActionMenu = ({ actions = [] }) => {
  const visibleActions = actions.filter(Boolean);
  if (!visibleActions.length) return null;

  return (
    <details className="purchase-routine-menu">
      <summary aria-label="More actions">
        <MoreHorizontal size={16} />
      </summary>
      <div className="purchase-routine-menu-panel">
        {visibleActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              className="purchase-routine-menu-item"
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (action.disabled) return;
                closeRoutineMenu(event);
                await action.onClick?.();
              }}
              disabled={action.disabled}
            >
              <Icon size={14} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
};

const PurchasePlanningPanel = ({
  operationsSummary,
  onDraftDistributor,
  onOpenPayable,
  onCloseVisit,
  onReopenVisit,
  formatCurrency,
}) => {
  const todayKey = normalizeDateKey(operationsSummary?.today) || toLocalDateKey(new Date());
  const [showHandled, setShowHandled] = useState(false);
  const [visitMutationKey, setVisitMutationKey] = useState('');

  const routineBoard = useMemo(
    () => buildRoutineBoard({
      operationsSummary,
      todayKey,
    }),
    [operationsSummary, todayKey]
  );

  const handleDraftSupplier = (entry) => {
    onDraftDistributor(entry.distributor_id, {
      distributor_name: entry.distributor_name,
      supplier_id: entry.supplier_id,
      supplier_name: entry.supplier_name,
      planned_order_date: entry.source_date,
      expected_delivery: entry.schedule_date,
      suggested_items: entry.suggested_items || [],
    });
  };

  const handleCloseVisit = async (entry) => {
    if (typeof onCloseVisit !== 'function') return;
    const mutationKey = `${entry.occurrence_key}::close`;
    setVisitMutationKey(mutationKey);
    try {
      await onCloseVisit({
        supplierId: entry.supplier_id,
        date: entry.source_date,
      });
    } finally {
      setVisitMutationKey('');
    }
  };

  const handleReopenVisit = async (entry) => {
    if (typeof onReopenVisit !== 'function') return;
    const mutationKey = `${entry.occurrence_key}::reopen`;
    setVisitMutationKey(mutationKey);
    try {
      await onReopenVisit({
        supplierId: entry.supplier_id,
        date: entry.source_date,
      });
    } finally {
      setVisitMutationKey('');
    }
  };

  const summaryCards = [
    {
      key: 'today',
      icon: CalendarDays,
      label: 'Today',
      value: `${routineBoard.summary.today_supplier_count} supplier${routineBoard.summary.today_supplier_count === 1 ? '' : 's'}`,
      meta: `Pending ${formatCurrency(routineBoard.summary.today_total_due)}`,
    },
    {
      key: 'po',
      icon: FileText,
      label: 'PO Pending',
      value: String(routineBoard.summary.po_pending_count),
      meta: 'Still need a confirmed PO',
    },
    {
      key: 'payment',
      icon: Wallet,
      label: 'Payment Pending',
      value: String(routineBoard.summary.payment_pending_count),
      meta: 'Display-only follow-up',
    },
    {
      key: 'handled',
      icon: CheckCircle2,
      label: 'Done',
      value: String(routineBoard.summary.today_handled_count),
      meta: 'PO confirmed or visit closed today',
    },
  ];

  return (
    <div className="purchase-sector-grid single">
      <section className="purchase-ops-panel purchase-routine-panel">
        <div className="purchase-ops-panel-title">
          <CalendarDays size={16} />
          <span>Supplier Routine</span>
        </div>

        <div className="purchase-routine-summary-grid">
          {summaryCards.map(({ key, icon: Icon, label, value, meta }) => (
            <article key={key} className="purchase-routine-summary-card">
              <div className="purchase-routine-summary-head">
                <Icon size={15} />
                <span>{label}</span>
              </div>
              <strong>{value}</strong>
              <small>{meta}</small>
            </article>
          ))}
        </div>

        {routineBoard.summary.handled_count > 0 ? (
          <div className="purchase-routine-toolbar">
            <div className="purchase-routine-toolbar-actions">
              <button
                type="button"
                className="admin-btn secondary small"
                onClick={() => setShowHandled((current) => !current)}
              >
                {showHandled ? 'Hide handled' : `Show handled (${routineBoard.summary.handled_count})`}
              </button>
            </div>
          </div>
        ) : null}

        <div className="purchase-routine-days">
          {routineBoard.days.map((day) => (
            <section key={day.dateKey} className={`purchase-routine-day-card is-${day.tone}`}>
              <div className="purchase-routine-day-head">
                <div>
                  <strong>{day.relativeLabel}</strong>
                  <p>{day.label}</p>
                </div>
                <div className="purchase-routine-day-totals">
                  <span>{day.supplier_count} supplier{day.supplier_count === 1 ? '' : 's'}</span>
                  <strong>{formatCurrency(day.total_pending_due)}</strong>
                </div>
              </div>

              {day.prepare_preview.length ? (
                <p className="purchase-routine-day-prepare">
                  Prepare: {day.prepare_preview.join(', ')}
                </p>
              ) : null}

              {day.entries.length ? (
                <div className="purchase-routine-entry-list">
                  {day.entries.map((entry) => {
                    const scheduleContext = entry.supplier_name && entry.distributor_name
                      && String(entry.supplier_name).trim().toLowerCase() !== String(entry.distributor_name).trim().toLowerCase()
                      ? entry.distributor_name
                      : '';
                    const prepareNames = Array.isArray(entry.prepared_names) ? entry.prepared_names : [];
                    const closeBusy = visitMutationKey === `${entry.occurrence_key}::close`;
                    const noveltyCount = Number(entry?.novelty_summary?.total_count || 0);
                    const dueHint = buildDueHint(entry, formatCurrency);
                    const primaryMeta = [
                      scheduleContext,
                      getScheduleTypeLabel(entry.schedule_type),
                    ].filter(Boolean);
                    const actionMenu = [
                      !entry.poDone ? {
                        key: 'draft-po',
                        label: entry.has_open_draft ? 'Edit PO' : 'Draft PO',
                        icon: PenSquare,
                        onClick: () => handleDraftSupplier(entry),
                      } : null,
                      entry.payable_order_id ? {
                        key: 'record-payment',
                        label: 'Record Payment',
                        icon: Wallet,
                        onClick: () => onOpenPayable?.(entry.payable_order_id),
                      } : null,
                      day.isToday && !entry.poDone ? {
                        key: 'close-visit',
                        label: closeBusy ? 'Closing...' : 'Close Visit',
                        icon: CheckCircle2,
                        onClick: () => handleCloseVisit(entry),
                        disabled: closeBusy,
                      } : null,
                    ];

                    return (
                      <article
                        key={entry.occurrence_key}
                        className={`purchase-routine-entry${asAmount(entry.overdue_amount) > 0 ? ' is-overdue' : ''}`}
                      >
                        <div className="purchase-routine-entry-top">
                          <div className="purchase-routine-entry-title-wrap">
                            <strong className="purchase-routine-entry-title">{entry.display_name}</strong>
                            {primaryMeta.length ? (
                              <span className="purchase-routine-entry-inline-meta">
                                {primaryMeta.join(' • ')}
                              </span>
                            ) : null}
                          </div>
                          <div className="purchase-routine-entry-amount-wrap" title={dueHint}>
                            <strong className="purchase-routine-entry-amount">{formatCurrency(entry.pending_due)}</strong>
                            <RoutineActionMenu actions={actionMenu} />
                          </div>
                        </div>

                        <div className="purchase-routine-entry-bottom">
                          <div className="purchase-routine-status-strip" aria-label="Supplier routine status">
                            <RoutineStatusIcon
                              icon={entry.poDone ? CheckCircle2 : (entry.has_open_draft ? PenSquare : FileText)}
                              tone={entry.poDone ? 'done' : (entry.has_open_draft ? 'draft' : 'pending')}
                              label={entry.poDone ? 'PO done' : (entry.has_open_draft ? 'PO draft' : 'PO pending')}
                            />
                            <RoutineStatusIcon
                              icon={Wallet}
                              tone={entry.paymentDone ? 'done' : (entry.payable_order_id ? 'attention' : 'pending')}
                              label={entry.paymentDone ? 'Payment done' : (entry.payable_order_id ? 'Payment pending' : 'No payment')}
                            />
                            {noveltyCount > 0 ? (
                              <RoutineStatusIcon
                                icon={AlertTriangle}
                                tone="attention"
                                label={`${noveltyCount} novelty alert${noveltyCount === 1 ? '' : 's'}`}
                              />
                            ) : null}
                          </div>
                          {prepareNames.length ? (
                            <p className="purchase-routine-entry-prepare" title={`Prepare: ${prepareNames.join(', ')}`}>
                              Prepare: {prepareNames.join(', ')}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="purchase-ops-empty">No supplier follow-up planned for this day.</div>
              )}

              {showHandled && day.handled_entries.length ? (
                <div className="purchase-routine-handled-list">
                  <div className="purchase-routine-handled-head">
                    <span>Handled</span>
                    <strong>{day.handled_count}</strong>
                  </div>
                  {day.handled_entries.map((entry) => {
                    const scheduleContext = entry.supplier_name && entry.distributor_name
                      && String(entry.supplier_name).trim().toLowerCase() !== String(entry.distributor_name).trim().toLowerCase()
                      ? entry.distributor_name
                      : '';
                    const prepareNames = Array.isArray(entry.prepared_names) ? entry.prepared_names : [];
                    const reopenBusy = visitMutationKey === `${entry.occurrence_key}::reopen`;
                    const noveltyCount = Number(entry?.novelty_summary?.total_count || 0);
                    const dueHint = `${buildDueHint(entry, formatCurrency)}${entry.hidden_reason ? ` | ${entry.hidden_reason}` : ''}`;
                    const primaryMeta = [
                      scheduleContext,
                      getScheduleTypeLabel(entry.schedule_type),
                      entry.visitClosed && !entry.poDone ? 'Closed' : 'Handled',
                    ].filter(Boolean);
                    const actionMenu = [
                      entry.payable_order_id ? {
                        key: 'record-payment',
                        label: 'Record Payment',
                        icon: Wallet,
                        onClick: () => onOpenPayable?.(entry.payable_order_id),
                      } : null,
                      day.isToday && entry.visitClosed ? {
                        key: 'reopen-visit',
                        label: reopenBusy ? 'Reopening...' : 'Reopen Visit',
                        icon: RotateCcw,
                        onClick: () => handleReopenVisit(entry),
                        disabled: reopenBusy,
                      } : null,
                    ];
                    return (
                      <article key={`handled-${entry.occurrence_key}`} className="purchase-routine-entry is-handled">
                        <div className="purchase-routine-entry-top">
                          <div className="purchase-routine-entry-title-wrap">
                            <strong className="purchase-routine-entry-title">{entry.display_name}</strong>
                            {primaryMeta.length ? (
                              <span className="purchase-routine-entry-inline-meta">
                                {primaryMeta.join(' • ')}
                              </span>
                            ) : null}
                          </div>
                          <div className="purchase-routine-entry-amount-wrap" title={dueHint}>
                            <strong className="purchase-routine-entry-amount">{formatCurrency(entry.pending_due)}</strong>
                            <RoutineActionMenu actions={actionMenu} />
                          </div>
                        </div>

                        <div className="purchase-routine-entry-bottom">
                          <div className="purchase-routine-status-strip" aria-label="Handled supplier status">
                            <RoutineStatusIcon
                              icon={entry.poDone ? CheckCircle2 : FileText}
                              tone={entry.poDone ? 'done' : 'pending'}
                              label={entry.poDone ? 'PO done' : 'PO pending'}
                            />
                            <RoutineStatusIcon
                              icon={Wallet}
                              tone={entry.paymentDone ? 'done' : (entry.payable_order_id ? 'attention' : 'pending')}
                              label={entry.paymentDone ? 'Payment done' : (entry.payable_order_id ? 'Payment pending' : 'No payment')}
                            />
                            {entry.visitClosed && !entry.poDone ? (
                              <RoutineStatusIcon
                                icon={CircleDashed}
                                tone="closed"
                                label="Visit closed"
                              />
                            ) : null}
                            {noveltyCount > 0 ? (
                              <RoutineStatusIcon
                                icon={AlertTriangle}
                                tone="attention"
                                label={`${noveltyCount} novelty alert${noveltyCount === 1 ? '' : 's'}`}
                              />
                            ) : null}
                          </div>
                          {prepareNames.length ? (
                            <p className="purchase-routine-entry-prepare" title={`Prepare: ${prepareNames.join(', ')}`}>
                              Prepare: {prepareNames.join(', ')}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </div>

        {routineBoard.summary.unscheduled_count > 0 ? (
          <div className="purchase-routine-unscheduled">
            {routineBoard.summary.unscheduled_count} irregular supplier
            {routineBoard.summary.unscheduled_count === 1 ? '' : 's'} do not have a predicted date yet, so they stay outside the 7-day board.
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default PurchasePlanningPanel;
