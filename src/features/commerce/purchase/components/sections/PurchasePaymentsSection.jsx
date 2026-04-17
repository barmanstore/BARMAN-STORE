import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import BackofficePageHeader from '../../../../../shared/components/backoffice/BackofficePageHeader';
import {
  DateRangeFilter,
  DropdownFilter,
  SearchFilter,
} from '../../../../../shared/components/filters';
import '../../../../inventory/StockLedgerHistory.css';
import { canAddPaymentToPo } from '../../utils/orders';

const PAYABLE_CARD_LIMIT = 12;
const RECENT_LEDGER_DAY_WINDOW = 14;
const QUICK_VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'due', label: 'Due' },
  { value: 'recent', label: 'Recent' },
];
const SEARCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'po_number', label: 'PO #' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'notes', label: 'Notes' },
];
const DEFAULT_NOW_TIMESTAMP = Date.now();
const SEARCH_SCOPE_COPY = {
  all: {
    placeholder: 'Search payments',
    ariaLabel: 'Search payments',
    submitAriaLabel: 'Search payments and ledger',
  },
  supplier: {
    placeholder: 'Search supplier',
    ariaLabel: 'Search supplier',
    submitAriaLabel: 'Search supplier payments',
  },
  po_number: {
    placeholder: 'Search PO #',
    ariaLabel: 'Search PO #',
    submitAriaLabel: 'Search payments by PO number',
  },
  ledger: {
    placeholder: 'Search ledger',
    ariaLabel: 'Search ledger',
    submitAriaLabel: 'Search ledger entries',
  },
  notes: {
    placeholder: 'Search notes',
    ariaLabel: 'Search notes',
    submitAriaLabel: 'Search ledger notes',
  },
};

const formatLedgerDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const normalizeNameKey = (value) => String(value || '').trim().toLowerCase();

const formatSupplierWithDistributor = (supplierName = '', distributorName = '') => {
  const supplier = String(supplierName || '').trim();
  const distributor = String(distributorName || '').trim();
  if (supplier && distributor && normalizeNameKey(supplier) !== normalizeNameKey(distributor)) {
    return `${supplier} - ${distributor}`;
  }
  return supplier || distributor || '-';
};

const buildSupplierOptionLabel = (supplierNames = [], fallbackName = '') => {
  const uniqueNames = [];
  supplierNames.forEach((name) => {
    const text = String(name || '').trim();
    if (!text) return;
    if (uniqueNames.some((entry) => normalizeNameKey(entry) === normalizeNameKey(text))) return;
    uniqueNames.push(text);
  });

  if (uniqueNames.length === 0) return String(fallbackName || '-').trim() || '-';
  const supplierLabel = uniqueNames.length === 1
    ? uniqueNames[0]
    : uniqueNames.length === 2
      ? `${uniqueNames[0]} / ${uniqueNames[1]}`
      : `${uniqueNames[0]} +${uniqueNames.length - 1}`;
  return formatSupplierWithDistributor(supplierLabel, fallbackName);
};

const getLedgerModeMeta = (entry) => {
  const rawMode = String(entry?.payment_mode || entry?.method || '').trim();
  const mode = rawMode.toLowerCase();

  if (mode.includes('upi') || mode.includes('gpay') || mode.includes('phonepe') || mode.includes('paytm')) {
    return { Icon: Smartphone, label: rawMode || 'UPI', className: 'is-upi' };
  }

  if (
    mode.includes('bank')
    || mode.includes('transfer')
    || mode.includes('neft')
    || mode.includes('rtgs')
    || mode.includes('imps')
    || mode.includes('cheque')
  ) {
    return { Icon: Landmark, label: rawMode || 'Bank', className: 'is-bank' };
  }

  if (mode.includes('cash')) {
    return { Icon: Wallet, label: rawMode || 'Cash', className: 'is-cash' };
  }

  return { Icon: ArrowUpDown, label: rawMode || 'Entry', className: 'is-generic' };
};

const getLedgerSignedAmount = (entry, toNumber) => {
  const amount = Math.abs(toNumber(entry?.amount));
  const typeKey = String(entry?.type || entry?.transaction_type || '').trim().toLowerCase();
  return typeKey === 'payment' ? -amount : amount;
};

const getPurchaseLedgerTypeLabel = (entry, getLedgerTypeLabel) => {
  const sourceKey = String(entry?.source || '').trim().toLowerCase();
  if (sourceKey === 'purchase_order') return 'PO Credit';
  if (sourceKey === 'po_payment') return 'PO Payment';
  if (sourceKey === 'po_correction') return 'PO Correction';
  return getLedgerTypeLabel(entry);
};

const normalizeDateKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplayToken = (value) => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
};

const shiftDateByDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const buildDateRangePresets = () => {
  const today = new Date();
  const todayToken = toDateToken(today);
  return [
    { label: 'Today', value: [todayToken, todayToken] },
    { label: 'Last 7 Days', value: [toDateToken(shiftDateByDays(today, -6)), todayToken] },
    { label: 'This Month', value: [toDateToken(new Date(today.getFullYear(), today.getMonth(), 1)), todayToken] },
  ];
};

const getPayableActionMeta = (entry) => {
  const paymentEligible = canAddPaymentToPo(entry);
  return paymentEligible
    ? {
        label: 'Pay',
        title: 'Record payment',
        ariaLabel: 'Record payment for',
        Icon: Wallet,
        isConfirmAction: false,
      }
    : {
        label: 'Confirm',
        title: 'Confirm purchase order',
        ariaLabel: 'Confirm purchase order for',
        Icon: Check,
        isConfirmAction: true,
      };
};

const PurchasePaymentsSection = ({
  filters = {},
  distributors = [],
  suppliers = [],
  onFilterChange = () => {},
  onOpenLedgerForm = () => {},
  onRefreshLedger = () => {},
  onOpenProcessModal = null,
  ledgerBalanceSummary = { label: 'Ledger balance', value: 0 },
  payables = [],
  onOpenPayable = () => {},
  ledgerLoading = false,
  ledgerRecords = [],
  getLedgerRowStatusClass = () => '',
  getDistributorName = () => '-',
  getLedgerTypeLabel = (entry) => String(entry?.transaction_type || entry?.type || ''),
  formatCurrency = (amount) => String(amount ?? 0),
  toNumber = (value) => Number(value) || 0,
  getLedgerBillNumber = (entry) => entry?.bill_number || entry?.po_number || '-',
}) => {
  const [quickView, setQuickView] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const advancedFiltersRef = useRef(null);
  const filterToggleRef = useRef(null);
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);
  const distributorOptions = useMemo(() => (Array.isArray(distributors) ? distributors : []), [distributors]);
  const supplierRecords = useMemo(() => (Array.isArray(suppliers) ? suppliers : []), [suppliers]);
  const supplierById = useMemo(
    () => new Map(supplierRecords.map((entry) => [String(entry?.id || ''), entry])),
    [supplierRecords]
  );
  const distributorById = useMemo(
    () => new Map(distributorOptions.map((entry) => [String(entry?.id || ''), entry])),
    [distributorOptions]
  );
  const supplierNamesByDistributor = useMemo(() => {
    const next = new Map();
    supplierRecords.forEach((entry) => {
      if (entry?.is_active === false || Number(entry?.is_active || 1) === 0) return;
      const distributorId = String(entry?.distributor_id || '').trim();
      if (!distributorId) return;
      const current = next.get(distributorId) || [];
      current.push(entry?.name || '');
      next.set(distributorId, current);
    });
    return next;
  }, [supplierRecords]);
  const supplierFilterOptions = useMemo(() => (
    distributorOptions.map((entry) => {
      const distributorId = String(entry?.id || '').trim();
      return {
        value: distributorId,
        label: buildSupplierOptionLabel(
          supplierNamesByDistributor.get(distributorId) || [],
          entry?.name || ''
        ),
      };
    })
  ), [distributorOptions, supplierNamesByDistributor]);
  const supplierFilterLabelByDistributor = useMemo(
    () => new Map(supplierFilterOptions.map((entry) => [String(entry.value), entry.label])),
    [supplierFilterOptions]
  );
  const ledgerEntries = useMemo(() => (Array.isArray(ledgerRecords) ? ledgerRecords : []), [ledgerRecords]);
  const payableEntries = useMemo(() => (Array.isArray(payables) ? payables : []), [payables]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const activeSearchScopeCopy = SEARCH_SCOPE_COPY[searchScope] || SEARCH_SCOPE_COPY.all;
  const totalPayable = useMemo(
    () => payableEntries.reduce((sum, entry) => sum + toNumber(entry?.balance_due), 0),
    [payableEntries, toNumber]
  );
  const overdueCount = useMemo(
    () => payableEntries.filter((entry) => toNumber(entry?.overdue_days) > 0).length,
    [payableEntries, toNumber]
  );
  const activeDatePresetLabel = useMemo(() => {
    const currentRange = [normalizeDateKey(filters.start_date), normalizeDateKey(filters.end_date)].join('|');
    if (!currentRange.replace(/\|/g, '')) return '';
    return dateRangePresets.find((preset) => {
      const presetRange = [normalizeDateKey(preset?.value?.[0]), normalizeDateKey(preset?.value?.[1])].join('|');
      return presetRange === currentRange;
    })?.label || '';
  }, [dateRangePresets, filters.end_date, filters.start_date]);
  const selectedSupplierFilterLabel = supplierFilterLabelByDistributor.get(String(filters.distributor_id || '').trim()) || '';
  const getSupplierDisplayName = useMemo(() => (
    (entry) => {
      const directSupplierName = String(entry?.supplier_name || '').trim();
      const directDistributorName = String(entry?.distributor_name || '').trim();
      if (directSupplierName) return formatSupplierWithDistributor(directSupplierName, directDistributorName);

      const supplierId = String(entry?.supplier_id || '').trim();
      if (supplierId) {
        const supplier = supplierById.get(supplierId);
        const resolvedName = String(supplier?.name || '').trim();
        const distributorName = String(
          distributorById.get(String(supplier?.distributor_id || ''))?.name
          || supplier?.distributor_name
          || directDistributorName
          || ''
        ).trim();
        if (resolvedName) return formatSupplierWithDistributor(resolvedName, distributorName);
      }

      const distributorId = String(entry?.distributor_id || '').trim();
      if (distributorId) {
        const groupedLabel = supplierFilterLabelByDistributor.get(distributorId);
        if (groupedLabel) return groupedLabel;
      }

      return directDistributorName || '-';
    }
  ), [distributorById, supplierById, supplierFilterLabelByDistributor]);
  const dueSupplierKeys = useMemo(() => {
    const next = new Set();
    payableEntries.forEach((entry) => {
      const supplierId = String(entry?.supplier_id || '').trim();
      const distributorId = String(entry?.distributor_id || '').trim();
      if (supplierId) next.add(`supplier:${supplierId}`);
      if (distributorId) next.add(`distributor:${distributorId}`);
    });
    return next;
  }, [payableEntries]);
  const matchesSearch = useMemo(() => {
    const text = (values = []) => values
      .filter(Boolean)
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return (scope, valuesByScope) => {
      const scopeValues = valuesByScope[scope] || valuesByScope.all || [];
      return !normalizedSearchQuery || text(scopeValues).includes(normalizedSearchQuery);
    };
  }, [normalizedSearchQuery]);
  const matchesDateRange = useCallback((value) => {
    const startDate = normalizeDateKey(filters.start_date);
    const endDate = normalizeDateKey(filters.end_date);
    if (!startDate && !endDate) return true;
    const dateKey = normalizeDateKey(value);
    if (!dateKey) return false;
    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    return true;
  }, [filters.end_date, filters.start_date]);
  const filteredPayableEntries = useMemo(() => {
    const nextEntries = payableEntries.filter((entry) => {
      const overdueDays = toNumber(entry?.overdue_days);
      const paymentDueDate = normalizeDateKey(entry?.payment_due_date);
      const supplierDisplayName = getSupplierDisplayName(entry);
      if (filters.distributor_id && String(entry?.distributor_id || '').trim() !== String(filters.distributor_id || '').trim()) {
        return false;
      }
      if (quickView === 'due') {
        const dueEntries = payableEntries.filter((item) => toNumber(item?.overdue_days) > 0);
        if (dueEntries.length && overdueDays <= 0) return false;
      }
      if (quickView === 'recent') {
        const recentCutoff = normalizeDateKey(toDateToken(shiftDateByDays(new Date(), -(RECENT_LEDGER_DAY_WINDOW - 1))));
        if (paymentDueDate && recentCutoff && paymentDueDate < recentCutoff) return false;
      }
      if (!matchesDateRange(paymentDueDate)) return false;
      return matchesSearch(searchScope, {
        all: [
          supplierDisplayName,
          entry?.distributor_name,
          entry?.po_number,
          entry?.payment_due_date,
          entry?.balance_due,
          entry?.po_status,
          entry?.payment_status,
          entry?.next_action,
        ],
        supplier: [supplierDisplayName, entry?.distributor_name],
        po_number: [entry?.po_number],
        ledger: [entry?.po_status, entry?.payment_status, entry?.next_action],
        notes: [entry?.next_action],
      });
    });

    if (quickView !== 'due') return nextEntries;
    const overdueEntries = nextEntries.filter((entry) => toNumber(entry?.overdue_days) > 0);
    return overdueEntries.length ? overdueEntries : nextEntries;
  }, [filters.distributor_id, getSupplierDisplayName, matchesDateRange, matchesSearch, payableEntries, quickView, searchScope, toNumber]);
  const filteredLedgerEntries = useMemo(() => {
    const filtered = ledgerEntries.filter((entry) => {
      const supplierDisplayName = getSupplierDisplayName(entry);
      const dateKey = normalizeDateKey(entry.created_at || entry.transaction_date || entry.date);
      if (filters.distributor_id && String(entry?.distributor_id || '').trim() !== String(filters.distributor_id || '').trim()) {
        if (String(entry?.supplier_id || '').trim() !== String(filters.distributor_id || '').trim()) {
          // fallback to distributor id match for compatibility rows
          if (String(entry?.distributor_id || '').trim() !== String(filters.distributor_id || '').trim()) {
            return false;
          }
        }
      }
      if (!matchesDateRange(dateKey)) return false;
      if (quickView === 'recent') {
        const cutoff = normalizeDateKey(toDateToken(shiftDateByDays(new Date(), -(RECENT_LEDGER_DAY_WINDOW - 1))));
        if (dateKey && cutoff && dateKey < cutoff) return false;
      }
      if (quickView === 'due') {
        const supplierId = String(entry?.supplier_id || '').trim();
        const distributorId = String(entry?.distributor_id || '').trim();
        if (!(
          (supplierId && dueSupplierKeys.has(`supplier:${supplierId}`))
          || (distributorId && dueSupplierKeys.has(`distributor:${distributorId}`))
        )) {
          return false;
        }
      }
      const billNumber = getLedgerBillNumber(entry);
      const modeLabel = getLedgerModeMeta(entry)?.label || '';
      const typeLabel = getPurchaseLedgerTypeLabel(entry, getLedgerTypeLabel);
      return matchesSearch(searchScope, {
        all: [
          supplierDisplayName,
          entry?.distributor_name,
          entry?.po_number,
          billNumber,
          entry?.reference,
          entry?.description,
          entry?.notes,
          entry?.payment_mode,
          modeLabel,
          typeLabel,
        ],
        supplier: [supplierDisplayName, entry?.distributor_name],
        po_number: [entry?.po_number, entry?.reference],
        ledger: [billNumber, entry?.reference, entry?.payment_mode, modeLabel, typeLabel],
        notes: [entry?.description, entry?.notes],
      });
    });

    if (quickView === 'recent') return filtered;
    if (quickView === 'due') return filtered;
    return filtered;
  }, [dueSupplierKeys, filters.distributor_id, getLedgerBillNumber, getLedgerTypeLabel, getSupplierDisplayName, ledgerEntries, matchesDateRange, matchesSearch, quickView, searchScope]);
  const visiblePayables = useMemo(
    () => filteredPayableEntries.slice(0, PAYABLE_CARD_LIMIT),
    [filteredPayableEntries]
  );
  const nowTimestamp = DEFAULT_NOW_TIMESTAMP;
  const ledgerGroups = useMemo(() => {
    const groups = [];

    filteredLedgerEntries.forEach((entry) => {
      const label = formatLedgerDate(entry.created_at || entry.transaction_date || entry.date || nowTimestamp);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.label !== label) {
        groups.push({
          key: `${label}-${groups.length}`,
          label,
          items: [entry],
        });
        return;
      }
      lastGroup.items.push(entry);
    });

    return groups;
  }, [filteredLedgerEntries, nowTimestamp]);

  const activeFilterPills = [
    filters.distributor_id ? {
      key: 'supplier',
      label: selectedSupplierFilterLabel || 'Selected supplier',
      onClear: () => onFilterChange({ distributor_id: '' }),
    } : null,
    quickView !== 'all' ? {
      key: 'view',
      label: `View: ${QUICK_VIEW_OPTIONS.find((option) => option.value === quickView)?.label || quickView}`,
      onClear: () => setQuickView('all'),
    } : null,
    (filters.start_date || filters.end_date) ? {
      key: 'date',
      label: activeDatePresetLabel
        ? `Date: ${activeDatePresetLabel}`
        : `Date: ${formatDateDisplayToken(filters.start_date) || 'Start'} - ${formatDateDisplayToken(filters.end_date) || 'End'}`,
      onClear: () => onFilterChange({ start_date: '', end_date: '' }),
    } : null,
  ].filter(Boolean);

  const activeFilterCount = [
    normalizedSearchQuery,
    searchScope !== 'all' ? searchScope : '',
    filters.distributor_id,
    quickView !== 'all' ? quickView : '',
    filters.start_date,
    filters.end_date,
  ].filter(Boolean).length;

  const handleSearchDraftChange = (nextValue) => {
    const normalizedValue = String(nextValue || '');
    setSearchDraft(normalizedValue);
    if (!normalizedValue.trim()) {
      setSearchQuery('');
    }
  };

  const handleSearchSubmit = (value = searchDraft) => {
    setSearchQuery(String(value || ''));
  };

  const handleSearchScopeChange = (nextScope) => {
    const normalizedScope = SEARCH_SCOPE_OPTIONS.some((option) => option.value === nextScope) ? nextScope : 'all';
    setSearchScope(normalizedScope);
    setSearchQuery(searchDraft);
  };

  const handleSupplierFilterChange = (nextItems) => {
    const nextSupplierId = Array.isArray(nextItems) && nextItems.length ? String(nextItems[nextItems.length - 1] || '').trim() : '';
    onFilterChange({ distributor_id: nextSupplierId });
  };

  const handleViewFilterChange = (nextItems) => {
    const nextView = Array.isArray(nextItems) && nextItems.length ? String(nextItems[nextItems.length - 1] || '').trim() : 'all';
    setQuickView(nextView || 'all');
  };

  const handleDateRangeChange = (nextRange = []) => {
    const [startDate = '', endDate = ''] = Array.isArray(nextRange) ? nextRange : [];
    onFilterChange({
      start_date: startDate || '',
      end_date: endDate || '',
    });
  };

  const handleClearAllFilters = () => {
    setSearchDraft('');
    setSearchQuery('');
    setSearchScope('all');
    setQuickView('all');
    onFilterChange({
      distributor_id: '',
      start_date: '',
      end_date: '',
    });
  };

  useEffect(() => {
    if (!showAdvancedFilters) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (advancedFiltersRef.current?.contains(target) || filterToggleRef.current?.contains(target)) {
        return;
      }
      setShowAdvancedFilters(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowAdvancedFilters(false);
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
  }, [showAdvancedFilters]);

  return (
    <section className="stock-ledger-history purchase-payments-section">
      <BackofficePageHeader
        className="page-header purchase-payments-header"
        title="Payments & Ledger"
        subtitle="Track supplier payables, post payments, and scan running balances from one compact workspace."
        actions={(
          <>
            <button type="button" className="admin-btn" onClick={onRefreshLedger}>
              <RefreshCw size={18} /> Refresh
            </button>
            <button
              type="button"
              className="admin-btn primary purchase-payments-entry-btn"
              onClick={onOpenLedgerForm}
              aria-label="Open payment or credit entry"
            >
              <Plus size={18} /> Add Entry
            </button>
          </>
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
          className="stock-ledger-search-filter purchase-payments-search-filter"
          tone="sky"
          ariaLabel={activeSearchScopeCopy.ariaLabel}
          ariaAutocomplete="none"
          scopeOptions={SEARCH_SCOPE_OPTIONS}
          scopeValue={searchScope}
          onScopeChange={handleSearchScopeChange}
          scopeAriaLabel="Search scope"
          submitAriaLabel={activeSearchScopeCopy.submitAriaLabel || activeSearchScopeCopy.ariaLabel}
        />
        <button
          ref={filterToggleRef}
          type="button"
          className={`stock-ledger-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
          aria-controls="purchase-payments-advanced-filters"
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
        <div
          ref={advancedFiltersRef}
          id="purchase-payments-advanced-filters"
          className="stock-ledger-advanced-filters"
        >
          <div className="stock-ledger-filter-row stock-ledger-filter-row--type purchase-payments-filter-row">
            <span className="stock-ledger-filter-row-label">Supplier</span>
            <DropdownFilter
              options={supplierFilterOptions}
              selectedItems={filters.distributor_id ? [filters.distributor_id] : []}
              onChange={handleSupplierFilterChange}
              width="100%"
              allLabel="All Suppliers"
              tone="violet"
              multiSelect
              multiSelectMode="pills"
              className="stock-ledger-filter-row-control"
            />
          </div>

          <div className="stock-ledger-filter-row stock-ledger-filter-row--type purchase-payments-filter-row">
            <span className="stock-ledger-filter-row-label">View</span>
            <DropdownFilter
              options={QUICK_VIEW_OPTIONS.filter((option) => option.value !== 'all')}
              selectedItems={quickView === 'all' ? [] : [quickView]}
              onChange={handleViewFilterChange}
              width="100%"
              allLabel="All Views"
              tone="sky"
              multiSelect
              multiSelectMode="pills"
              className="stock-ledger-filter-row-control"
            />
          </div>

          <div className="stock-ledger-filter-row stock-ledger-filter-row--date purchase-payments-filter-row">
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
              showPlaceholderText
              alwaysOpen
            />
          </div>
        </div>
      ) : null}

      <div className="summary-stats">
        <div className="stat-card purchase">
          <span className="stat-value">{formatCurrency(totalPayable)}</span>
          <span className="stat-label">Total Payable</span>
        </div>
        <div className="stat-card sale">
          <span className={`stat-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(ledgerBalanceSummary.value)}
          </span>
          <span className="stat-label">{ledgerBalanceSummary.label}</span>
        </div>
        <div className="stat-card return">
          <span className="stat-value">{filteredPayableEntries.length}</span>
          <span className="stat-label">Due Suppliers</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{overdueCount}</span>
          <span className="stat-label">Overdue</span>
        </div>
      </div>

      <div className="ledger-table-container purchase-payments-ledger-container">
        {ledgerLoading ? (
          <div className="loading">Loading payments and ledger...</div>
        ) : (filteredPayableEntries.length === 0 && ledgerGroups.length === 0) ? (
          <div className="empty-state">
            <p>No supplier payables or payment history match this view.</p>
            <p>Adjust the filters, switch the view, or add a new payment entry to begin the ledger.</p>
          </div>
        ) : (
          <div className="purchase-payments-ledger-sheet">
            {visiblePayables.length ? (
              <section className="purchase-ledger-group">
                <div className="purchase-ledger-group-head">Due suppliers</div>
                <div className="purchase-ledger-group-items">
                  {visiblePayables.map((entry) => {
                    const balanceDue = toNumber(entry?.balance_due);
                    const overdueDays = toNumber(entry?.overdue_days);
                    const isOverdue = overdueDays > 0;
                    const supplierDisplayName = getSupplierDisplayName(entry);
                    const { label, title, ariaLabel, Icon, isConfirmAction } = getPayableActionMeta(entry);
                    const handleRowAction = isConfirmAction
                      ? () => {
                          if (typeof onOpenProcessModal !== 'function') return;
                          onOpenProcessModal({
                            id: entry.order_id,
                            po_number: entry.po_number,
                            bill_number: entry.bill_number,
                            invoice_number: entry.invoice_number,
                            distributor_name: entry.distributor_name,
                            supplier_name: entry.supplier_name,
                          });
                        }
                      : () => onOpenPayable(entry.order_id);

                    return (
                      <div
                        key={`payments-payable-${entry.order_id}`}
                        className={`purchase-ledger-row purchase-payable-row${isOverdue ? ' ledger-row-unpaid' : ''}`}
                      >
                        <div className="purchase-ledger-row-main">
                          <div className="purchase-ledger-row-copy">
                            <span className="purchase-ledger-entity" title={supplierDisplayName}>
                              {supplierDisplayName}
                            </span>
                            <div className="purchase-ledger-row-meta">
                              <span title={entry.po_number}>{entry.po_number || 'Manual payable'}</span>
                              <span title={entry.payment_due_date || ''}>
                                <Clock size={10} />
                                {entry.payment_due_date || 'No due date'}
                              </span>
                              {isOverdue ? (
                                <span className="purchase-ledger-row-note" title={`${overdueDays} days overdue`}>
                                  <AlertTriangle size={11} />
                                  {overdueDays}d overdue
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="purchase-ledger-row-side">
                            <strong className={`purchase-ledger-amount ${isOverdue ? 'negative' : 'positive'}`}>
                              {formatCurrency(balanceDue)}
                            </strong>
                            <button
                              type="button"
                              className="purchase-payable-action"
                              onClick={handleRowAction}
                              title={title}
                              aria-label={`${ariaLabel} ${supplierDisplayName}`}
                              disabled={isConfirmAction && typeof onOpenProcessModal !== 'function'}
                            >
                              <Icon size={14} />
                              <span>{label}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {ledgerGroups.length ? (
              ledgerGroups.map((group) => (
                <section key={group.key} className="purchase-ledger-group">
                  <div className="purchase-ledger-group-head">{group.label}</div>
                  <div className="purchase-ledger-group-items">
                    {group.items.map((entry, index) => {
                      const typeLabel = getPurchaseLedgerTypeLabel(entry, getLedgerTypeLabel);
                      const { Icon: ModeIcon, label: modeLabel, className: modeClassName } = getLedgerModeMeta(entry);
                      const signedAmount = getLedgerSignedAmount(entry, toNumber);
                      const referenceValue = entry.reference || entry.po_number || '';
                      const billNumber = getLedgerBillNumber(entry);
                      const noteValue = entry.description || '';
                      const metaValues = [];

                      if (referenceValue) metaValues.push(referenceValue);
                      if (billNumber && billNumber !== '-' && billNumber !== referenceValue) metaValues.push(billNumber);

                      return (
                        <div
                          key={entry.id || `${group.key}-${index}`}
                          className={`purchase-ledger-row ${getLedgerRowStatusClass(entry)}`}
                        >
                          <div className="purchase-ledger-row-main">
                            <div className="purchase-ledger-row-copy">
                              <span className="purchase-ledger-entity" title={getSupplierDisplayName(entry)}>
                                {getSupplierDisplayName(entry)}
                              </span>
                              {metaValues.length || noteValue ? (
                                <div className="purchase-ledger-row-meta">
                                  {metaValues.map((value) => (
                                    <span key={`${entry.id || index}-${value}`} title={value}>
                                      {value}
                                    </span>
                                  ))}
                                  {noteValue ? (
                                    <span className="purchase-ledger-row-note" title={noteValue}>
                                      <FileText size={11} />
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="purchase-ledger-row-side">
                              <strong className={`purchase-ledger-amount ${signedAmount < 0 ? 'negative' : 'positive'}`}>
                                {formatCurrency(signedAmount)}
                              </strong>
                              <div className="purchase-ledger-row-flags">
                                <span className="purchase-ledger-type">{typeLabel}</span>
                                <span className={`purchase-ledger-mode ${modeClassName}`} title={modeLabel} aria-label={modeLabel}>
                                  <ModeIcon size={14} />
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
};

export default PurchasePaymentsSection;
