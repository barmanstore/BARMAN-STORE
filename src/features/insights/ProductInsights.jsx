import { Fragment, memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { insightsApi, distributorsApi, categoriesApi } from '../../shared/services/api';
import SignedCurrency from '../../shared/components/SignedCurrency';
import { formatCurrency, formatDate, getSignedCurrencyClassName } from '../../shared/utils/formatters';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import { DateRangeFilter, DropdownFilter, SearchFilter } from '../../shared/components/filters';
import './Insights.css';

const SEARCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'product', label: 'Product' },
  { value: 'category', label: 'Category' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'risk', label: 'Risk' },
];

const SEARCH_SCOPE_COPY = {
  all: {
    placeholder: 'Search product insights',
    ariaLabel: 'Search product insights',
  },
  product: {
    placeholder: 'Search product',
    ariaLabel: 'Search product',
  },
  category: {
    placeholder: 'Search category',
    ariaLabel: 'Search category',
  },
  distributor: {
    placeholder: 'Search distributor',
    ariaLabel: 'Search distributor',
  },
  risk: {
    placeholder: 'Search risk',
    ariaLabel: 'Search risk',
  },
};

const FILTER_WIDTH = '100%';

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

const TABLE_COLUMN_COUNT = 6;

const RISK_FILTER_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'unknown', label: 'Unknown' },
];

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

const formatCompactMagnitude = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  const abs = Math.abs(num);

  if (abs >= 10000000) {
    return `${(num / 10000000).toFixed(abs >= 100000000 ? 1 : 2)}Cr`;
  }

  if (abs >= 100000) {
    return `${(num / 100000).toFixed(abs >= 1000000 ? 1 : 2)}L`;
  }

  if (abs >= 1000) {
    return `${(num / 1000).toFixed(abs >= 10000 ? 1 : 2)}K`;
  }

  return Number.isInteger(num) ? `${num}` : num.toFixed(1);
};

const formatCompactCurrencyValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  const prefix = num < 0 ? '-' : '';
  return `${prefix}₹${formatCompactMagnitude(Math.abs(num))}`;
};

const formatCompactSignedCurrencyValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '₹0';
  const prefix = num > 0 ? '+' : '-';
  return `${prefix}₹${formatCompactMagnitude(Math.abs(num))}`;
};

const formatCompactCountValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return Number.isInteger(num) ? `${num}` : num.toFixed(1);
};

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
    { label: 'This Month', value: [toDateToken(new Date(today.getFullYear(), today.getMonth(), 1)), todayToken] },
  ];
};

const formatDateDisplayToken = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
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

const renderRiskPill = (risk, symbol) => {
  const label = String(risk || 'unknown').trim().toLowerCase() || 'unknown';
  const resolvedSymbol = String(symbol || '').trim() || (label === 'high' ? '▲' : label === 'medium' ? '●' : label === 'low' ? '○' : '?');
  const ariaLabel = `Risk ${label}`;
  return (
    <span className={`risk-pill ${label}`} title={ariaLabel} aria-label={ariaLabel}>
      {resolvedSymbol}
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
      aria-label={title || `Sort by ${label}`}
      title={title || `Sort by ${label}`}
    >
      <span className="sort-header-label">{label}</span>
      <span className="sort-indicator" aria-hidden="true">
        {isActive
          ? (direction === 'asc'
            ? <ArrowUp size={12} aria-hidden="true" />
            : <ArrowDown size={12} aria-hidden="true" />)
          : <ArrowUpDown size={12} aria-hidden="true" />}
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
          <span className="secondary-text">{row.categoryLabel}</span>
        </div>
      </td>
      <td className="numeric-cell cost-summary-cell" title={row.costSummaryTooltip}>
        <div className="metric-stack compact-metric-stack cost-summary-stack">
          <span className="cell-primary compact-cell">{row.latestCostCompactLabel}</span>
          <span className={`cell-secondary compact-cell ${row.marginClass}`}>{row.marginSummaryLabel}</span>
          <span className={`cell-secondary compact-cell ${row.changeClass}`}>{row.changeSummaryLabel}</span>
          <span className="cell-secondary compact-cell">{row.costRangeSummaryLabel}</span>
        </div>
      </td>
      <td
        className="numeric-cell"
        title={row.avgDaysValue !== null ? `Average days between purchases ${row.avgDaysLabel} · ${row.purchaseCountLabel}` : 'Average days between purchases'}
      >
        <span className="cell-primary compact-cell">{row.cadenceCompactLabel}</span>
      </td>
      <td title={`Best distributor ${row.bestDistributorName}${row.bestDistributorCostLabel !== '-' ? ` · Avg cost ${row.bestDistributorCostLabel}` : ''}`}>
        <span className="cell-primary compact-cell distributor-inline">{row.bestDistributorCompactLabel}</span>
      </td>
      <td className="numeric-cell" title={`Cost volatility ${row.volatilityLabel}`}>
        <span className="cell-primary compact-cell volatility-inline">{row.volatilityCompactLabel}</span>
      </td>
      <td>{renderRiskPill(row.riskLabel, row.riskSymbol)}</td>
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
    risk: '',
  });
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);

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
  }, [filters.start_date, filters.end_date, filters.distributor_id, filters.category]);

  const distributorOptions = useMemo(() => (
    distributors
      .map((dist) => {
        const value = String(dist?.id || '').trim();
        const label = String(dist?.name || '').trim();
        return value && label ? { value, label } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }))
  ), [distributors]);

  const categoryOptions = useMemo(() => (
    categories
      .map((cat) => {
        const value = String(cat?.name || cat?.label || '').trim();
        return value ? { value, label: value } : null;
      })
      .filter(Boolean)
      .reduce((accumulator, option) => {
        if (!accumulator.some((item) => item.value === option.value)) {
          accumulator.push(option);
        }
        return accumulator;
      }, [])
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }))
  ), [categories]);

  const activeSearchScopeCopy = SEARCH_SCOPE_COPY[searchScope] || SEARCH_SCOPE_COPY.all;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = String(deferredSearchQuery || '').trim().toLowerCase();

  const tableRows = useMemo(() => insights.map((row) => {
    const riskLabel = String(row.stockout_risk || 'unknown').trim().toLowerCase() || 'unknown';
    const categoryName = String(row.category || '').trim() || 'Uncategorized';
    const subcategoryName = String(row.subcategory || '').trim();
    const categoryLabel = subcategoryName ? `${categoryName} · ${subcategoryName}` : categoryName;
    const latestDistributorName = String(row.latest_distributor_name || '').trim() || '-';
    const bestDistributorName = String(row.best_distributor_name || '').trim() || '-';
    const availableDistributorNames = (Array.isArray(row.available_distributors) ? row.available_distributors : [])
      .map((entry) => String(entry?.name || '').trim())
      .filter(Boolean)
      .join(' ');
    const latestCostLabel = formatCurrencyValue(row.latest_cost);
    const latestCostCompactLabel = formatCompactCurrencyValue(row.latest_cost);
    const marginAmount = row.margin_amount != null ? Number(row.margin_amount) : null;
    const marginPercentValue = row.margin_pct != null ? Number(row.margin_pct) : null;
    const changeAmount = row.cost_change != null ? Number(row.cost_change) : null;
    const changePercentValue = row.cost_change_pct != null ? Number(row.cost_change_pct) : null;
    const minCostLabel = formatCurrencyValue(row.min_cost);
    const avgCostLabel = formatCurrencyValue(row.avg_cost);
    const maxCostLabel = formatCurrencyValue(row.max_cost);
    const minCostCompactLabel = formatCompactCurrencyValue(row.min_cost);
    const avgCostCompactLabel = formatCompactCurrencyValue(row.avg_cost);
    const maxCostCompactLabel = formatCompactCurrencyValue(row.max_cost);
    const avgDaysValue = getComparableNumber(row.avg_days_between);
    const purchaseCountValue = Math.max(0, Number(row.purchase_count || 0));
    const bestDistributorCostLabel = formatCurrencyValue(row.best_distributor_avg_cost);
    const bestDistributorCostCompactLabel = formatCompactCurrencyValue(row.best_distributor_avg_cost);
    const volatilityLabel = formatCurrencyValue(row.price_volatility);
    const volatilityCompactValue = formatCompactCurrencyValue(row.price_volatility);
    const marginPercentLabel = marginPercentValue !== null ? `${marginPercentValue.toFixed(1)}%` : '';
    const changePercentLabel = changePercentValue !== null ? `${changePercentValue.toFixed(1)}%` : '-';
    const marginSummaryLabel = marginAmount !== null
      ? `Margin ${formatCompactSignedCurrencyValue(marginAmount)}${marginPercentLabel ? ` (${marginPercentLabel})` : ''}`
      : 'Margin -';
    const changeSummaryLabel = changeAmount !== null
      ? `Change ${formatCompactSignedCurrencyValue(changeAmount)}${changePercentValue !== null ? ` (${changePercentLabel})` : ''}`
      : 'Change -';

    return {
      productId: Number(row.product_id || 0),
      productName: String(row.product_name || 'Unknown product').trim() || 'Unknown product',
      categoryName,
      subcategoryName,
      categoryLabel,
      latestDistributorId: row.latest_distributor_id ? Number(row.latest_distributor_id) : null,
      latestDistributorName,
      bestDistributorName,
      availableDistributorNames,
      latestCostValue: getComparableNumber(row.latest_cost),
      latestCostLabel,
      latestCostCompactLabel,
      marginAmount,
      marginPercentValue,
      marginPercentLabel,
      marginSummaryLabel,
      marginClass: getSignedCurrencyClassName(row.margin_amount || 0),
      changeAmount,
      changePercentValue,
      changePercentLabel,
      changeSummaryLabel,
      changeClass: getSignedCurrencyClassName(row.cost_change || 0),
      minCostValue: getComparableNumber(row.min_cost),
      avgCostValue: getComparableNumber(row.avg_cost),
      maxCostValue: getComparableNumber(row.max_cost),
      rangeValues: [
        { label: '↓', value: minCostCompactLabel, fullValue: minCostLabel },
        { label: '≈', value: avgCostCompactLabel, fullValue: avgCostLabel },
        { label: '↑', value: maxCostCompactLabel, fullValue: maxCostLabel },
      ],
      avgDaysValue,
      avgDaysLabel: formatDayValue(row.avg_days_between),
      cadenceCompactLabel: avgDaysValue !== null
        ? `⏱${formatCompactDayValue(avgDaysValue)}×${formatCompactCountValue(purchaseCountValue)}`
        : '-',
      purchaseCountValue,
      purchaseCountLabel: formatPurchaseCount(row.purchase_count),
      bestDistributorCostValue: getComparableNumber(row.best_distributor_avg_cost),
      bestDistributorCostLabel,
      bestDistributorCompactLabel: row.bestDistributorName !== '-'
        ? `◉ ${row.bestDistributorName}${bestDistributorCostLabel !== '-' ? ` @${bestDistributorCostCompactLabel}` : ''}`
        : '-',
      volatilityValue: getComparableNumber(row.price_volatility),
      volatilityLabel,
      volatilityCompactLabel: volatilityCompactValue !== '-'
        ? `σ${volatilityCompactValue}`
        : '-',
      riskLabel,
      riskSymbol: riskLabel === 'high' ? '▲' : riskLabel === 'medium' ? '●' : riskLabel === 'low' ? '○' : '?',
      riskRank: Object.prototype.hasOwnProperty.call(RISK_ORDER, riskLabel)
        ? RISK_ORDER[riskLabel]
        : RISK_ORDER.unknown,
    };
  }).map((row) => ({
    ...row,
    rangeCompactLabel: `${row.rangeValues[0].label}${row.rangeValues[0].value} · ${row.rangeValues[1].label}${row.rangeValues[1].value} · ${row.rangeValues[2].label}${row.rangeValues[2].value}`,
    rangeTooltip: `Min ${row.rangeValues[0].fullValue} / Avg ${row.rangeValues[1].fullValue} / Max ${row.rangeValues[2].fullValue}`,
    costSummaryTooltip: `Latest cost ${row.latestCostLabel} · ${row.marginSummaryLabel} · ${row.changeSummaryLabel} · Range ${row.rangeTooltip}`,
    costRangeSummaryLabel: `Range ${row.rangeCompactLabel}`,
  })).map((row) => ({
    ...row,
    decisionTags: buildDecisionTags(row),
  })).map((row) => ({
    ...row,
    searchText: [
      row.productName,
      row.categoryLabel,
      row.latestDistributorName,
      row.bestDistributorName,
      row.availableDistributorNames,
      row.riskLabel,
      ...(row.decisionTags || []).map((tag) => tag.label),
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' '),
  })), [insights]);

  const visibleRows = useMemo(() => {
    return tableRows.filter((row) => {
      if (filters.risk && row.riskLabel !== filters.risk) return false;
      if (!normalizedSearchQuery) return true;

      const scopeText = (() => {
        switch (searchScope) {
          case 'product':
            return row.productName;
          case 'category':
            return [row.categoryName, row.subcategoryName].filter(Boolean).join(' ');
          case 'distributor':
            return [row.latestDistributorName, row.bestDistributorName, row.availableDistributorNames].filter(Boolean).join(' ');
          case 'risk':
            return [row.riskLabel, ...(row.decisionTags || []).map((tag) => tag.label)].join(' ');
          case 'all':
          default:
            return row.searchText;
        }
      })();

      return String(scopeText || '').toLowerCase().includes(normalizedSearchQuery);
    });
  }, [filters.risk, normalizedSearchQuery, searchScope, tableRows]);

  const sortedRows = useMemo(() => {
    const rows = [...visibleRows];
    const { key, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;
    rows.sort((left, right) => multiplier * compareSortValues(left[key], right[key]));
    return rows;
  }, [sortConfig, visibleRows]);

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

  const handleSearchDraftChange = useCallback((value) => {
    setSearchDraft(value);
  }, []);

  const handleSearchSubmit = useCallback((value) => {
    setSearchQuery(value);
  }, []);

  const handleDateRangeChange = useCallback(([startDate, endDate]) => {
    setFilters((prev) => ({
      ...prev,
      start_date: startDate || '',
      end_date: endDate || '',
    }));
  }, []);

  const handleSingleFilterChange = useCallback((nextItems, key) => {
    setFilters((prev) => ({
      ...prev,
      [key]: Array.isArray(nextItems) && nextItems.length ? nextItems[0] : '',
    }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setSearchDraft('');
    setSearchQuery('');
    setSearchScope('all');
    setShowAdvancedFilters(false);
    setFilters({
      start_date: '',
      end_date: '',
      distributor_id: '',
      category: '',
      risk: '',
    });
  }, []);

  const activeDatePresetLabel = useMemo(() => {
    if (!filters.start_date && !filters.end_date) return '';

    const normalizeRange = (startDate, endDate) => [String(startDate || '').trim(), String(endDate || '').trim()].join('|');
    const currentRange = normalizeRange(filters.start_date, filters.end_date);

    return dateRangePresets.find((preset) => {
      const [presetStart, presetEnd] = Array.isArray(preset?.value) ? preset.value : [];
      return normalizeRange(presetStart, presetEnd) === currentRange;
    })?.label || '';
  }, [dateRangePresets, filters.end_date, filters.start_date]);

  const activeFilterPills = [
    filters.distributor_id
      ? {
          key: 'distributor',
          label: `Distributor: ${distributors.find((item) => String(item.id) === String(filters.distributor_id))?.name || filters.distributor_id}`,
          onClear: () => setFilters((prev) => ({ ...prev, distributor_id: '' })),
        }
      : null,
    filters.category
      ? {
          key: 'category',
          label: `Category: ${categoryOptions.find((item) => item.value === filters.category)?.label || filters.category}`,
          onClear: () => setFilters((prev) => ({ ...prev, category: '' })),
        }
      : null,
    filters.risk
      ? {
          key: 'risk',
          label: `Risk: ${filters.risk.charAt(0).toUpperCase() + filters.risk.slice(1)}`,
          onClear: () => setFilters((prev) => ({ ...prev, risk: '' })),
        }
      : null,
    (filters.start_date || filters.end_date)
      ? {
          key: 'date_range',
          label: activeDatePresetLabel
            ? `Date: ${activeDatePresetLabel}`
            : `Date: ${formatDateDisplayToken(filters.start_date) || 'Start'} - ${formatDateDisplayToken(filters.end_date) || 'End'}`,
          onClear: () => setFilters((prev) => ({ ...prev, start_date: '', end_date: '' })),
        }
      : null,
  ].filter(Boolean);

  const activeFilterCount = [
    searchQuery,
    filters.distributor_id,
    filters.category,
    filters.risk,
    filters.start_date,
    filters.end_date,
  ].filter(Boolean).length;

  const summaryStats = useMemo(() => {
    const totalProducts = visibleRows.length;
    const highRiskCount = visibleRows.filter((row) => row.riskLabel === 'high').length;
    const lowMarginCount = visibleRows.filter((row) => row.marginPercentValue !== null && row.marginPercentValue <= 10).length;
    const fastMovingCount = visibleRows.filter((row) => (
      (row.avgDaysValue !== null && row.avgDaysValue <= 3)
      || row.purchaseCountValue >= 5
    )).length;

    return {
      totalProducts,
      highRiskCount,
      lowMarginCount,
      fastMovingCount,
    };
  }, [visibleRows]);

  return (
    <div className="insights-page product-insights">
      <BackofficePageHeader
        className="insights-header"
        title="Product Insights"
        subtitle="Track landed costs, volatility, availability, and supplier performance."
      />

      <div className="filters-bar product-insights-filters">
        <SearchFilter
          id="product-insights-search"
          placeholder={activeSearchScopeCopy.placeholder}
          value={searchDraft}
          onChange={handleSearchDraftChange}
          onSubmit={handleSearchSubmit}
          width="100%"
          stretch
          className="product-insights-search-filter"
          tone="sky"
          ariaLabel={activeSearchScopeCopy.ariaLabel}
          ariaAutocomplete="none"
          scopeOptions={SEARCH_SCOPE_OPTIONS}
          scopeValue={searchScope}
          onScopeChange={setSearchScope}
          scopeAriaLabel="Search scope"
          submitAriaLabel={activeSearchScopeCopy.ariaLabel}
        />

        <button
          type="button"
          className={`product-insights-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
          aria-controls="product-insights-advanced-filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
          {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {(searchDraft || searchQuery || activeFilterCount) ? (
          <button type="button" className="product-insights-filter-clear" onClick={handleClearAllFilters}>
            Clear
          </button>
        ) : null}
      </div>

      {activeFilterPills.length ? (
        <div className="product-insights-active-filters" aria-label="Active filters">
          {activeFilterPills.map((pill) => (
            <button key={pill.key} type="button" className="product-insights-active-filter-pill" onClick={pill.onClear}>
              <span>{pill.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {showAdvancedFilters ? (
        <div id="product-insights-advanced-filters" className="product-insights-advanced-filters">
          <div className="product-insights-filter-row product-insights-filter-row--date">
            <span className="product-insights-filter-row-label">Date Range</span>
            <DateRangeFilter
              value={[filters.start_date, filters.end_date]}
              onChange={handleDateRangeChange}
              width="100%"
              className="product-insights-filter-row-control product-insights-filter-row-control--date"
              tone="sky"
              presets={dateRangePresets}
              helperText="Purchase history"
              showIcon={false}
              showPlaceholderText
              alwaysOpen
            />
          </div>

          <div className="product-insights-filter-row product-insights-filter-row--distributor">
            <span className="product-insights-filter-row-label">Distributor</span>
            <DropdownFilter
              options={distributorOptions}
              selectedItems={filters.distributor_id ? [filters.distributor_id] : []}
              onChange={(nextItems) => handleSingleFilterChange(nextItems, 'distributor_id')}
              width={FILTER_WIDTH}
              allLabel="All Distributors"
              tone="violet"
              multiSelect
              className="product-insights-filter-row-control"
            />
          </div>

          <div className="product-insights-filter-row product-insights-filter-row--category">
            <span className="product-insights-filter-row-label">Category</span>
            <DropdownFilter
              options={categoryOptions}
              selectedItems={filters.category ? [filters.category] : []}
              onChange={(nextItems) => handleSingleFilterChange(nextItems, 'category')}
              width={FILTER_WIDTH}
              allLabel="All Categories"
              tone="sky"
              multiSelect
              className="product-insights-filter-row-control"
            />
          </div>

          <div className="product-insights-filter-row product-insights-filter-row--risk">
            <span className="product-insights-filter-row-label">Risk</span>
            <DropdownFilter
              options={RISK_FILTER_OPTIONS}
              selectedItems={filters.risk ? [filters.risk] : []}
              onChange={(nextItems) => handleSingleFilterChange(nextItems, 'risk')}
              width={FILTER_WIDTH}
              allLabel="All Risk"
              tone="amber"
              multiSelect
              className="product-insights-filter-row-control"
            />
          </div>
        </div>
      ) : null}

      <div className="summary-stats product-insights-summary-stats">
        <div className="stat-card total">
          <span className="stat-value">{summaryStats.totalProducts}</span>
          <span className="stat-label">Visible Products</span>
        </div>
        <div className="stat-card high-risk">
          <span className="stat-value">{summaryStats.highRiskCount}</span>
          <span className="stat-label">High Risk</span>
        </div>
        <div className="stat-card low-margin">
          <span className="stat-value">{summaryStats.lowMarginCount}</span>
          <span className="stat-label">Low Margin</span>
        </div>
        <div className="stat-card fast-moving">
          <span className="stat-value">{summaryStats.fastMovingCount}</span>
          <span className="stat-label">Fast Moving</span>
        </div>
      </div>

      {loading && <div className="empty-state">Loading insights...</div>}
      {!loading && error && <div className="empty-state">{error}</div>}
      {!loading && !error && visibleRows.length === 0 && (
        <div className="empty-state">No product insights found for the selected filters.</div>
      )}

      {!loading && !error && visibleRows.length > 0 && (
        <div className="data-table product-insights-table">
          <table>
            <colgroup>
              <col className="col-product" />
              <col className="col-price-summary" />
              <col className="col-frequency" />
              <col className="col-best-distributor" />
              <col className="col-volatility" />
              <col className="col-risk" />
            </colgroup>
            <thead>
              <tr className="sticky-header-row">
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
                    label="Cost / Margin"
                    sortKey="latestCostValue"
                    activeKey={sortConfig.key}
                    direction={sortConfig.direction}
                    onToggle={handleSort}
                    title="Latest cost with margin, change, and range details"
                    numeric
                  />
                </th>
                <th
                  className="numeric-header"
                  aria-sort={sortConfig.key === 'avgDaysValue' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <SortHeader
                    label="Avg Days"
                    sortKey="avgDaysValue"
                    activeKey={sortConfig.key}
                    direction={sortConfig.direction}
                    onToggle={handleSort}
                    title="Sort by average days between purchases"
                    numeric
                  />
                </th>
                <th
                  aria-sort={sortConfig.key === 'bestDistributorName' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <SortHeader
                    label="Best Distributor"
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
      )}
    </div>
  );
};

export default ProductInsights;
