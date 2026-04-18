import { Fragment, memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { insightsApi } from '../../shared/services/api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import { DateRangeFilter, SearchFilter } from '../../shared/components/filters';
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

const toDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateByDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const buildDateRangePresets = () => {
  const today = new Date();
  const todayToken = toDateToken(today);
  const yesterday = shiftDateByDays(today, -1);
  return [
    { label: 'Today', value: [todayToken, todayToken] },
    { label: 'Yesterday', value: [toDateToken(yesterday), toDateToken(yesterday)] },
    { label: 'Last 7 Days', value: [toDateToken(shiftDateByDays(today, -6)), todayToken] },
    { label: 'Last 30 Days', value: [toDateToken(shiftDateByDays(today, -29)), todayToken] },
    {
      label: 'This Month',
      value: [toDateToken(new Date(today.getFullYear(), today.getMonth(), 1)), todayToken],
    },
  ];
};

const formatDateDisplayToken = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
};

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(1)}%`;
};

const formatCurrencyValue = (value) =>
  value !== null && value !== undefined ? formatCurrency(value) : '-';

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
  const label =
    String(risk || 'unknown')
      .trim()
      .toLowerCase() || 'unknown';
  return (
    <span className={`risk-pill ${label}`} title={`Risk ${label}`} aria-label={`Risk ${label}`}>
      {label === 'high' ? '▲' : label === 'medium' ? '●' : label === 'low' ? '○' : '?'}
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
    !tags.length &&
    row.avgCostValue !== null &&
    row.volatilityValue !== null &&
    row.avgCostValue > 0 &&
    row.volatilityValue / row.avgCostValue <= 0.08
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
      aria-label={title || `Sort by ${label}`}
      title={title || `Sort by ${label}`}
    >
      <span className="sort-header-label">{label}</span>
      <span className="sort-indicator" aria-hidden="true">
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp size={12} aria-hidden="true" />
          ) : (
            <ArrowDown size={12} aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown size={12} aria-hidden="true" />
        )}
      </span>
    </button>
  );
});

const DistributorInsightsRow = memo(function DistributorInsightsRow({ row, isSelected, onView }) {
  const handleView = useCallback(() => {
    onView(row.distributorId);
  }, [onView, row.distributorId]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleView();
      }
    },
    [handleView]
  );

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
        {(row?.distributorName || distributorName) && (
          <span>{row?.distributorName || distributorName}</span>
        )}
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
                  const availabilityLabel =
                    product.is_available === null
                      ? '-'
                      : product.is_available
                        ? 'Available'
                        : 'Unavailable';
                  const minMaxLabel = `Min ${formatCurrencyValue(product.min_cost)} | Max ${formatCurrencyValue(product.max_cost)}`;
                  return (
                    <tr key={product.product_id}>
                      <td>
                        <span className="product-name">{product.product_name || '-'}</span>
                        <span className="secondary-text">
                          {product.category || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="numeric-cell">{formatCurrencyValue(product.avg_cost)}</td>
                      <td className="numeric-cell">{minMaxLabel}</td>
                      <td>
                        {product.last_purchase_at ? formatDate(product.last_purchase_at) : '-'}
                      </td>
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
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDistributorId, setSelectedDistributorId] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    key: 'distributorName',
    direction: DEFAULT_SORT_DIRECTION.distributorName,
  });
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);

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

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const tableRows = useMemo(
    () =>
      insights
        .map((row) => {
          const riskLabel = deriveRiskLabel(row);
          return {
            distributorId: Number(row.distributor_id || 0),
            distributorName:
              String(row.distributor_name || 'Unknown distributor').trim() || 'Unknown distributor',
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
            onTimeRateValue:
              row.on_time_rate !== null && row.on_time_rate !== undefined
                ? Number(row.on_time_rate) * 100
                : null,
            onTimeRateLabel:
              row.on_time_rate !== null && row.on_time_rate !== undefined
                ? formatPercent(Number(row.on_time_rate) * 100)
                : '-',
            volatilityValue: getComparableNumber(row.price_volatility),
            volatilityLabel: formatCurrencyValue(row.price_volatility),
            riskLabel,
            riskRank: Object.prototype.hasOwnProperty.call(RISK_ORDER, riskLabel)
              ? RISK_ORDER[riskLabel]
              : RISK_ORDER.unknown,
          };
        })
        .map((row) => ({
          ...row,
          activitySummaryLabel: `${row.productCountValue} products · ${row.purchaseCountValue} purchases`,
          purchaseSummaryLabel: `${row.purchaseCountValue} buys · ${row.productCountValue} items`,
          rangeSummaryLabel: `Min ${row.minCostLabel} · Max ${row.maxCostLabel}`,
          rangeTooltip: `Min ${row.minCostLabel} / Max ${row.maxCostLabel}`,
          leadTimeSummaryLabel:
            row.avgLeadTimeValue !== null
              ? `${formatCompactDayValue(row.avgLeadTimeValue)} avg`
              : '-',
          onTimeSummaryLabel: row.onTimeRateLabel,
          volatilitySummaryLabel:
            row.volatilityLabel !== '-' ? `${row.volatilityLabel} · swing` : '-',
        }))
        .map((row) => {
          const decisionTags = buildDecisionTags(row);
          return {
            ...row,
            decisionTags,
            searchText: [
              row.distributorName,
              row.activitySummaryLabel,
              row.purchaseSummaryLabel,
              row.rangeSummaryLabel,
              row.leadTimeSummaryLabel,
              row.onTimeSummaryLabel,
              row.volatilitySummaryLabel,
              row.riskLabel,
              ...decisionTags.map((tag) => tag.label),
            ]
              .map((value) => String(value || '').toLowerCase())
              .join(' '),
          };
        }),
    [insights]
  );

  const visibleRows = useMemo(() => {
    const term = String(deferredSearchQuery || '')
      .trim()
      .toLowerCase();
    if (!term) return tableRows;
    return tableRows.filter((row) =>
      String(row.searchText || row.distributorName || '')
        .toLowerCase()
        .includes(term)
    );
  }, [deferredSearchQuery, tableRows]);

  const sortedRows = useMemo(() => {
    const rows = [...visibleRows];
    const { key, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;
    rows.sort((left, right) => multiplier * compareSortValues(left[key], right[key]));
    return rows;
  }, [sortConfig, visibleRows]);

  const selectedRow = useMemo(
    () =>
      sortedRows.find((row) => row.distributorId === Number(selectedDistributorId || 0)) || null,
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

  const handleSearchDraftChange = useCallback((value) => {
    setSearchDraft(value);
  }, []);

  const handleSearchSubmit = useCallback((value) => {
    setSearchQuery(String(value || '').trim());
  }, []);

  const handleDateRangeChange = useCallback((nextValue) => {
    const [startDate, endDate] = Array.isArray(nextValue) ? nextValue : ['', ''];
    setFilters((prev) => ({
      ...prev,
      start_date: String(startDate || '').trim(),
      end_date: String(endDate || '').trim(),
    }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setSearchDraft('');
    setSearchQuery('');
    setFilters({
      start_date: '',
      end_date: '',
    });
    setSelectedDistributorId(null);
    setProducts([]);
    setProductsError('');
  }, []);

  const activeFilterCount = [searchQuery, filters.start_date, filters.end_date].filter(
    Boolean
  ).length;

  const activeFilterPills = useMemo(() => {
    const pills = [];
    const startLabel = formatDateDisplayToken(filters.start_date);
    const endLabel = formatDateDisplayToken(filters.end_date);
    if (startLabel || endLabel) {
      const label =
        startLabel && endLabel
          ? `Date: ${startLabel} - ${endLabel}`
          : `Date: ${startLabel || endLabel}`;
      pills.push({
        key: 'date-range',
        label,
        onClear: () => setFilters((prev) => ({ ...prev, start_date: '', end_date: '' })),
      });
    }
    return pills;
  }, [filters.end_date, filters.start_date]);

  const distributorCountLabel = useMemo(() => {
    if (!visibleRows.length) return 'No matching distributors';
    if (visibleRows.length === insights.length) return `${visibleRows.length} distributors`;
    return `${visibleRows.length} of ${insights.length} distributors`;
  }, [insights.length, visibleRows.length]);

  const summaryStats = useMemo(() => {
    const totalDistributors = visibleRows.length;
    const highRiskCount = visibleRows.filter((row) => row.riskLabel === 'high').length;
    const reliableCount = visibleRows.filter(
      (row) => row.onTimeRateValue !== null && row.onTimeRateValue >= 97
    ).length;
    const wideCatalogCount = visibleRows.filter((row) => row.productCountValue >= 15).length;

    return {
      totalDistributors,
      highRiskCount,
      reliableCount,
      wideCatalogCount,
    };
  }, [visibleRows]);

  return (
    <div className="insights-page distributor-insights product-insights">
      <BackofficePageHeader
        className="insights-header"
        title="Distributor Insights"
        subtitle="Compare landed costs, lead times, reliability, and coverage across suppliers."
      />

      <div className="filters-bar product-insights-filters distributor-insights-filters">
        <SearchFilter
          id="distributor-insights-search"
          placeholder="Search distributor"
          value={searchDraft}
          onChange={handleSearchDraftChange}
          onSubmit={handleSearchSubmit}
          width="100%"
          stretch
          className="product-insights-search-filter distributor-insights-search-filter"
          tone="sky"
          ariaLabel="Search distributors"
          ariaAutocomplete="none"
          submitAriaLabel="Search distributors"
        />

        <button
          type="button"
          className={`product-insights-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
          aria-controls="distributor-insights-advanced-filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
          {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {searchDraft || searchQuery || activeFilterCount ? (
          <button
            type="button"
            className="product-insights-filter-clear distributor-insights-filter-clear"
            onClick={handleClearAllFilters}
          >
            Clear
          </button>
        ) : null}
      </div>

      {activeFilterPills.length ? (
        <div className="product-insights-active-filters" aria-label="Active filters">
          {activeFilterPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className="product-insights-active-filter-pill"
              onClick={pill.onClear}
            >
              <span>{pill.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {showAdvancedFilters ? (
        <div
          id="distributor-insights-advanced-filters"
          className="product-insights-advanced-filters"
        >
          <div className="product-insights-filter-row product-insights-filter-row--date">
            <span className="product-insights-filter-row-label">Date Range</span>
            <DateRangeFilter
              value={[filters.start_date, filters.end_date]}
              onChange={handleDateRangeChange}
              width="100%"
              className="product-insights-filter-row-control product-insights-filter-row-control--date"
              tone="sky"
              presets={dateRangePresets}
              helperText="Purchase date"
              showIcon={false}
              showPlaceholderText
              alwaysOpen
            />
          </div>
        </div>
      ) : null}

      <div className="summary-stats">
        <div className="stat-card">
          <span className="stat-value">{summaryStats.totalDistributors}</span>
          <span className="stat-label">Total Distributors</span>
        </div>
        <div className="stat-card high-risk">
          <span className="stat-value">{summaryStats.highRiskCount}</span>
          <span className="stat-label">High Risk</span>
        </div>
        <div className="stat-card reliable">
          <span className="stat-value">{summaryStats.reliableCount}</span>
          <span className="stat-label">Reliable</span>
        </div>
        <div className="stat-card wide-catalog">
          <span className="stat-value">{summaryStats.wideCatalogCount}</span>
          <span className="stat-label">Wide Catalog</span>
        </div>
      </div>

      {loading && <div className="empty-state">Loading insights...</div>}
      {!loading && error && <div className="empty-state">{error}</div>}
      {!loading && !error && visibleRows.length === 0 && (
        <div className="empty-state">No distributor insights found for the selected filters.</div>
      )}

      {!loading && !error && visibleRows.length > 0 && (
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
                    aria-sort={
                      sortConfig.key === 'distributorName'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
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
                    aria-sort={
                      sortConfig.key === 'purchaseCountValue'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <SortHeader
                      label="Purchases"
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
                    aria-sort={
                      sortConfig.key === 'avgCostValue'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <SortHeader
                      label="Avg Cost"
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
                    aria-sort={
                      sortConfig.key === 'minCostValue'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <SortHeader
                      label="Range"
                      sortKey="minCostValue"
                      activeKey={sortConfig.key}
                      direction={sortConfig.direction}
                      onToggle={handleSort}
                      title="Sort by minimum landed cost"
                      numeric
                    />
                  </th>
                  <th
                    aria-sort={
                      sortConfig.key === 'avgLeadTimeValue'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <SortHeader
                      label="Lead Time"
                      sortKey="avgLeadTimeValue"
                      activeKey={sortConfig.key}
                      direction={sortConfig.direction}
                      onToggle={handleSort}
                      title="Sort by average lead time"
                    />
                  </th>
                  <th
                    className="numeric-header"
                    aria-sort={
                      sortConfig.key === 'onTimeRateValue'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <SortHeader
                      label="On-Time"
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
                    aria-sort={
                      sortConfig.key === 'volatilityValue'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
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
                    aria-sort={
                      sortConfig.key === 'riskRank'
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
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
  );
};

export default DistributorInsights;
