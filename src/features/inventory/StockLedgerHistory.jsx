import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ChevronDown, ChevronUp, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, Minus, SlidersHorizontal, X } from 'lucide-react';
import { stockLedgerApi } from '../../shared/services/api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { toLocalDateKey } from '../../shared/utils/dateTime';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import { DateRangeFilter, DropdownFilter, SearchFilter } from '../../shared/components/filters';
import './StockLedgerHistory.css';

const SEARCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'product', label: 'Product' },
  { value: 'sku', label: 'SKU' },
  { value: 'reference', label: 'Reference' },
  { value: 'user', label: 'User' },
  { value: 'notes', label: 'Notes' },
  { value: 'type', label: 'Type' },
];

const SEARCH_SCOPE_COPY = {
  all: {
    placeholder: 'Search stock ledger',
    ariaLabel: 'Search stock ledger',
  },
  product: {
    placeholder: 'Search product',
    ariaLabel: 'Search product',
  },
  sku: {
    placeholder: 'Search SKU',
    ariaLabel: 'Search SKU',
  },
  reference: {
    placeholder: 'Search reference',
    ariaLabel: 'Search reference',
  },
  user: {
    placeholder: 'Search user',
    ariaLabel: 'Search user',
  },
  notes: {
    placeholder: 'Search notes',
    ariaLabel: 'Search notes',
  },
  type: {
    placeholder: 'Search type',
    ariaLabel: 'Search type',
  },
};

const FILTER_WIDTH = '100%';

const SORTABLE_COLUMNS = {
  dateTime: 'created_at',
  product: 'product_name',
  type: 'transaction_type',
  quantity: 'quantity_change',
  previous: 'previous_balance',
  newBalance: 'new_balance',
  reference: 'reference',
  by: 'user_name',
  notes: 'notes',
};

const DEFAULT_SORT_DIRECTION = {
  [SORTABLE_COLUMNS.dateTime]: 'desc',
  [SORTABLE_COLUMNS.product]: 'asc',
  [SORTABLE_COLUMNS.type]: 'asc',
  [SORTABLE_COLUMNS.quantity]: 'desc',
  [SORTABLE_COLUMNS.previous]: 'desc',
  [SORTABLE_COLUMNS.newBalance]: 'desc',
  [SORTABLE_COLUMNS.reference]: 'asc',
  [SORTABLE_COLUMNS.by]: 'asc',
  [SORTABLE_COLUMNS.notes]: 'asc',
};

const LEDGER_TABLE_COLUMNS = [
  { key: SORTABLE_COLUMNS.product, label: 'Product' },
  { key: SORTABLE_COLUMNS.type, label: 'Type' },
  { key: SORTABLE_COLUMNS.quantity, label: 'Quantity' },
  { key: SORTABLE_COLUMNS.previous, label: 'Previous' },
  { key: SORTABLE_COLUMNS.newBalance, label: 'New Balance' },
];

const LEDGER_TABLE_COLUMN_COUNT = LEDGER_TABLE_COLUMNS.length;

const TRANSACTION_TYPE_LABELS = {
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  RETURN: 'Return',
  PURCHASE_RETURN: 'Purchase Return',
  ADJUSTMENT: 'Adjustment',
  EXCHANGE_IN: 'Exchange In',
  EXCHANGE_OUT: 'Exchange Out',
};

const compareNullable = (left, right, comparator) => {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return comparator(left, right);
};

const toNumericValue = (value) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const toTimestamp = (value) => {
  const normalized = new Date(value).getTime();
  return Number.isFinite(normalized) ? normalized : null;
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

const WHOLE_NUMBER_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const formatLedgerGroupLabel = (value) => formatDate(value, 'en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const formatWholeNumber = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '-';
  return WHOLE_NUMBER_FORMATTER.format(normalized);
};

const normalizeLedgerTransactionType = (type) => {
  const normalized = String(type || '').trim().toUpperCase();
  if (normalized === 'OUT') return 'SALE';
  if (normalized === 'IN') return 'PURCHASE';
  return normalized;
};

const formatLedgerLinkedNumber = (entry) => {
  const billNumber = String(entry?.bill_number || '').trim();
  if (billNumber) {
    return `Bill #${billNumber}`;
  }

  const poNumber = String(entry?.po_number || '').trim();
  return poNumber ? `PO #${poNumber}` : '-';
};

const getTransactionTypeLabel = (type) => {
  const normalized = normalizeLedgerTransactionType(type);
  return TRANSACTION_TYPE_LABELS[normalized] || normalized || 'Transaction type';
};

const compareLedgerEntries = (left, right, sortKey, direction = 'asc') => {
  const directionMultiplier = direction === 'asc' ? 1 : -1;

  switch (sortKey) {
    case SORTABLE_COLUMNS.dateTime:
      return directionMultiplier * compareNullable(
        toTimestamp(left?.created_at),
        toTimestamp(right?.created_at),
        (leftValue, rightValue) => leftValue - rightValue,
      );
    case SORTABLE_COLUMNS.product:
      return directionMultiplier * compareNullable(
        [left?.product_name, left?.sku].filter(Boolean).join(' '),
        [right?.product_name, right?.sku].filter(Boolean).join(' '),
        (leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }),
      );
    case SORTABLE_COLUMNS.type:
      return directionMultiplier * compareNullable(
        getTransactionTypeLabel(left?.transaction_type),
        getTransactionTypeLabel(right?.transaction_type),
        (leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }),
      );
    case SORTABLE_COLUMNS.quantity:
      return directionMultiplier * compareNullable(
        toNumericValue(left?.quantity_change),
        toNumericValue(right?.quantity_change),
        (leftValue, rightValue) => leftValue - rightValue,
      );
    case SORTABLE_COLUMNS.previous:
      return directionMultiplier * compareNullable(
        toNumericValue(left?.previous_balance),
        toNumericValue(right?.previous_balance),
        (leftValue, rightValue) => leftValue - rightValue,
      );
    case SORTABLE_COLUMNS.newBalance:
      return directionMultiplier * compareNullable(
        toNumericValue(left?.new_balance),
        toNumericValue(right?.new_balance),
        (leftValue, rightValue) => leftValue - rightValue,
      );
    case SORTABLE_COLUMNS.reference:
      return directionMultiplier * compareNullable(
        [left?.bill_number, left?.po_number, left?.reference_type, left?.reference_id].filter(Boolean).join(' '),
        [right?.bill_number, right?.po_number, right?.reference_type, right?.reference_id].filter(Boolean).join(' '),
        (leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }),
      );
    case SORTABLE_COLUMNS.by:
      return directionMultiplier * compareNullable(
        left?.user_name || '',
        right?.user_name || '',
        (leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }),
      );
    case SORTABLE_COLUMNS.notes:
      return directionMultiplier * compareNullable(
        left?.notes || '',
        right?.notes || '',
        (leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }),
      );
    default:
      return 0;
  }
};

function StockLedgerHistory({ user }) {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    key: SORTABLE_COLUMNS.dateTime,
    direction: DEFAULT_SORT_DIRECTION[SORTABLE_COLUMNS.dateTime],
  });
  const [filters, setFilters] = useState({
    transaction_type: '',
    start_date: '',
    end_date: ''
  });
  const advancedFiltersRef = useRef(null);
  const filterToggleRef = useRef(null);
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);

  useEffect(() => {
    fetchLedger();
  }, [filters]);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const data = await stockLedgerApi.getAll(filters);
      setLedger(data || []);
    } catch (error) {
      console.error('Error fetching stock ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setSearchDraft('');
    setSearchQuery('');
    setSearchScope('all');
    setFilters({
      transaction_type: '',
      start_date: '',
      end_date: ''
    });
  };

  const handleClearAllFilters = () => {
    resetFilters();
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const activeSearchScopeCopy = SEARCH_SCOPE_COPY[searchScope] || SEARCH_SCOPE_COPY.all;
  const activeDatePresetLabel = useMemo(() => {
    if (!filters.start_date && !filters.end_date) return '';

    const normalizeRange = (startDate, endDate) => [String(startDate || '').trim(), String(endDate || '').trim()].join('|');
    const currentRange = normalizeRange(filters.start_date, filters.end_date);

    return dateRangePresets.find((preset) => {
      const [presetStart, presetEnd] = Array.isArray(preset?.value) ? preset.value : [];
      return normalizeRange(presetStart, presetEnd) === currentRange;
    })?.label || '';
  }, [dateRangePresets, filters.end_date, filters.start_date]);

  const visibleLedger = useMemo(() => {
    if (!normalizedSearchQuery) return ledger;

    return ledger.filter((entry) => {
      const transactionTypeLabel = getTransactionTypeLabel(entry.transaction_type);
      const fieldValues = {
        all: [
          entry.product_name,
          entry.sku,
          entry.po_number,
          entry.bill_number,
          transactionTypeLabel,
          entry.transaction_type,
          entry.reference_type,
          entry.reference_id,
          entry.user_name,
          entry.notes,
        ],
        product: [entry.product_name],
        sku: [entry.sku],
        reference: [entry.po_number, entry.bill_number, entry.reference_type, entry.reference_id],
        user: [entry.user_name],
        notes: [entry.notes],
        type: [entry.transaction_type, transactionTypeLabel],
      };

      const searchableText = (fieldValues[searchScope] || fieldValues.all)
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return searchableText.includes(normalizedSearchQuery);
    });
  }, [ledger, normalizedSearchQuery, searchScope]);

  const groupedLedger = useMemo(() => {
    if (!visibleLedger.length) return [];

    const grouped = visibleLedger.reduce((accumulator, entry) => {
      const dateKey = toLocalDateKey(entry?.created_at || Date.now()) || 'unknown';
      if (!accumulator.has(dateKey)) {
        accumulator.set(dateKey, []);
      }
      accumulator.get(dateKey).push(entry);
      return accumulator;
    }, new Map());

    const dateSortDirection = sortConfig.key === SORTABLE_COLUMNS.dateTime ? sortConfig.direction : 'desc';

    return Array.from(grouped.entries())
      .sort(([leftDate], [rightDate]) => {
        const comparison = compareNullable(
          toTimestamp(leftDate),
          toTimestamp(rightDate),
          (leftValue, rightValue) => leftValue - rightValue,
        );
        return dateSortDirection === 'asc' ? comparison : -comparison;
      })
      .map(([dateKey, entries]) => ({
        key: dateKey,
        label: dateKey === 'unknown' ? 'Unknown date' : formatLedgerGroupLabel(dateKey),
        items: [...entries].sort((left, right) => compareLedgerEntries(left, right, sortConfig.key, sortConfig.direction)),
      }));
  }, [sortConfig.direction, sortConfig.key, visibleLedger]);

  const handleSearchDraftChange = (value) => {
    setSearchDraft(value);
  };

  const handleSearchSubmit = (value) => {
    setSearchQuery(value);
  };

  const handleDateRangeChange = ([startDate, endDate]) => {
    setFilters((prev) => ({
      ...prev,
      start_date: startDate || '',
      end_date: endDate || '',
    }));
  };

  const handleSingleFilterMultiSelectChange = (nextItems, key) => {
    setFilters((prev) => ({
      ...prev,
      [key]: Array.isArray(nextItems) && nextItems.length ? nextItems[0] : '',
    }));
  };

  const handleClearTransactionType = () => {
    setFilters((prev) => ({ ...prev, transaction_type: '' }));
  };

  const handleClearDateRange = () => {
    setFilters((prev) => ({ ...prev, start_date: '', end_date: '' }));
  };

  const activeFilterPills = [
    filters.transaction_type
      ? {
          key: 'transaction_type',
          label: `Transaction Type: ${transactionTypes.find((type) => type.value === filters.transaction_type)?.label || filters.transaction_type}`,
          onClear: handleClearTransactionType,
        }
      : null,
    (filters.start_date || filters.end_date)
      ? {
          key: 'date_range',
          label: activeDatePresetLabel
            ? `Date: ${activeDatePresetLabel}`
            : `Date: ${formatDateDisplayToken(filters.start_date) || 'Start'} - ${formatDateDisplayToken(filters.end_date) || 'End'}`,
          onClear: handleClearDateRange,
        }
      : null,
  ].filter(Boolean);

  const activeFilterCount = [
    searchQuery,
    searchScope !== 'all' ? searchScope : '',
    filters.transaction_type,
    filters.start_date,
    filters.end_date,
  ].filter(Boolean).length;

  const handleSortChange = (columnKey) => {
    setSortConfig((current) => (
      current.key === columnKey
        ? {
            key: columnKey,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          }
        : {
            key: columnKey,
            direction: DEFAULT_SORT_DIRECTION[columnKey] || 'asc',
          }
    ));
  };

  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown size={12} className="ledger-sort-icon" aria-hidden="true" />;
    }

    return sortConfig.direction === 'asc'
      ? <ArrowUp size={12} className="ledger-sort-icon" aria-hidden="true" />
      : <ArrowDown size={12} className="ledger-sort-icon" aria-hidden="true" />;
  };

  const getAriaSort = (columnKey) => {
    if (sortConfig.key !== columnKey) return 'none';
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  const getTransactionIcon = (type) => {
    switch (normalizeLedgerTransactionType(type)) {
      case 'PURCHASE':
        return <ArrowDown size={16} className="icon purchase" aria-hidden="true" />;
      case 'SALE':
        return <ArrowUp size={16} className="icon sale" aria-hidden="true" />;
      case 'RETURN':
        return <RefreshCw size={16} className="icon return" aria-hidden="true" />;
      case 'PURCHASE_RETURN':
        return <ArrowUp size={16} className="icon purchase-return" aria-hidden="true" />;
      case 'ADJUSTMENT':
        return <Minus size={16} className="icon adjustment" aria-hidden="true" />;
      case 'EXCHANGE_IN':
        return <ArrowDown size={16} className="icon exchange-in" aria-hidden="true" />;
      case 'EXCHANGE_OUT':
        return <ArrowUp size={16} className="icon exchange-out" aria-hidden="true" />;
      default:
        return <Minus size={16} className="icon default" aria-hidden="true" />;
    }
  };

  const transactionTypes = [
    { value: '', label: 'All Types' },
    { value: 'PURCHASE', label: 'Purchase' },
    { value: 'SALE', label: 'Sale' },
    { value: 'RETURN', label: 'Return' },
    { value: 'PURCHASE_RETURN', label: 'Purchase Return' },
    { value: 'ADJUSTMENT', label: 'Adjustment' },
    { value: 'EXCHANGE_IN', label: 'Exchange In' },
    { value: 'EXCHANGE_OUT', label: 'Exchange Out' }
  ];

  return (
    <div className="stock-ledger-history">
      <BackofficePageHeader
        className="page-header"
        title="Stock Ledger History"
        actions={(
          <button className="admin-btn" onClick={fetchLedger}>
            <RefreshCw size={18} /> Refresh
          </button>
        )}
      />

      <div className="filters-bar stock-ledger-filters">
        <SearchFilter
          id="stock-ledger-search"
          placeholder={activeSearchScopeCopy.placeholder}
          value={searchDraft}
          onChange={handleSearchDraftChange}
          onSubmit={handleSearchSubmit}
          width="100%"
          stretch
          className="stock-ledger-search-filter"
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
          ref={filterToggleRef}
          type="button"
          className={`stock-ledger-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
          aria-controls="stock-ledger-advanced-filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
          {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {(searchDraft || searchQuery || activeFilterCount) ? (
          <button type="button" className="stock-ledger-filter-clear" onClick={handleClearAllFilters}>
            Clear
          </button>
        ) : null}
      </div>

      {activeFilterPills.length ? (
        <div className="stock-ledger-active-filters" aria-label="Active filters">
          {activeFilterPills.map((pill) => (
            <button key={pill.key} type="button" className="stock-ledger-active-filter-pill" onClick={pill.onClear}>
              <span>{pill.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {showAdvancedFilters ? (
        <div ref={advancedFiltersRef} id="stock-ledger-advanced-filters" className="stock-ledger-advanced-filters">
          <div className="stock-ledger-filter-row stock-ledger-filter-row--type">
            <span className="stock-ledger-filter-row-label">Transaction Type</span>
            <DropdownFilter
              options={transactionTypes.filter((t) => t.value).map((t) => ({ value: t.value, label: t.label }))}
              selectedItems={filters.transaction_type ? [filters.transaction_type] : []}
              onChange={(nextItems) => handleSingleFilterMultiSelectChange(nextItems, 'transaction_type')}
              width={FILTER_WIDTH}
              allLabel="All Types"
              tone="violet"
              multiSelect
              className="stock-ledger-filter-row-control"
            />
          </div>

          <div className="stock-ledger-filter-row stock-ledger-filter-row--date">
            <span className="stock-ledger-filter-row-label">Date Range</span>
            <DateRangeFilter
              value={[filters.start_date, filters.end_date]}
              onChange={handleDateRangeChange}
              width="100%"
              className="stock-ledger-filter-row-control stock-ledger-filter-row-control--date"
              tone="sky"
              presets={dateRangePresets}
              helperText="Transaction date"
              showIcon={false}
              showPlaceholderText={true}
              alwaysOpen={true}
            />
          </div>
        </div>
      ) : null}

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <span className="stat-value">{visibleLedger.length}</span>
          <span className="stat-label">Total Transactions</span>
        </div>
        <div className="stat-card purchase">
          <span className="stat-value">
            {visibleLedger.filter((l) => normalizeLedgerTransactionType(l.transaction_type) === 'PURCHASE').length}
          </span>
          <span className="stat-label">Purchases</span>
        </div>
        <div className="stat-card sale">
          <span className="stat-value">
            {visibleLedger.filter((l) => normalizeLedgerTransactionType(l.transaction_type) === 'SALE').length}
          </span>
          <span className="stat-label">Sales</span>
        </div>
        <div className="stat-card return">
          <span className="stat-value">
            {visibleLedger.filter((l) => normalizeLedgerTransactionType(l.transaction_type) === 'RETURN').length}
          </span>
          <span className="stat-label">Returns</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="ledger-table-container">
        {loading ? (
          <div className="loading">Loading stock ledger...</div>
        ) : visibleLedger.length === 0 ? (
          <div className="empty-state">
            <p>No stock transactions found.</p>
            <p>Transactions will appear here when inventory changes occur.</p>
          </div>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                {LEDGER_TABLE_COLUMNS.map((column) => (
                  <th key={column.key} scope="col" aria-sort={getAriaSort(column.key)}>
                    <button
                      type="button"
                      className={`ledger-sort-btn${sortConfig.key === column.key ? ' is-active' : ''}`}
                      onClick={() => handleSortChange(column.key)}
                      aria-label={`Sort by ${column.label}`}
                      title={`Sort by ${column.label}`}
                    >
                      <span className="ledger-sort-label">{column.label}</span>
                      <span className="ledger-sort-indicator" aria-hidden="true">
                        {renderSortIcon(column.key)}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedLedger.map((group) => (
                <Fragment key={group.key}>
                  <tr className="ledger-date-group-row">
                    <td colSpan={LEDGER_TABLE_COLUMN_COUNT}>
                      <span className="ledger-date-group-chip">{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="product-cell" data-label="Product">
                        <span className="product-name">{entry.product_name}</span>
                        <span className="product-linked-number">{formatLedgerLinkedNumber(entry)}</span>
                      </td>
                      <td
                        className="type-cell"
                        data-label="Type"
                        title={getTransactionTypeLabel(entry.transaction_type)}
                        aria-label={getTransactionTypeLabel(entry.transaction_type)}
                      >
                        {getTransactionIcon(entry.transaction_type)}
                      </td>
                      <td className="qty-cell" data-label="Quantity">
                        <span className={entry.quantity_change >= 0 ? 'positive' : 'negative'}>
                          {entry.quantity_change >= 0 ? '+' : ''}{formatWholeNumber(entry.quantity_change)}
                        </span>
                      </td>
                      <td data-label="Previous">{formatWholeNumber(entry.previous_balance)}</td>
                      <td data-label="New Balance"><strong>{formatWholeNumber(entry.new_balance)}</strong></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default StockLedgerHistory;

