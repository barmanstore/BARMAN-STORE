import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';

const PurchaseInsightsPanel = ({
  operationsSummary,
  rollupParams,
  setRollupParams,
  rollupRangeLabel,
  toNumber,
}) => {
  const [pendingRollupRange, setPendingRollupRange] = useState({
    start_date: '',
    end_date: '',
  });
  const [rollupChartMode, setRollupChartMode] = useState('total');

  const actionRollups = operationsSummary?.action_rollups || {};
  const rollupActions = actionRollups.actions || [];
  const rollupWeekdays = actionRollups.by_weekday || [];
  const rollupDays = actionRollups.by_day || [];
  const rollupTotals = actionRollups.totals || {};
  const rollupRecentDays = rollupDays.slice(-10);

  const chartSeries = useMemo(() => (rollupChartMode === 'total'
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
    }))
  ), [rollupChartMode, rollupActions, toNumber]);

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

  return (
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
  );
};

export default PurchaseInsightsPanel;
