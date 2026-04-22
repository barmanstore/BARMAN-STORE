import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Minus,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import EmptyState from '../../shared/components/EmptyState';
import { DateRangeFilter, DropdownFilter, SearchFilter } from '../../shared/components/filters';
import StatCard from '../../shared/components/StatCard';
import TableShell from '../../shared/components/table/TableShell';
import { formatDate } from '../../shared/utils/formatters';
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

const DATE_RANGE_PRESETS = [
  { label: 'Today', value: ['2026-04-18', '2026-04-18'] },
  { label: 'Last 7 Days', value: ['2026-04-12', '2026-04-18'] },
  { label: 'This Month', value: ['2026-04-01', '2026-04-18'] },
];

const TRANSACTION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'SALE', label: 'Sale' },
  { value: 'RETURN', label: 'Return' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

const SAMPLE_LEDGER = [
  {
    id: 1,
    created_at: '2026-04-18T09:15:00Z',
    product_name: 'Organic Rice 5kg',
    sku: 'RICE-5KG',
    transaction_type: 'PURCHASE',
    quantity_change: 40,
    previous_balance: 120,
    new_balance: 160,
    po_number: '4412',
    bill_number: '',
    reference_type: 'purchase_order',
    reference_id: '4412',
    user_name: 'Aman',
    notes: 'Supplier refill',
  },
  {
    id: 2,
    created_at: '2026-04-18T11:45:00Z',
    product_name: 'Sunflower Oil 1L',
    sku: 'OIL-1L',
    transaction_type: 'SALE',
    quantity_change: -12,
    previous_balance: 92,
    new_balance: 80,
    po_number: '',
    bill_number: 'B-1089',
    reference_type: 'bill',
    reference_id: '1089',
    user_name: 'Rita',
    notes: 'Counter sale',
  },
  {
    id: 3,
    created_at: '2026-04-17T14:00:00Z',
    product_name: 'Tea 500g',
    sku: 'TEA-500',
    transaction_type: 'RETURN',
    quantity_change: 5,
    previous_balance: 30,
    new_balance: 35,
    po_number: '',
    bill_number: 'B-1081',
    reference_type: 'bill',
    reference_id: '1081',
    user_name: 'Rita',
    notes: 'Customer return',
  },
  {
    id: 4,
    created_at: '2026-04-16T08:20:00Z',
    product_name: 'Salt 1kg',
    sku: 'SALT-1KG',
    transaction_type: 'ADJUSTMENT',
    quantity_change: -2,
    previous_balance: 54,
    new_balance: 52,
    po_number: '',
    bill_number: '',
    reference_type: 'adjustment',
    reference_id: 'adj-12',
    user_name: 'Warehouse',
    notes: 'Damaged stock removed',
  },
];

const WHOLE_NUMBER_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const normalizeLedgerTransactionType = (type) => {
  const normalized = String(type || '')
    .trim()
    .toUpperCase();
  if (normalized === 'OUT') return 'SALE';
  if (normalized === 'IN') return 'PURCHASE';
  return normalized;
};

const formatWholeNumber = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '-';
  return WHOLE_NUMBER_FORMATTER.format(normalized);
};

const formatLedgerLinkedNumber = (entry) => {
  const billNumber = String(entry?.bill_number || '').trim();
  if (billNumber) return `Bill #${billNumber}`;
  const poNumber = String(entry?.po_number || '').trim();
  return poNumber ? `PO #${poNumber}` : '-';
};

const getTransactionTypeLabel = (type) => {
  const normalized = normalizeLedgerTransactionType(type);
  switch (normalized) {
    case 'PURCHASE':
      return 'Purchase';
    case 'SALE':
      return 'Sale';
    case 'RETURN':
      return 'Return';
    case 'ADJUSTMENT':
      return 'Adjustment';
    default:
      return normalized || 'Transaction type';
  }
};

const getTransactionIcon = (type) => {
  switch (normalizeLedgerTransactionType(type)) {
    case 'PURCHASE':
      return <ArrowDown size={16} className="icon purchase" aria-hidden="true" />;
    case 'SALE':
      return <ArrowUp size={16} className="icon sale" aria-hidden="true" />;
    case 'RETURN':
      return <RefreshCw size={16} className="icon return" aria-hidden="true" />;
    case 'ADJUSTMENT':
      return <Minus size={16} className="icon adjustment" aria-hidden="true" />;
    default:
      return <Minus size={16} className="icon default" aria-hidden="true" />;
  }
};

const compareTokens = (left, right) => String(left || '').localeCompare(String(right || ''));

const toDateToken = (value) => String(value || '').slice(0, 10);

function StockLedgerReferenceShell({
  ledger = SAMPLE_LEDGER,
  initialSearch = '',
  initialScope = 'all',
  initialType = '',
  initialStartDate = '2026-04-01',
  initialEndDate = '2026-04-18',
}) {
  const [searchDraft, setSearchDraft] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchScope, setSearchScope] = useState(initialScope);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);
  const [filters, setFilters] = useState({
    transaction_type: initialType,
    start_date: initialStartDate,
    end_date: initialEndDate,
  });

  const activeSearchScopeCopy = SEARCH_SCOPE_COPY[searchScope] || SEARCH_SCOPE_COPY.all;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const visibleLedger = useMemo(() => {
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

      if (normalizedSearchQuery && !searchableText.includes(normalizedSearchQuery)) {
        return false;
      }

      if (
        filters.transaction_type &&
        normalizeLedgerTransactionType(entry.transaction_type) !== filters.transaction_type
      ) {
        return false;
      }

      const createdDate = toDateToken(entry.created_at);
      if (filters.start_date && createdDate && compareTokens(createdDate, filters.start_date) < 0) {
        return false;
      }
      if (filters.end_date && createdDate && compareTokens(createdDate, filters.end_date) > 0) {
        return false;
      }

      return true;
    });
  }, [
    filters.end_date,
    filters.start_date,
    filters.transaction_type,
    ledger,
    normalizedSearchQuery,
    searchScope,
  ]);

  const ledgerSummary = useMemo(
    () =>
      visibleLedger.reduce(
        (accumulator, entry) => {
          accumulator.total += 1;
          switch (normalizeLedgerTransactionType(entry.transaction_type)) {
            case 'PURCHASE':
              accumulator.purchases += 1;
              break;
            case 'SALE':
              accumulator.sales += 1;
              break;
            case 'RETURN':
              accumulator.returns += 1;
              break;
            default:
              break;
          }
          return accumulator;
        },
        {
          total: 0,
          purchases: 0,
          sales: 0,
          returns: 0,
        }
      ),
    [visibleLedger]
  );

  const activeDatePresetLabel = useMemo(() => {
    if (!filters.start_date && !filters.end_date) return '';
    const currentRange = [
      String(filters.start_date || '').trim(),
      String(filters.end_date || '').trim(),
    ].join('|');
    return (
      DATE_RANGE_PRESETS.find((preset) => {
        const [presetStart, presetEnd] = Array.isArray(preset?.value) ? preset.value : [];
        return (
          [String(presetStart || '').trim(), String(presetEnd || '').trim()].join('|') ===
          currentRange
        );
      })?.label || ''
    );
  }, [filters.end_date, filters.start_date]);

  const activeFilterPills = [
    filters.transaction_type
      ? {
          key: 'transaction_type',
          label: `Transaction Type: ${
            TRANSACTION_TYPES.find((type) => type.value === filters.transaction_type)?.label ||
            filters.transaction_type
          }`,
          onClear: () => setFilters((prev) => ({ ...prev, transaction_type: '' })),
        }
      : null,
    filters.start_date || filters.end_date
      ? {
          key: 'date_range',
          label: activeDatePresetLabel
            ? `Date: ${activeDatePresetLabel}`
            : `Date: ${filters.start_date || 'Start'} - ${filters.end_date || 'End'}`,
          onClear: () => setFilters((prev) => ({ ...prev, start_date: '', end_date: '' })),
        }
      : null,
  ].filter(Boolean);

  const handleDateRangeChange = ([startDate, endDate]) => {
    setFilters((prev) => ({
      ...prev,
      start_date: startDate || '',
      end_date: endDate || '',
    }));
  };

  const hasActiveFilters =
    Boolean(searchQuery) ||
    searchScope !== 'all' ||
    Boolean(filters.transaction_type) ||
    Boolean(filters.start_date) ||
    Boolean(filters.end_date);

  return (
    <div className="stock-ledger-history">
      <BackofficePageHeader
        className="page-header"
        title="Stock Ledger History"
        subtitle="The canonical page shell for search, filter, stat cards, and a sticky review table."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="admin-btn">
              <RefreshCw size={18} /> Refresh
            </button>
            <button
              type="button"
              className="stock-ledger-filter-toggle"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              aria-expanded={showAdvancedFilters}
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
              {activeFilterPills.length ? <strong>{activeFilterPills.length}</strong> : null}
              {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        }
      />

      <div className="filters-bar stock-ledger-filters">
        <SearchFilter
          id="stock-ledger-search"
          placeholder={activeSearchScopeCopy.placeholder}
          value={searchDraft}
          onChange={setSearchDraft}
          onSubmit={setSearchQuery}
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

        {hasActiveFilters ? (
          <button
            type="button"
            className="stock-ledger-filter-clear"
            onClick={() => {
              setSearchDraft('');
              setSearchQuery('');
              setSearchScope('all');
              setFilters({ transaction_type: '', start_date: '', end_date: '' });
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {activeFilterPills.length ? (
        <div className="stock-ledger-active-filters" aria-label="Active filters">
          {activeFilterPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className="stock-ledger-active-filter-pill"
              onClick={pill.onClear}
            >
              <span>{pill.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {showAdvancedFilters ? (
        <div className="stock-ledger-advanced-filters" id="stock-ledger-advanced-filters">
          <div className="stock-ledger-filter-row stock-ledger-filter-row--type">
            <span className="stock-ledger-filter-row-label">Transaction Type</span>
            <DropdownFilter
              options={TRANSACTION_TYPES.filter((type) => type.value).map((type) => ({
                value: type.value,
                label: type.label,
              }))}
              selectedItems={filters.transaction_type ? [filters.transaction_type] : []}
              onChange={(nextItems) =>
                setFilters((prev) => ({
                  ...prev,
                  transaction_type:
                    Array.isArray(nextItems) && nextItems.length ? nextItems[0] : '',
                }))
              }
              width="100%"
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
              presets={DATE_RANGE_PRESETS}
              helperText="Transaction date"
              showIcon={false}
              showPlaceholderText
              alwaysOpen
            />
          </div>
        </div>
      ) : null}

      <div className="summary-stats">
        <StatCard
          icon={<ShoppingBag size={15} aria-hidden="true" />}
          label="Total Transactions"
          value={ledgerSummary.total}
          hint="All ledger rows"
          tone="sky"
        />
        <StatCard
          icon={<ArrowDown size={15} aria-hidden="true" />}
          label="Purchases"
          value={ledgerSummary.purchases}
          hint="Incoming stock"
          tone="emerald"
        />
        <StatCard
          icon={<ArrowUp size={15} aria-hidden="true" />}
          label="Sales"
          value={ledgerSummary.sales}
          hint="Outgoing stock"
          tone="amber"
        />
        <StatCard
          icon={<RefreshCw size={15} aria-hidden="true" />}
          label="Returns"
          value={ledgerSummary.returns}
          hint="Returned items"
          tone="violet"
        />
      </div>

      <TableShell scrollClassName="ledger-table-container">
        {visibleLedger.length === 0 ? (
          <div className="empty-state">
            <EmptyState
              eyebrow="Ledger"
              icon={<ShoppingBag size={24} aria-hidden="true" />}
              title="No stock transactions found"
              description="This is the empty-state version of the same stock-ledger shell."
              actions={
                <button
                  type="button"
                  className="stock-ledger-filter-clear"
                  onClick={() => {
                    setSearchDraft('');
                    setSearchQuery('');
                    setSearchScope('all');
                    setFilters({ transaction_type: '', start_date: '', end_date: '' });
                  }}
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Type</th>
                <th scope="col">Quantity</th>
                <th scope="col">Previous</th>
                <th scope="col">New Balance</th>
              </tr>
            </thead>
            <tbody>
              {visibleLedger.map((entry) => (
                <tr key={entry.id}>
                  <td className="product-cell" data-label="Product">
                    <span className="product-name">{entry.product_name}</span>
                    <span className="product-linked-number">{formatLedgerLinkedNumber(entry)}</span>
                    <span className="product-linked-number">{formatDate(entry.created_at)}</span>
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
                      {entry.quantity_change >= 0 ? '+' : ''}
                      {formatWholeNumber(entry.quantity_change)}
                    </span>
                  </td>
                  <td data-label="Previous">{formatWholeNumber(entry.previous_balance)}</td>
                  <td data-label="New Balance">
                    <strong>{formatWholeNumber(entry.new_balance)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}

export default {
  title: 'Composition/StockLedgerHistory',
  component: StockLedgerReferenceShell,
  parameters: {
    layout: 'fullscreen',
  },
};

export function Default() {
  return <StockLedgerReferenceShell />;
}

export function Filtered() {
  return (
    <StockLedgerReferenceShell
      initialSearch="rice"
      initialScope="product"
      initialType="PURCHASE"
      initialStartDate="2026-04-18"
      initialEndDate="2026-04-18"
    />
  );
}

export function Empty() {
  return (
    <StockLedgerReferenceShell
      ledger={[]}
      initialSearch="missing"
      initialScope="product"
      initialType="SALE"
      initialStartDate="2026-04-18"
      initialEndDate="2026-04-18"
    />
  );
}
