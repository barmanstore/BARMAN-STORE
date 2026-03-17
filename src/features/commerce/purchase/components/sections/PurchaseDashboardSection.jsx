import { useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  CheckCheck,
  Clock,
  DollarSign,
  Eye,
  MessageCircle,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Truck,
  Wallet,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Trash2,
} from 'lucide-react';

const sortPurchaseAnalyticsEntries = (entries = [], mode = 'balance_desc') => {
  const list = Array.isArray(entries) ? [...entries] : [];
  const asNumber = (value) => Number(value || 0);
  const asText = (value) => String(value || '').trim().toLowerCase();
  const asDate = (value) => String(value || '').trim();
  return list.sort((a, b) => {
    if (mode === 'name_asc') {
      return asText(a.distributor_name).localeCompare(asText(b.distributor_name));
    }
    if (mode === 'date_asc') {
      return asDate(a.schedule_date || a.payment_due_date || a.next_payment_due_date)
        .localeCompare(asDate(b.schedule_date || b.payment_due_date || b.next_payment_due_date))
        || asText(a.distributor_name).localeCompare(asText(b.distributor_name));
    }
    if (mode === 'overdue_desc') {
      return asNumber(b.overdue_amount || b.overdue_days) - asNumber(a.overdue_amount || a.overdue_days)
        || asNumber(b.due_today_amount || b.balance_due) - asNumber(a.due_today_amount || a.balance_due);
    }
    if (mode === 'ledger_desc') {
      return asNumber(b.ledger_balance) - asNumber(a.ledger_balance)
        || asNumber(b.po_balance_due || b.balance_due) - asNumber(a.po_balance_due || a.balance_due);
    }
    return asNumber(b.po_balance_due || b.balance_due || b.outstanding_amount)
      - asNumber(a.po_balance_due || a.balance_due || a.outstanding_amount)
      || asText(a.distributor_name).localeCompare(asText(b.distributor_name));
  });
};

const PurchaseDashboardSection = ({
  operationsLoading,
  operationsCardItems,
  operationsSummary,
  onDraftDistributor,
  onOpenOrder,
  onOpenPayable,
  onNewOrder,
  onOpenLedgerForm,
  onOpenReturn,
  rollupParams,
  setRollupParams,
  formatCurrency,
  toNumber,
}) => {
  const [todaySort, setTodaySort] = useState('overdue_desc');
  const [tomorrowSort, setTomorrowSort] = useState('balance_desc');
  const [weeklySort, setWeeklySort] = useState('date_asc');
  const [predictionSort, setPredictionSort] = useState('balance_desc');
  const [activeSector, setActiveSector] = useState('planning');
  const [pendingRollupRange, setPendingRollupRange] = useState({
    start_date: '',
    end_date: '',
  });

  const todayEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.today_distributors || [], todaySort),
    [operationsSummary.today_distributors, todaySort]
  );
  const tomorrowEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.tomorrow_distributors || [], tomorrowSort),
    [operationsSummary.tomorrow_distributors, tomorrowSort]
  );
  const weeklyEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.weekly_distributors || [], weeklySort),
    [operationsSummary.weekly_distributors, weeklySort]
  );
  const predictedEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.predicted_payments_today || [], predictionSort),
    [operationsSummary.predicted_payments_today, predictionSort]
  );
  const actionRollups = operationsSummary?.action_rollups || {};
  const rollupActions = actionRollups.actions || [];
  const rollupWeekdays = actionRollups.by_weekday || [];
  const rollupDays = actionRollups.by_day || [];
  const rollupTotals = actionRollups.totals || {};
  const rollupRangeLabel = actionRollups.range?.start_date
    ? `${actionRollups.range.start_date} -> ${actionRollups.range.end_date || actionRollups.range.start_date}`
    : 'Range not available';
  const rollupRecentDays = rollupDays.slice(-10);
  const [rollupChartMode, setRollupChartMode] = useState('total');
  const weekdayTotals = rollupWeekdays.map((entry) => ({
    weekday: entry.weekday,
    total: rollupActions.reduce((sum, action) => sum + toNumber(entry[action.key]), 0),
  }));
  const maxWeekdayTotal = Math.max(1, ...weekdayTotals.map((entry) => entry.total));
  const chartSeries = rollupChartMode === 'total'
    ? [
        {
          key: 'total',
          label: 'Total Actions',
          getValue: (entry) => rollupActions.reduce((sum, action) => sum + toNumber(entry[action.key]), 0),
        },
      ]
    : rollupActions.map((action) => ({
        key: action.key,
        label: action.label,
        getValue: (entry) => toNumber(entry[action.key]),
      }));
  const maxChartValue = Math.max(
    1,
    ...rollupWeekdays.map((entry) => {
      if (rollupChartMode === 'actions') {
        return rollupActions.reduce((sum, action) => sum + toNumber(entry[action.key]), 0);
      }
      return Math.max(...chartSeries.map((series) => series.getValue(entry)));
    })
  );

  const handleRollupPresetChange = (event) => {
    const value = event.target.value;
    if (value === 'custom') {
      setRollupParams((prev) => ({ ...prev, mode: 'custom' }));
      return;
    }
    const days = Number(value || 30);
    setRollupParams((prev) => ({
      ...prev,
      mode: String(days),
      days,
    }));
  };

  const handleApplyCustomRange = () => {
    setRollupParams((prev) => ({
      ...prev,
      mode: 'custom',
      start_date: pendingRollupRange.start_date,
      end_date: pendingRollupRange.end_date,
    }));
  };

  const handleDownloadRollupCsv = () => {
    if (!rollupDays.length) return;
    const headers = ['date', 'weekday', ...rollupActions.map((action) => action.key)];
    const lines = [
      headers.join(','),
      ...rollupDays.map((row) => [
        row.date,
        row.weekday,
        ...rollupActions.map((action) => toNumber(row[action.key])),
      ].join(',')),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase-rollups-${actionRollups.range?.start_date || 'start'}-to-${actionRollups.range?.end_date || 'end'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderRollupTable = (rows, labelKey, labelTitle, showTotals = false) => (
    <div className="purchase-ops-table-wrap">
      <table className="purchase-ops-table">
        <thead>
          <tr>
            <th>{labelTitle}</th>
            {rollupActions.map((action) => (
              <th key={action.key}>{action.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={`${labelKey}-${row[labelKey]}`}>
              <td>{row[labelKey] || '-'}</td>
              {rollupActions.map((action) => (
                <td key={`${row[labelKey]}-${action.key}`}>{toNumber(row[action.key])}</td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={1 + rollupActions.length}>No rollup data for this range.</td>
            </tr>
          )}
          {showTotals && rollupActions.length ? (
            <tr className="purchase-ops-table-total">
              <td>Total</td>
              {rollupActions.map((action) => (
                <td key={`total-${action.key}`}>{toNumber(rollupTotals[action.key])}</td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  const renderSort = (value, onChange) => (
    <select name="purchase_section_sort" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Sort section">
      <option value="balance_desc">Highest balance</option>
      <option value="overdue_desc">Most overdue</option>
      <option value="date_asc">Earliest date</option>
      <option value="ledger_desc">Highest ledger</option>
      <option value="name_asc">Name A-Z</option>
    </select>
  );

  const sectorTiles = [
    {
      key: 'planning',
      label: 'Planning',
      value: `${toNumber(operationsSummary.today_distributors?.length)} today`,
      meta: `${toNumber(operationsSummary.tomorrow_distributors?.length)} tomorrow | ${toNumber(operationsSummary.weekly_distributors?.length)} week`,
      icon: Package,
    },
    {
      key: 'payments',
      label: 'Payments',
      value: formatCurrency(toNumber(operationsSummary?.cards?.payable_today_amount)),
      meta: `${toNumber(operationsSummary.payables?.length)} due | ${toNumber(operationsSummary.predicted_payments_today?.length)} predicted`,
      icon: Wallet,
    },
    {
      key: 'deliveries',
      label: 'Deliveries',
      value: `${toNumber(operationsSummary.predicted_deliveries_next?.length)} upcoming`,
      meta: `${toNumber(operationsSummary.cards?.waiting_delivery_count)} waiting now`,
      icon: Truck,
    },
    {
      key: 'workflow',
      label: 'Workflow',
      value: `${toNumber(operationsSummary.workflow?.length)} actions`,
      meta: `${toNumber(operationsSummary.cards?.waiting_bill_count)} bills | ${toNumber(operationsSummary.cards?.close_ready_count)} close ready`,
      icon: Clock,
    },
    {
      key: 'insights',
      label: 'Insights',
      value: rollupRangeLabel,
      meta: `${toNumber(rollupTotals.payment)} payments | ${toNumber(rollupTotals.po_created)} POs`,
      icon: BarChart3,
    },
  ];

  return (
    <section className="purchase-section-shell">
      <div className="purchase-ops-hero">
        <div className="purchase-ops-header">
          <div>
            <h2>Purchase Dashboard</h2>
            <p>Plan, pay, and track every purchase action with compact, actionable panels.</p>
          </div>
          {operationsLoading && <span className="purchase-ops-loading">Refreshing...</span>}
        </div>
        <div className="purchase-ops-cards">
          {operationsCardItems.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className={`purchase-ops-card ${card.tone}`}>
                <div className="purchase-ops-card-head">
                  <span>{card.label}</span>
                  <Icon size={18} />
                </div>
                <strong>{card.value}</strong>
                <small>{card.meta}</small>
              </div>
            );
          })}
        </div>
        <div className="purchase-quick-actions">
          <button type="button" className="purchase-action-tile primary" onClick={onNewOrder}>
            <Plus size={18} />
            <span>New Purchase Order</span>
          </button>
          <button type="button" className="purchase-action-tile" onClick={onOpenLedgerForm}>
            <Wallet size={18} />
            <span>Ledger Entry</span>
          </button>
          <button type="button" className="purchase-action-tile" onClick={onOpenReturn}>
            <RotateCcw size={18} />
            <span>Return / Exchange</span>
          </button>
        </div>
        <div className="purchase-sector-tiles">
          {sectorTiles.map((tile) => {
            const Icon = tile.icon;
            const isActive = activeSector === tile.key;
            return (
              <button
                key={tile.key}
                type="button"
                className={`purchase-sector-tile ${isActive ? 'active' : ''}`}
                onClick={() => setActiveSector(tile.key)}
              >
                <div className="purchase-sector-tile-head">
                  <span>{tile.label}</span>
                  <Icon size={18} />
                </div>
                <strong>{tile.value}</strong>
                <small>{tile.meta}</small>
              </button>
            );
          })}
        </div>
        <div className="purchase-sector-details">
          {activeSector === 'planning' ? (
            <div className="purchase-sector-grid">
          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Truck size={16} />
              <span>Today Order Day</span>
            </div>
            {renderSort(todaySort, setTodaySort)}
            {todayEntries.length ? (
              todayEntries.slice(0, 6).map((entry) => (
                <div key={`today-${entry.distributor_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</p>
                    <small>
                      Due today: {formatCurrency(toNumber(entry.due_today_amount))} | Overdue: {formatCurrency(toNumber(entry.overdue_amount))}
                    </small>
                    <small>
                      PO: {formatCurrency(toNumber(entry.po_balance_due))} | Ledger: {formatCurrency(toNumber(entry.ledger_balance))}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="admin-btn secondary small"
                    onClick={() => onDraftDistributor(entry.distributor_id, {
                      expected_delivery: entry.schedule_date,
                      suggested_items: entry.suggested_items || [],
                    })}
                  >
                    Draft PO
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No distributor is scheduled on order day today.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <BellRing size={16} />
              <span>Tomorrow PO Prep</span>
            </div>
            {renderSort(tomorrowSort, setTomorrowSort)}
            {tomorrowEntries.length ? (
              tomorrowEntries.slice(0, 6).map((entry) => (
                <div key={`tomorrow-${entry.distributor_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</p>
                    <small>{entry.schedule_day} | {entry.schedule_date}</small>
                    <small>Configured: {entry.configured_payment_due_days ?? '-'}d | Inferred: {entry.inferred_payment_due_days ?? '-'}d</small>
                  </div>
                  <button
                    type="button"
                    className="admin-btn secondary small"
                    onClick={() => onDraftDistributor(entry.distributor_id, {
                      expected_delivery: entry.schedule_date,
                      suggested_items: entry.suggested_items || [],
                    })}
                  >
                    Draft PO
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No distributor reminder due for tomorrow.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Package size={16} />
              <span>Weekly Schedule</span>
            </div>
            {renderSort(weeklySort, setWeeklySort)}
            {weeklyEntries.length ? (
              weeklyEntries.slice(0, 8).map((entry) => (
                <div key={`weekly-${entry.distributor_id}-${entry.schedule_date}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.schedule_day} | {entry.schedule_date}</p>
                    <small>{entry.products_supplied_all?.slice(0, 3).join(', ') || 'No items learned yet'}</small>
                  </div>
                  <button
                    type="button"
                    className="admin-btn secondary small"
                    onClick={() => onDraftDistributor(entry.distributor_id, {
                      expected_delivery: entry.schedule_date,
                      suggested_items: entry.suggested_items || [],
                    })}
                  >
                    Draft
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No weekly schedule is available.</div>
            )}
          </section>

            </div>
          ) : null}

          {activeSector === 'payments' ? (
            <div className="purchase-sector-grid">
          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Wallet size={16} />
              <span>Payables</span>
            </div>
            {(operationsSummary.payables || []).length ? (
              (operationsSummary.payables || []).slice(0, 4).map((entry) => (
                <div key={`payable-${entry.order_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.po_number} | {formatCurrency(toNumber(entry.balance_due))}</p>
                    <small>
                      Due: {entry.payment_due_date}{entry.overdue_days ? ` | ${entry.overdue_days} day overdue` : ''}
                    </small>
                    <small>
                      Strict: {entry.strict_due_date || '-'} | Inferred: {entry.inferred_due_date || '-'}
                    </small>
                  </div>
                  <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                    Pay
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No payable items due right now.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Sparkles size={16} />
              <span>Predicted Payments</span>
            </div>
            {renderSort(predictionSort, setPredictionSort)}
            {predictedEntries.length ? (
              predictedEntries.slice(0, 6).map((entry) => (
                <div key={`prediction-${entry.order_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>{entry.po_number} | {formatCurrency(toNumber(entry.balance_due))}</p>
                    <small>Configured: {entry.payment_due_date} | Inferred: {entry.inferred_due_date || '-'}</small>
                    <small>{entry.prediction_reason === 'overdue' ? 'Overdue' : 'Likely payment today'}</small>
                  </div>
                  <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                    Open
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No payment prediction is available for today.</div>
            )}
          </section>

          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Clock size={16} />
              <span>Next Payments</span>
            </div>
            {(operationsSummary.predicted_payments_next || []).length ? (
              (operationsSummary.predicted_payments_next || []).slice(0, 6).map((entry) => (
                <div key={`next-payment-${entry.distributor_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>Due: {entry.next_payment_due_date} | {formatCurrency(toNumber(entry.predicted_payment_amount))}</p>
                    <small>
                      Source: {entry.next_payment_due_source === 'open_payable' ? 'Open payable' : (entry.next_payment_due_source === 'history_inferred' ? 'History inferred' : 'Unknown')}
                    </small>
                    <small>Outstanding: {formatCurrency(toNumber(entry.outstanding_amount))}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No future payment predictions available.</div>
            )}
          </section>

            </div>
          ) : null}

          {activeSector === 'deliveries' ? (
            <div className="purchase-sector-grid single">
          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Truck size={16} />
              <span>Next Deliveries</span>
            </div>
            {(operationsSummary.predicted_deliveries_next || []).length ? (
              (operationsSummary.predicted_deliveries_next || []).slice(0, 6).map((entry) => (
                <div key={`next-delivery-${entry.distributor_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.distributor_name}</strong>
                    <p>ETA: {entry.next_delivery_date} | Open orders: {toNumber(entry.active_open_orders)}</p>
                    <small>
                      Source: {entry.next_delivery_source === 'open_order' ? 'Open order' : (entry.next_delivery_source === 'history_inferred' ? 'History inferred' : 'Unknown')}
                    </small>
                    <small>Predicted deliveries: {toNumber(entry.predicted_delivery_count)}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No delivery predictions available.</div>
            )}
          </section>

            </div>
          ) : null}

          {activeSector === 'workflow' ? (
            <div className="purchase-sector-grid single">
          <section className="purchase-ops-panel">
            <div className="purchase-ops-panel-title">
              <Clock size={16} />
              <span>Next Actions</span>
            </div>
            {operationsSummary.workflow?.length ? (
              operationsSummary.workflow.slice(0, 5).map((entry) => (
                <div key={`workflow-${entry.order_id}`} className="purchase-ops-item">
                  <div>
                    <strong>{entry.po_number}</strong>
                    <p>{entry.distributor_name}</p>
                    <small>{entry.next_action}</small>
                  </div>
                  <button type="button" className="admin-btn secondary small" onClick={() => onOpenOrder(entry.order_id)}>
                    Open
                  </button>
                </div>
              ))
            ) : (
              <div className="purchase-ops-empty">No urgent workflow items.</div>
            )}
          </section>

            </div>
          ) : null}

          {activeSector === 'insights' ? (
            <div className="purchase-sector-grid single">
          <section className="purchase-ops-panel insights">
            <div className="purchase-ops-panel-title">
              <BarChart3 size={16} />
              <span>Action Rollups</span>
            </div>
            <div className="purchase-ops-rollup-meta">Range: {rollupRangeLabel}</div>
            <div className="purchase-ops-rollup-controls">
              <label>
                Range
                <select value={rollupParams?.mode || '30'} onChange={handleRollupPresetChange}>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Chart
                <select value={rollupChartMode} onChange={(event) => setRollupChartMode(event.target.value)}>
                  <option value="total">Total actions</option>
                  <option value="actions">By action</option>
                </select>
              </label>
              <button type="button" className="admin-btn secondary small" onClick={handleDownloadRollupCsv}>
                Download CSV
              </button>
              {rollupParams?.mode === 'custom' ? (
                <div className="purchase-ops-rollup-custom">
                  <label>
                    Start
                    <input
                      type="date"
                      value={pendingRollupRange.start_date}
                      onChange={(event) => setPendingRollupRange((prev) => ({ ...prev, start_date: event.target.value }))}
                    />
                  </label>
                  <label>
                    End
                    <input
                      type="date"
                      value={pendingRollupRange.end_date}
                      onChange={(event) => setPendingRollupRange((prev) => ({ ...prev, end_date: event.target.value }))}
                    />
                  </label>
                  <button type="button" className="admin-btn secondary small" onClick={handleApplyCustomRange}>
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
            <div className={`purchase-ops-rollup-chart ${rollupChartMode === 'actions' ? 'stacked' : ''}`}>
              {rollupWeekdays.map((entry) => (
                <div key={entry.weekday} className="purchase-ops-rollup-bar">
                  <span>{entry.weekday.slice(0, 3)}</span>
                  <div className="bar-track">
                    {chartSeries.map((series) => {
                      const value = series.getValue(entry);
                      const width = (value / maxChartValue) * 100;
                      return (
                        <div
                          key={`${entry.weekday}-${series.key}`}
                          className={`bar-fill ${series.key}`}
                          style={{ width: `${width}%` }}
                          title={`${series.label}: ${value}`}
                        />
                      );
                    })}
                  </div>
                  <strong>{chartSeries.reduce((sum, series) => sum + series.getValue(entry), 0)}</strong>
                </div>
              ))}
            </div>
            <div className="purchase-ops-rollup-grid">
              <div>
                <h4>Weekday</h4>
                {renderRollupTable(rollupWeekdays, 'weekday', 'Weekday', true)}
              </div>
              <div>
                <h4>Recent Days</h4>
                {renderRollupTable(rollupRecentDays, 'date', 'Date', false)}
              </div>
            </div>
          </section>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default PurchaseDashboardSection;
