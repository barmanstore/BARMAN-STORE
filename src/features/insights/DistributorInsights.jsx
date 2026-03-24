import { Fragment, memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { insightsApi } from '../../shared/services/api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import './Insights.css';

const DEFAULT_SORT_DIRECTION = {
  distributorName: 'asc',
  purchaseCountValue: 'desc',
  productCountValue: 'desc',
  avgCostValue: 'asc',
  avgLeadTimeValue: 'asc',
  onTimeRateValue: 'desc',
  volatilityValue: 'asc',
  riskRank: 'asc',
};

const RISK_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  unknown: 3,
};

const TABLE_COLUMN_COUNT = 8;

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(1)}%`;
};

const formatCurrencyValue = (value) => (
  value !== null && value !== undefined ? formatCurrency(value) : '-'
);

const formatDayValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${Number.isInteger(num) ? num : num.toFixed(1)} days`;
};

const formatCompactDayValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${Number.isInteger(num) ? num : num.toFixed(1)}d`;
};

const getComparableNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const compareSortValues = (left, right) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === 'string' || typeof right === 'string') {
    return String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const renderRiskPill = (risk) => {
  const label = String(risk || 'unknown').trim().toLowerCase() || 'unknown';
  return (
    <span className={`risk-pill ${label}`}>
      {label}
    </span>
  );
};

const deriveRiskLabel = (row) => {
  const onTimeRate = getComparableNumber(row.on_time_rate);
  const avgLeadTime = getComparableNumber(row.avg_lead_time);

  if (onTimeRate === null && avgLeadTime === null) return 'unknown';
  if ((onTimeRate !== null && onTimeRate < 0.8) || (avgLeadTime !== null && avgLeadTime >= 7)) {
    return 'high';
  }
  if ((onTimeRate !== null && onTimeRate < 0.92) || (avgLeadTime !== null && avgLeadTime >= 4)) {
    return 'medium';
  }
  return 'low';
};

const buildDecisionTags = (row) => {
  const tags = [];

  if (row.riskLabel === 'high') {
    tags.push({ tone: 'danger', label: 'Delay watch' });
  } else if (row.riskLabel === 'medium') {
    tags.push({ tone: 'warning', label: 'Follow up' });
  }

  if (row.onTimeRateValue !== null && row.onTimeRateValue >= 97) {
    tags.push({ tone: 'hot', label: 'Reliable' });
  }

  if (row.productCountValue >= 15) {
    tags.push({ tone: 'calm', label: 'Wide catalog' });
  }

  if (row.purchaseCountValue >= 10) {
    tags.push({ tone: 'caution', label: 'High volume' });
  }

  if (
    !tags.length
    && row.avgCostValue !== null
    && row.volatilityValue !== null
    && row.avgCostValue > 0
    && row.volatilityValue / row.avgCostValue <= 0.08
  ) {
    tags.push({ tone: 'calm', label: 'Stable pricing' });
  }

  return tags.slice(0, 2);
};

const SortHeader = memo(function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle,
  title,
  numeric = false,
}) {
  const isActive = activeKey === sortKey;

  return (
    <button
      type="button"
      className={`sort-header-btn${numeric ? ' numeric' : ''}${isActive ? ' is-active' : ''}`}
      onClick={() => onToggle(sortKey)}
      title={title || `Sort by ${label}`}
    >
      <span className="sort-header-label">{label}</span>
      <span className="sort-indicator" aria-hidden="true">
        {isActive ? (direction === 'asc' ? '^' : 'v') : '-'}
      </span>
    </button>
  );
});

const DistributorInsightsRow = memo(function DistributorInsightsRow({
  row,
  isSelected,
  onView,
}) {
  const handleView = useCallback(() => {
    onView(row.distributorId);
  }, [onView, row.distributorId]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleView();
    }
  }, [handleView]);

  return (
    <tr
      className={`insights-row clickable-row${isSelected ? ' is-selected' : ''}`}
      onClick={handleView}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title={`View insights for ${row.distributorName}`}
    >
      <td className="sticky-col product-cell">
        <div className="product-cell-button">
          <span className="product-name">{row.distributorName}</span>
          <span className="secondary-text">{row.activitySummaryLabel}</span>
          {row.decisionTags.length > 0 && (
            <span className="decision-tags">
              {row.decisionTags.map((tag) => (
                <span key={tag.label} className={`decision-tag ${tag.tone}`}>
                  {tag.label}
                </span>
              ))}
            </span>
          )}
        </div>
      </td>
      <td className="numeric-cell">
        <span className="cell-primary compact-cell">{row.purchaseSummaryLabel}</span>
      </td>
      <td className="numeric-cell">
        <span className="cell-primary compact-cell">{row.avgCostLabel}</span>
      </td>
      <td className="numeric-cell" title={row.rangeTooltip}>
        <span className="cell-primary compact-cell range-inline">{row.rangeSummaryLabel}</span>
      </td>
      <td>
        <span className="cell-primary compact-cell">{row.leadTimeSummaryLabel}</span>
      </td>
      <td className="numeric-cell">
        <span className="cell-primary compact-cell">{row.onTimeSummaryLabel}</span>
      </td>
      <td className="numeric-cell">
        <span className="cell-primary compact-cell">{row.volatilitySummaryLabel}</span>
      </td>
      <td>{renderRiskPill(row.riskLabel)}</td>
    </tr>
  );
});

const DistributorInsightsDetailPanel = memo(function DistributorInsightsDetailPanel({
  distributorName,
  row,
  products,
  productsLoading,
  productsError,
}) {
  const availabilityCoverage = useMemo(() => {
    if (!products.length) return null;
    const available = products.filter((product) => product.is_available !== false).length;
    return {
      total: products.length,
      available,
      pct: (available / products.length) * 100,
    };
  }, [products]);

  return (
    <div className="detail-panel inline-detail-panel">
      <div className="detail-header">
        <h3>Distributor Detail</h3>
        {(row?.distributorName || distributorName) && <span>{row?.distributorName || distributorName}</span>}
      </div>
      {productsLoading && <div className="empty-state">Loading distributor products...</div>}
      {!productsLoading && productsError && <div className="empty-state">{productsError}</div>}
      {!productsLoading && !productsError && row && (
        <>
          <div className="detail-grid">
            <div className="detail-metric">
              <span>Purchase Count</span>
              <strong>{row.purchaseCountValue}</strong>
            </div>
            <div className="detail-metric">
              <span>Products Covered</span>
              <strong>{row.productCountValue}</strong>
            </div>
            <div className="detail-metric">
              <span>Avg Landed Cost</span>
              <strong>{row.avgCostLabel}</strong>
            </div>
            <div className="detail-metric">
              <span>Lead Time</span>
              <strong>{row.avgLeadTimeLabel}</strong>
            </div>
            <div className="detail-metric">
              <span>On-Time Rate</span>
              <strong>{row.onTimeRateLabel}</strong>
            </div>
            <div className="detail-metric">
              <span>Availability Coverage</span>
              <strong>
                {availabilityCoverage
                  ? `${availabilityCoverage.available}/${availabilityCoverage.total} (${formatPercent(availabilityCoverage.pct)})`
                  : '-'}
              </strong>
            </div>
          </div>

          <div className="data-table product-insights-detail-table inline-detail-table">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="numeric-header">Avg Cost</th>
                  <th className="numeric-header">Min / Max</th>
                  <th>Last Purchase</th>
                  <th>Availability</th>
                  <th>Lead Time</th>
                  <th className="numeric-header">MOQ</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const availabilityLabel = product.is_available === null
                    ? '-'
                    : (product.is_available ? 'Available' : 'Unavailable');
                  const minMaxLabel = `Min ${formatCurrencyValue(product.min_cost)} | Max ${formatCurrencyValue(product.max_cost)}`;
                  return (
                    <tr key={product.product_id}>
                      <td>
                        <span className="product-name">{product.product_name || '-'}</span>
                        <span className="secondary-text">{product.category || 'Uncategorized'}</span>
                      </td>
                      <td className="numeric-cell">{formatCurrencyValue(product.avg_cost)}</td>
                      <td className="numeric-cell">{minMaxLabel}</td>
                      <td>{product.last_purchase_at ? formatDate(product.last_purchase_at) : '-'}</td>
                      <td>{availabilityLabel}</td>
                      <td>{formatDayValue(product.lead_time_days)}</td>
                      <td className="numeric-cell">
                        {product.min_order_qty !== null && product.min_order_qty !== undefined
                          ? product.min_order_qty
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={7}>No products found for this distributor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
});

const DistributorInsights = () => {
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
  });
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDistributorId, setSelectedDistributorId] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'distributorName',
    direction: DEFAULT_SORT_DIRECTION.distributorName,
  });

  useEffect(() => {
    let cancelled = false;
    const loadInsights = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
        const data = await insightsApi.getDistributors(params);
        if (cancelled) return;
        setInsights(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load distributor insights');
          setInsights([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const deferredSearch = useDeferredValue(search);

  const filteredInsights = useMemo(() => {
    const term = String(deferredSearch || '').trim().toLowerCase();
    if (!term) return insights;
    return insights.filter((row) => String(row.distributor_name || '').toLowerCase().includes(term));
  }, [insights, deferredSearch]);

  const tableRows = useMemo(() => filteredInsights.map((row) => {
    const riskLabel = deriveRiskLabel(row);
    return {
      distributorId: Number(row.distributor_id || 0),
      distributorName: String(row.distributor_name || 'Unknown distributor').trim() || 'Unknown distributor',
      purchaseCountValue: Math.max(0, Number(row.purchase_count || 0)),
      productCountValue: Math.max(0, Number(row.product_count || 0)),
      avgCostValue: getComparableNumber(row.avg_cost),
      avgCostLabel: formatCurrencyValue(row.avg_cost),
      minCostValue: getComparableNumber(row.min_cost),
      minCostLabel: formatCurrencyValue(row.min_cost),
      maxCostValue: getComparableNumber(row.max_cost),
      maxCostLabel: formatCurrencyValue(row.max_cost),
      avgLeadTimeValue: getComparableNumber(row.avg_lead_time),
      avgLeadTimeLabel: formatDayValue(row.avg_lead_time),
      onTimeRateValue: row.on_time_rate !== null && row.on_time_rate !== undefined
        ? Number(row.on_time_rate) * 100
        : null,
      onTimeRateLabel: row.on_time_rate !== null && row.on_time_rate !== undefined
        ? formatPercent(Number(row.on_time_rate) * 100)
        : '-',
      volatilityValue: getComparableNumber(row.price_volatility),
      volatilityLabel: formatCurrencyValue(row.price_volatility),
      riskLabel,
      riskRank: Object.prototype.hasOwnProperty.call(RISK_ORDER, riskLabel)
        ? RISK_ORDER[riskLabel]
        : RISK_ORDER.unknown,
    };
  }).map((row) => ({
    ...row,
    activitySummaryLabel: `${row.productCountValue} products | ${row.purchaseCountValue} purchases`,
    purchaseSummaryLabel: `${row.purchaseCountValue} buys | ${row.productCountValue} items`,
    rangeSummaryLabel: `Min ${row.minCostLabel} | Max ${row.maxCostLabel}`,
    rangeTooltip: `Min ${row.minCostLabel} / Max ${row.maxCostLabel}`,
    leadTimeSummaryLabel: row.avgLeadTimeValue !== null
      ? `${formatCompactDayValue(row.avgLeadTimeValue)} avg`
      : '-',
    onTimeSummaryLabel: row.onTimeRateLabel,
    volatilitySummaryLabel: row.volatilityLabel !== '-'
      ? `${row.volatilityLabel} swing`
      : '-',
  })).map((row) => ({
    ...row,
    decisionTags: buildDecisionTags(row),
  })), [filteredInsights]);

  const sortedRows = useMemo(() => {
    const rows = [...tableRows];
    const { key, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;
    rows.sort((left, right) => multiplier * compareSortValues(left[key], right[key]));
    return rows;
  }, [sortConfig, tableRows]);

  const selectedRow = useMemo(
    () => sortedRows.find((row) => row.distributorId === Number(selectedDistributorId || 0)) || null,
    [selectedDistributorId, sortedRows]
  );

  const loadProducts = useCallback(async (distributorId) => {
    if (!distributorId) return;
    setSelectedDistributorId(distributorId);
    setProducts([]);
    setProductsError('');
    setProductsLoading(true);
    try {
      const data = await insightsApi.getDistributorProducts(distributorId);
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setProductsError(err?.message || 'Failed to load distributor products');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const handleSort = useCallback((sortKey) => {
    setSortConfig((prev) => {
      if (prev.key === sortKey) {
        return {
          key: sortKey,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key: sortKey,
        direction: DEFAULT_SORT_DIRECTION[sortKey] || 'asc',
      };
    });
  }, []);

  const distributorCountLabel = useMemo(() => {
    if (!tableRows.length) return 'No matching distributors';
    if (tableRows.length === insights.length) return `${tableRows.length} distributors`;
    return `${tableRows.length} of ${insights.length} distributors`;
  }, [insights.length, tableRows.length]);

  return (
    <div className="insights-page distributor-insights product-insights">
      <BackofficePageHeader
        className="insights-header"
        title="Distributor Insights"
        subtitle="Compare landed costs, lead times, reliability, and coverage across suppliers."
      />

      <div className="insights-card">
        <div className="filters-bar">
          <div className="filter-group">
            <label htmlFor="di-start">From</label>
            <input
              id="di-start"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="di-end">To</label>
            <input
              id="di-end"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="di-search">Search</label>
            <input
              id="di-search"
              type="search"
              placeholder="Distributor name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {loading && <div className="empty-state">Loading insights...</div>}
        {!loading && error && <div className="empty-state">{error}</div>}
        {!loading && !error && tableRows.length === 0 && (
          <div className="empty-state">No distributor insights found for the selected filters.</div>
        )}

        {!loading && !error && tableRows.length > 0 && (
          <>
            <div className="insights-table-toolbar">
              <div className="table-toolbar-copy">
                <strong>{distributorCountLabel}</strong>
              </div>
            </div>

            <div className="data-table product-insights-table distributor-insights-table">
              <table>
                <colgroup>
                  <col className="col-distributor" />
                  <col className="col-purchase" />
                  <col className="col-avg-cost" />
                  <col className="col-range" />
                  <col className="col-lead-time" />
                  <col className="col-on-time" />
                  <col className="col-volatility" />
                  <col className="col-risk" />
                </colgroup>
                <thead>
                  <tr className="header-detail-row sticky-header-row">
                    <th
                      className="sticky-col"
                      aria-sort={sortConfig.key === 'distributorName' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Distributor"
                        sortKey="distributorName"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by distributor name"
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'purchaseCountValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Purchases / items"
                        sortKey="purchaseCountValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by purchase count"
                        numeric
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'avgCostValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Avg cost"
                        sortKey="avgCostValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by average landed cost"
                        numeric
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'minCostValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Min / Max"
                        sortKey="minCostValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by minimum landed cost"
                        numeric
                      />
                    </th>
                    <th
                      aria-sort={sortConfig.key === 'avgLeadTimeValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Lead time"
                        sortKey="avgLeadTimeValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by average lead time"
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'onTimeRateValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="On-time"
                        sortKey="onTimeRateValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by on-time delivery rate"
                        numeric
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'volatilityValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Volatility"
                        sortKey="volatilityValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by landed-cost fluctuation"
                        numeric
                      />
                    </th>
                    <th
                      aria-sort={sortConfig.key === 'riskRank' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Risk"
                        sortKey="riskRank"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by supplier delivery risk"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const isSelected = Number(selectedDistributorId || 0) === row.distributorId;
                    return (
                      <Fragment key={row.distributorId}>
                        <DistributorInsightsRow
                          row={row}
                          isSelected={isSelected}
                          onView={loadProducts}
                        />
                        {isSelected && (
                          <tr className="detail-inline-row">
                            <td colSpan={TABLE_COLUMN_COUNT} className="detail-inline-cell">
                              <DistributorInsightsDetailPanel
                                distributorName={row.distributorName}
                                row={selectedRow}
                                products={products}
                                productsLoading={productsLoading}
                                productsError={productsError}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DistributorInsights;
