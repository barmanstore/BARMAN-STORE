import { Fragment, memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { insightsApi, distributorsApi, categoriesApi } from '../../shared/services/api';
import SignedCurrency from '../../shared/components/SignedCurrency';
import { formatCurrency, formatDate, getSignedCurrencyClassName } from '../../shared/utils/formatters';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import './Insights.css';

const DEFAULT_SORT_DIRECTION = {
  productName: 'asc',
  latestCostValue: 'desc',
  marginAmount: 'desc',
  changeAmount: 'desc',
  avgCostValue: 'desc',
  avgDaysValue: 'asc',
  bestDistributorName: 'asc',
  volatilityValue: 'desc',
  riskRank: 'desc',
};

const RISK_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  unknown: 3,
};

const TABLE_COLUMN_COUNT = 9;

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(1)}%`;
};

const formatCurrencyValue = (value) => (
  value !== null && value !== undefined ? formatCurrency(value) : '-'
);

const formatSignedCurrencyValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return formatCurrency(0);
  const prefix = num > 0 ? '+' : '-';
  return `${prefix}${formatCurrency(Math.abs(num))}`;
};

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

const formatPurchaseCount = (value) => {
  const count = Math.max(0, Number(value || 0));
  return `${count} buys`;
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

const buildDecisionTags = (row) => {
  const tags = [];

  if (row.riskLabel === 'high') {
    tags.push({ tone: 'danger', label: 'Risk watch' });
  } else if (row.riskLabel === 'medium') {
    tags.push({ tone: 'warning', label: 'Restock soon' });
  }

  if (row.marginPercentValue !== null && row.marginPercentValue <= 10) {
    tags.push({ tone: 'caution', label: 'Low margin' });
  }

  if (
    (row.avgDaysValue !== null && row.avgDaysValue <= 3)
    || row.purchaseCountValue >= 5
  ) {
    tags.push({ tone: 'hot', label: 'Fast moving' });
  }

  if (!tags.length && row.volatilityValue !== null && row.volatilityValue <= 1) {
    tags.push({ tone: 'calm', label: 'Stable cost' });
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

const ProductInsightsRow = memo(function ProductInsightsRow({
  row,
  isSelected,
  onView,
}) {
  const handleView = useCallback(() => {
    onView(row.productId);
  }, [onView, row.productId]);

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
      title={`View insights for ${row.productName}`}
    >
      <td className="sticky-col product-cell">
        <div className="product-cell-button">
          <span className="product-name">{row.productName}</span>
          <span className="secondary-text">{row.categoryName}</span>
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
        <span className="cell-primary compact-cell">{row.latestCostLabel}</span>
      </td>
      <td className={`numeric-cell ${row.marginClass}`}>
        <span className="cell-primary compact-cell">{row.sellingSummaryLabel}</span>
      </td>
      <td className={`numeric-cell ${row.changeClass}`} title="Compared with the previous purchase">
        <span className="cell-primary compact-cell">{row.changeSummaryLabel}</span>
      </td>
      <td className="numeric-cell" title={row.rangeTooltip}>
        <span className="cell-primary compact-cell range-inline">{row.rangeSummaryLabel}</span>
      </td>
      <td>
        <span className="cell-primary compact-cell">{row.frequencySummaryLabel}</span>
      </td>
      <td>
        <span className="cell-primary compact-cell distributor-inline">{row.bestDistributorSummaryLabel}</span>
      </td>
      <td className="numeric-cell">
        <span className="cell-primary compact-cell">{row.volatilitySummaryLabel}</span>
      </td>
      <td>{renderRiskPill(row.riskLabel)}</td>
    </tr>
  );
});

const ProductInsightsDetailPanel = memo(function ProductInsightsDetailPanel({
  productName,
  detail,
  detailLoading,
  detailError,
}) {
  return (
    <div className="detail-panel inline-detail-panel">
      <div className="detail-header">
        <h3>Product Detail</h3>
        {(detail?.product?.name || productName) && <span>{detail?.product?.name || productName}</span>}
      </div>
      {detailLoading && <div className="empty-state">Loading product details...</div>}
      {!detailLoading && detailError && <div className="empty-state">{detailError}</div>}
      {!detailLoading && !detailError && detail && (
        <>
          <div className="detail-grid">
            <div className="detail-metric">
              <span>Latest Cost</span>
              <strong>{detail.latest_cost !== null ? formatCurrency(detail.latest_cost) : '-'}</strong>
            </div>
            <div className="detail-metric">
              <span>Cost Change</span>
              <strong>
                {detail.cost_change !== null ? <SignedCurrency amount={detail.cost_change} /> : '-'}
              </strong>
            </div>
            <div className="detail-metric">
              <span>Avg Days Between</span>
              <strong>{detail.avg_days_between !== null ? `${detail.avg_days_between} days` : '-'}</strong>
            </div>
            <div className="detail-metric">
              <span>Avg Lead Time</span>
              <strong>{detail.avg_lead_time !== null ? `${detail.avg_lead_time} days` : '-'}</strong>
            </div>
            <div className="detail-metric">
              <span>On-Time Rate</span>
              <strong>{detail.on_time_rate !== null ? formatPercent(detail.on_time_rate * 100) : '-'}</strong>
            </div>
            <div className="detail-metric">
              <span>Volatility</span>
              <strong>{detail.price_volatility !== null ? formatCurrency(detail.price_volatility) : '-'}</strong>
            </div>
          </div>

          <div className="data-table product-insights-detail-table inline-detail-table">
            <table>
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th className="numeric-header">Avg Cost</th>
                  <th className="numeric-header">Min</th>
                  <th className="numeric-header">Max</th>
                  <th>Last Purchase</th>
                  <th>Availability</th>
                  <th>Lead Time</th>
                </tr>
              </thead>
              <tbody>
                {(detail.distributors || []).map((row) => (
                  <tr key={row.distributor_id}>
                    <td>{row.distributor_name || '-'}</td>
                    <td className="numeric-cell">{row.avg_cost !== null ? formatCurrency(row.avg_cost) : '-'}</td>
                    <td className="numeric-cell">{row.min_cost !== null ? formatCurrency(row.min_cost) : '-'}</td>
                    <td className="numeric-cell">{row.max_cost !== null ? formatCurrency(row.max_cost) : '-'}</td>
                    <td>{row.last_purchase_at ? formatDate(row.last_purchase_at) : '-'}</td>
                    <td>{row.is_available === null ? '-' : (row.is_available ? 'Available' : 'Unavailable')}</td>
                    <td>{row.lead_time_days !== null && row.lead_time_days !== undefined ? `${row.lead_time_days} days` : '-'}</td>
                  </tr>
                ))}
                {(!detail.distributors || detail.distributors.length === 0) && (
                  <tr>
                    <td colSpan={7}>No distributor history yet.</td>
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

const ProductInsights = () => {
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    distributor_id: '',
    category: '',
  });
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'productName',
    direction: DEFAULT_SORT_DIRECTION.productName,
  });

  useEffect(() => {
    let cancelled = false;
    const loadOptions = async () => {
      try {
        const [distRows, categoryRows] = await Promise.all([
          distributorsApi.getAll(),
          categoriesApi.getAll(),
        ]);
        if (cancelled) return;
        setDistributors(Array.isArray(distRows) ? distRows : []);
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
      } catch (_) {
        if (!cancelled) {
          setDistributors([]);
          setCategories([]);
        }
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInsights = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
        if (filters.distributor_id) params.distributor_id = filters.distributor_id;
        if (filters.category) params.category = filters.category;
        const data = await insightsApi.getProducts(params);
        if (cancelled) return;
        setInsights(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load insights');
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
    return insights.filter((row) => String(row.product_name || '').toLowerCase().includes(term));
  }, [insights, deferredSearch]);

  const tableRows = useMemo(() => filteredInsights.map((row) => {
    const riskLabel = String(row.stockout_risk || 'unknown').trim().toLowerCase() || 'unknown';
    const sellingPriceValue = row.price != null ? row.price : row.mrp;
    return {
      productId: Number(row.product_id || 0),
      productName: String(row.product_name || 'Unknown product').trim() || 'Unknown product',
      categoryName: String(row.category || '').trim() || 'Uncategorized',
      latestCostValue: getComparableNumber(row.latest_cost),
      latestCostLabel: formatCurrencyValue(row.latest_cost),
      sellingPriceValue: getComparableNumber(sellingPriceValue),
      sellingPriceLabel: sellingPriceValue != null ? formatCurrency(sellingPriceValue) : '-',
      marginAmount: row.margin_amount != null ? Number(row.margin_amount) : null,
      marginPercentValue: row.margin_pct != null ? Number(row.margin_pct) : null,
      marginPercentLabel: row.margin_pct != null ? `${Number(row.margin_pct).toFixed(1)}%` : '',
      marginClass: getSignedCurrencyClassName(row.margin_amount || 0),
      changeAmount: row.cost_change != null ? Number(row.cost_change) : null,
      changePercentLabel: row.cost_change_pct != null ? formatPercent(row.cost_change_pct) : '-',
      changeClass: getSignedCurrencyClassName(row.cost_change || 0),
      minCostValue: getComparableNumber(row.min_cost),
      avgCostValue: getComparableNumber(row.avg_cost),
      maxCostValue: getComparableNumber(row.max_cost),
      rangeValues: [
        { label: 'Min', value: formatCurrencyValue(row.min_cost) },
        { label: 'Avg', value: formatCurrencyValue(row.avg_cost) },
        { label: 'Max', value: formatCurrencyValue(row.max_cost) },
      ],
      avgDaysValue: getComparableNumber(row.avg_days_between),
      avgDaysLabel: formatDayValue(row.avg_days_between),
      purchaseCountValue: Math.max(0, Number(row.purchase_count || 0)),
      purchaseCountLabel: formatPurchaseCount(row.purchase_count),
      bestDistributorName: String(row.best_distributor_name || '').trim() || '-',
      bestDistributorCostValue: getComparableNumber(row.best_distributor_avg_cost),
      bestDistributorCostLabel: formatCurrencyValue(row.best_distributor_avg_cost),
      volatilityValue: getComparableNumber(row.price_volatility),
      volatilityLabel: formatCurrencyValue(row.price_volatility),
      riskLabel,
      riskRank: Object.prototype.hasOwnProperty.call(RISK_ORDER, riskLabel)
        ? RISK_ORDER[riskLabel]
        : RISK_ORDER.unknown,
    };
  }).map((row) => ({
    ...row,
    sellingSummaryLabel: row.marginAmount !== null
      ? `${row.sellingPriceLabel} (${formatSignedCurrencyValue(row.marginAmount)} | ${row.marginPercentLabel || '-'})`
      : row.sellingPriceLabel,
    changeSummaryLabel: row.changeAmount !== null
      ? `${formatSignedCurrencyValue(row.changeAmount)} (${row.changePercentLabel})`
      : '-',
    rangeSummaryLabel: `Min ${row.rangeValues[0].value} | Avg ${row.rangeValues[1].value} | Max ${row.rangeValues[2].value}`,
    rangeTooltip: `Min ${row.rangeValues[0].value} / Avg ${row.rangeValues[1].value} / Max ${row.rangeValues[2].value}`,
    frequencySummaryLabel: `${formatCompactDayValue(row.avgDaysValue)} | ${row.purchaseCountLabel}`,
    bestDistributorSummaryLabel: row.bestDistributorName !== '-'
      ? `${row.bestDistributorName} | ${row.bestDistributorCostLabel}`
      : '-',
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

  const loadDetail = useCallback(async (productId) => {
    if (!productId) return;
    setSelectedProductId(productId);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const data = await insightsApi.getProductById(productId);
      setDetail(data);
    } catch (err) {
      setDetailError(err?.message || 'Failed to load product details');
    } finally {
      setDetailLoading(false);
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

  const productCountLabel = useMemo(() => {
    if (!tableRows.length) return 'No matching products';
    if (tableRows.length === insights.length) return `${tableRows.length} products`;
    return `${tableRows.length} of ${insights.length} products`;
  }, [insights.length, tableRows.length]);

  return (
    <div className="insights-page product-insights">
      <BackofficePageHeader
        className="insights-header"
        title="Product Insights"
        subtitle="Track landed costs, volatility, availability, and supplier performance."
      />

      <div className="insights-card">
        <div className="filters-bar">
          <div className="filter-group">
            <label htmlFor="pi-start">From</label>
            <input
              id="pi-start"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="pi-end">To</label>
            <input
              id="pi-end"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="pi-distributor">Distributor</label>
            <select
              id="pi-distributor"
              value={filters.distributor_id}
              onChange={(event) => setFilters((prev) => ({ ...prev, distributor_id: event.target.value }))}
            >
              <option value="">All</option>
              {distributors.map((dist) => (
                <option key={dist.id} value={dist.id}>{dist.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="pi-category">Category</label>
            <select
              id="pi-category"
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            >
              <option value="">All</option>
              {categories.map((cat) => (
                <option key={cat.id || cat.name} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="pi-search">Search</label>
            <input
              id="pi-search"
              type="search"
              placeholder="Product name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {loading && <div className="empty-state">Loading insights...</div>}
        {!loading && error && <div className="empty-state">{error}</div>}
        {!loading && !error && tableRows.length === 0 && (
          <div className="empty-state">No product insights found for the selected filters.</div>
        )}

        {!loading && !error && tableRows.length > 0 && (
          <>
            <div className="insights-table-toolbar">
              <div className="table-toolbar-copy">
                <strong>{productCountLabel}</strong>
              </div>
            </div>

            <div className="data-table product-insights-table">
              <table>
                <colgroup>
                  <col className="col-product" />
                  <col className="col-latest-cost" />
                  <col className="col-selling-margin" />
                  <col className="col-change" />
                  <col className="col-range" />
                  <col className="col-frequency" />
                  <col className="col-best-distributor" />
                  <col className="col-volatility" />
                  <col className="col-risk" />
                </colgroup>
                <thead>
                  <tr className="header-detail-row sticky-header-row">
                    <th
                      className="sticky-col"
                      aria-sort={sortConfig.key === 'productName' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Product"
                        sortKey="productName"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by product name"
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'latestCostValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Latest cost"
                        sortKey="latestCostValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by latest landed cost"
                        numeric
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'marginAmount' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Selling / margin"
                        sortKey="marginAmount"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by margin amount"
                        numeric
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'changeAmount' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Change"
                        sortKey="changeAmount"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by latest landed-cost change against the previous buy"
                        numeric
                      />
                    </th>
                    <th
                      className="numeric-header"
                      aria-sort={sortConfig.key === 'avgCostValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Min / Avg / Max"
                        sortKey="avgCostValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by average landed cost"
                        numeric
                      />
                    </th>
                    <th
                      aria-sort={sortConfig.key === 'avgDaysValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Frequency"
                        sortKey="avgDaysValue"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by average days between purchases"
                      />
                    </th>
                    <th
                      aria-sort={sortConfig.key === 'bestDistributorName' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortHeader
                        label="Best distributor"
                        sortKey="bestDistributorName"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onToggle={handleSort}
                        title="Sort by best distributor name"
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
                        title="Sort by typical cost fluctuation across purchases"
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
                        title="Sort by restock risk inferred from purchase cadence and availability"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const isSelected = Number(selectedProductId || 0) === row.productId;
                    return (
                      <Fragment key={row.productId}>
                        <ProductInsightsRow
                          row={row}
                          isSelected={isSelected}
                          onView={loadDetail}
                        />
                        {isSelected && (
                          <tr className="detail-inline-row">
                            <td colSpan={TABLE_COLUMN_COUNT} className="detail-inline-cell">
                              <ProductInsightsDetailPanel
                                productName={row.productName}
                                detail={detail}
                                detailLoading={detailLoading}
                                detailError={detailError}
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

export default ProductInsights;
