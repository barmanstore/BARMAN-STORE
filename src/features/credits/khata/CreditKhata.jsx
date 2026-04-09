import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  FileText,
  Minus,
  Paperclip,
  PencilLine,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import { DateRangeFilter, DropdownFilter, SearchFilter } from '../../../shared/components/filters';
import {
  createClientRequestId,
  creditApi,
  resolveMediaUrl,
  usersApi,
} from '../../../shared/services/api';
import { formatCurrency, formatDate, truncateUserName } from '../../../shared/utils/formatters';
import { getTodayDate, toLocalDateKey } from '../../../shared/utils/dateTime';
import { getLedgerEntryTimestamp, getSignedLedgerAmount, toNumber } from '../../../shared/utils/ledger';
import CalculatedAmountInput from '../../../shared/components/CalculatedAmountInput';
import WindowModal from '../../../shared/components/window/WindowModal';
import { useSession } from '../../../providers/SessionProvider';
import useCreditKhataLedgerForm from './hooks/useCreditKhataLedgerForm';
import {
  getCreditEntryDescription,
  getCreditEntrySourceLabel,
  getCreditEntryTypeLabel,
} from '../history/utils/creditLedgerPresentation';
import './CreditKhata.css';

const SEARCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customer' },
  { value: 'reference', label: 'Reference' },
  { value: 'notes', label: 'Notes' },
  { value: 'type', label: 'Type' },
];

const SEARCH_SCOPE_COPY = {
  all: { placeholder: 'Search credit khata', ariaLabel: 'Search credit khata' },
  customer: { placeholder: 'Search customer', ariaLabel: 'Search customer' },
  reference: { placeholder: 'Search reference', ariaLabel: 'Search reference' },
  notes: { placeholder: 'Search notes', ariaLabel: 'Search notes' },
  type: { placeholder: 'Search type', ariaLabel: 'Search type' },
};

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'payment', label: 'Payment' },
  { value: 'manual_sale', label: 'Manual Sale' },
  { value: 'bill', label: 'Bill' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'correction', label: 'Correction' },
  { value: 'entry', label: 'Entry' },
];

const normalizeRows = (payload) => (Array.isArray(payload) ? payload : (Array.isArray(payload?.rows) ? payload.rows : []));
const getRecordDate = (entry) => getLedgerEntryTimestamp(entry, ['transaction_ts', 'transactionTs', 'transaction_date', 'created_at', 'date']);
const isLedgerEntryEdited = (entry) => Number(entry?.edited || 0) === 1 || !!entry?.edited_at;
const formatDateDisplayToken = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
};

const getDefaultFormData = (selectedUserId = '', type = 'payment') => ({
  user_id: selectedUserId ? String(selectedUserId) : '',
  type: type === 'given' ? 'given' : 'payment',
  amount: '',
  transactionDate: getTodayDate(),
  reference: '',
  description: '',
  imageBase64: '',
  imagePath: '',
  attachmentName: '',
});

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

const formatLedgerGroupLabel = (value) => formatDate(value, 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const normalizeValue = (value) => String(value || '').trim().toLowerCase();
const normalizeTypeValue = (value) => normalizeValue(value).replace(/\s+/g, '_');
const getCustomerName = (entry, usersById) => {
  const userKey = String(entry?.user_id || '');
  return usersById[userKey]?.name || entry?.customer_name || entry?.user_name || '-';
};
const getEntryTypeValue = (entry) => normalizeTypeValue(getCreditEntryTypeLabel(entry));
const getEntryTypeTone = (entry) => {
  switch (getEntryTypeValue(entry)) {
    case 'payment': return 'payment';
    case 'manual_sale': return 'manual-sale';
    case 'bill': return 'bill';
    case 'reversal': return 'reversal';
    case 'correction': return 'correction';
    default: return 'entry';
  }
};
const getEntryTypeIcon = (entry) => {
  switch (getEntryTypeValue(entry)) {
    case 'payment': return <ArrowDown size={12} aria-hidden="true" />;
    case 'manual_sale': return <ArrowUp size={12} aria-hidden="true" />;
    case 'bill': return <FileText size={12} aria-hidden="true" />;
    case 'reversal': return <RotateCcw size={12} aria-hidden="true" />;
    case 'correction': return <PencilLine size={12} aria-hidden="true" />;
    default: return <Minus size={12} aria-hidden="true" />;
  }
};
const getEntryDetailsText = (entry) => {
  const sourceLabel = String(getCreditEntrySourceLabel(entry) || '').trim();
  const description = String(getCreditEntryDescription(entry) || '').trim();
  return [sourceLabel, description].filter((value) => value && value !== '-').join(' ');
};
const formatSignedCurrency = (amount) => {
  const normalized = toNumber(amount);
  return `${normalized < 0 ? '-' : '+'}${formatCurrency(Math.abs(normalized))}`;
};

function CreditKhata({ user }) {
  const { clearUser } = useSession();
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [filters, setFilters] = useState({ user_id: '', transaction_type: '', start_date: '', end_date: '' });
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerFormData, setLedgerFormData] = useState(getDefaultFormData());
  const [editingLedgerEntryId, setEditingLedgerEntryId] = useState(null);
  const [ledgerSubmitting, setLedgerSubmitting] = useState(false);
  const [ledgerUploading, setLedgerUploading] = useState(false);
  const ledgerSubmitLockRef = useRef(false);
  const ledgerRequestIdRef = useRef('');
  const ledgerFileInputRef = useRef(null);
  const advancedFiltersRef = useRef(null);
  const filterToggleRef = useRef(null);
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);

  const usersById = useMemo(() => {
    const map = {};
    users.forEach((row) => { map[String(row.id)] = row; });
    return map;
  }, [users]);

  const customerOptions = useMemo(() => (
    [...users]
      .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), undefined, { numeric: true, sensitivity: 'base' }))
      .map((customer) => ({ value: String(customer.id), label: customer.name }))
  ), [users]);

  const fetchLedger = async (selectedUserId, customerRows = users) => {
    setLedgerLoading(true);
    setError('');
    try {
      let merged = [];
      try {
        merged = await creditApi.getLedger(selectedUserId ? { user_id: selectedUserId } : {});
      } catch (err) {
        const errMsg = String(err?.message || '').toLowerCase();
        const isMissingLedgerEndpoint = errMsg.includes('not found') || errMsg.includes('cannot get') || errMsg.includes('not available');
        if (!isMissingLedgerEndpoint) throw err;
        const sourceUsers = selectedUserId
          ? customerRows.filter((row) => String(row.id) === String(selectedUserId))
          : customerRows;
        const responses = await Promise.all(
          sourceUsers.map(async (customer) => {
            const payload = await creditApi.getHistory(customer.id, { all: 'true' });
            return normalizeRows(payload).map((entry) => ({
              ...entry,
              user_id: entry.user_id ?? customer.id,
              customer_name: entry.customer_name || customer.name,
            }));
          })
        );
        merged = responses.flat();
      }

      const runningBalanceByUser = {};
      const chronological = [...(merged || [])].sort((left, right) => {
        const dateDiff = getRecordDate(left) - getRecordDate(right);
        return dateDiff !== 0 ? dateDiff : Number(left.id || 0) - Number(right.id || 0);
      });

      const withBalances = chronological.map((entry) => {
        const userKey = String(entry.user_id || 'unknown');
        const previous = runningBalanceByUser[userKey] || 0;
        const next = previous + getSignedLedgerAmount(entry);
        runningBalanceByUser[userKey] = next;
        return { ...entry, computed_balance: next };
      });

      setLedgerRecords(withBalances.sort((left, right) => {
        const dateDiff = getRecordDate(right) - getRecordDate(left);
        return dateDiff !== 0 ? dateDiff : Number(right.id || 0) - Number(left.id || 0);
      }));
    } catch (err) {
      if (err?.status === 401) {
        clearUser();
        window.location.href = '/login';
        return;
      }
      setError(err.message || 'Failed to load credit khata ledger');
      setLedgerRecords([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const fetchUsers = async () => {
    const allUsers = await usersApi.getAll();
    const customers = (allUsers || [])
      .filter((row) => row.role !== 'admin')
      .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
    setUsers(customers);
    return customers;
  };

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      setError('');
      try {
        await fetchUsers();
      } catch (err) {
        if (err?.status === 401) {
          clearUser();
          window.location.href = '/login';
          return;
        }
        setError(err.message || 'Failed to load credit khata data');
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchLedger(filters.user_id, users);
  }, [filters.user_id, loading]);

  useEffect(() => {
    if (!showAdvancedFilters) return undefined;
    const handlePointerDown = (event) => {
      if (advancedFiltersRef.current?.contains(event.target)) return;
      if (filterToggleRef.current?.contains(event.target)) return;
      setShowAdvancedFilters(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowAdvancedFilters(false);
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

  const {
    handleOpenLedgerForm,
    handleOpenLedgerEdit,
    closeLedgerForm,
    handleLedgerFileUpload,
    handleClearLedgerAttachment,
    handleLedgerSubmit,
  } = useCreditKhataLedgerForm({
    getDefaultFormData,
    setShowLedgerForm,
    setEditingLedgerEntryId,
    setLedgerFormData,
    setLedgerSubmitting,
    setLedgerUploading,
    ledgerSubmitLockRef,
    ledgerRequestIdRef,
    setError,
    ledgerSubmitting,
    ledgerUploading,
    ledgerFormData,
    editingLedgerEntryId,
    user,
    creditApi,
    createClientRequestId,
    fetchLedger,
    filters,
    users,
    ledgerFileInputRef,
    clearUser,
  });

  const ledgerEntryLabel = ledgerFormData.type === 'payment' ? 'Payment' : 'Manual Sale';

  const activeDatePresetLabel = useMemo(() => {
    if (!filters.start_date && !filters.end_date) return '';
    const normalizeRange = (startDate, endDate) => [String(startDate || '').trim(), String(endDate || '').trim()].join('|');
    const currentRange = normalizeRange(filters.start_date, filters.end_date);
    return dateRangePresets.find((preset) => {
      const [presetStart, presetEnd] = Array.isArray(preset?.value) ? preset.value : [];
      return normalizeRange(presetStart, presetEnd) === currentRange;
    })?.label || '';
  }, [dateRangePresets, filters.end_date, filters.start_date]);

  const filteredLedgerRecords = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    return ledgerRecords.filter((entry) => {
      const entryDate = toLocalDateKey(getRecordDate(entry));
      if (filters.transaction_type && getEntryTypeValue(entry) !== normalizeTypeValue(filters.transaction_type)) return false;
      if (filters.start_date && entryDate && entryDate < filters.start_date) return false;
      if (filters.end_date && entryDate && entryDate > filters.end_date) return false;
      if (!normalizedSearchQuery) return true;

      const customerName = getCustomerName(entry, usersById);
      const typeLabel = getCreditEntryTypeLabel(entry);
      const sourceLabel = String(getCreditEntrySourceLabel(entry) || '').trim();
      const description = String(getCreditEntryDescription(entry) || '').trim();
      const searchableFields = {
        all: [customerName, entry.reference, sourceLabel, description, getEntryDetailsText(entry), typeLabel, entry.type, entry.amount, entry.balance],
        customer: [customerName],
        reference: [entry.reference, sourceLabel],
        notes: [description, getEntryDetailsText(entry)],
        type: [typeLabel, entry.type],
      };
      const searchableText = (searchableFields[searchScope] || searchableFields.all)
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return searchableText.includes(normalizedSearchQuery);
    });
  }, [filters.end_date, filters.start_date, filters.transaction_type, ledgerRecords, searchQuery, searchScope, usersById]);

  const groupedLedgerRecords = useMemo(() => {
    if (!filteredLedgerRecords.length) return [];
    const grouped = filteredLedgerRecords.reduce((accumulator, entry) => {
      const dateKey = toLocalDateKey(getRecordDate(entry)) || 'unknown';
      if (!accumulator.has(dateKey)) accumulator.set(dateKey, []);
      accumulator.get(dateKey).push(entry);
      return accumulator;
    }, new Map());
    return Array.from(grouped.entries())
      .sort(([leftDate], [rightDate]) => String(rightDate).localeCompare(String(leftDate)))
      .map(([dateKey, entries]) => ({
        key: dateKey,
        label: dateKey === 'unknown' ? 'Unknown date' : formatLedgerGroupLabel(dateKey),
        items: entries,
      }));
  }, [filteredLedgerRecords]);

  const ledgerBalanceSummary = useMemo(() => {
    const balanceByUser = {};
    for (const entry of ledgerRecords) {
      const userKey = String(entry.user_id || 'unknown');
      if (balanceByUser[userKey] === undefined) {
        balanceByUser[userKey] = toNumber(entry.computed_balance ?? entry.balance);
      }
    }
    if (filters.user_id) {
      return { label: 'Customer Balance', value: toNumber(balanceByUser[String(filters.user_id)] || 0) };
    }
    return {
      label: 'Total Balance (All Customers)',
      value: Object.values(balanceByUser).reduce((sum, value) => sum + toNumber(value), 0),
    };
  }, [filters.user_id, ledgerRecords]);

  const summaryCounts = useMemo(() => ({
    visible: filteredLedgerRecords.length,
    payments: filteredLedgerRecords.filter((entry) => getEntryTypeValue(entry) === 'payment').length,
    manualSales: filteredLedgerRecords.filter((entry) => getEntryTypeValue(entry) === 'manual_sale').length,
    edited: filteredLedgerRecords.filter((entry) => isLedgerEntryEdited(entry)).length,
  }), [filteredLedgerRecords]);

  const latestEntryIdByUser = useMemo(() => {
    const map = {};
    for (const entry of ledgerRecords) {
      const userKey = String(entry.user_id || '');
      if (!userKey || map[userKey]) continue;
      map[userKey] = Number(entry.id || 0);
    }
    return map;
  }, [ledgerRecords]);

  const activeFilterPills = [
    filters.user_id ? {
      key: 'user_id',
      label: `Customer: ${truncateUserName(usersById[String(filters.user_id)]?.name || '-', 24)}`,
      onClear: () => setFilters((prev) => ({ ...prev, user_id: '' })),
    } : null,
    filters.transaction_type ? {
      key: 'transaction_type',
      label: `Type: ${TRANSACTION_TYPE_OPTIONS.find((type) => type.value === filters.transaction_type)?.label || filters.transaction_type}`,
      onClear: () => setFilters((prev) => ({ ...prev, transaction_type: '' })),
    } : null,
    (filters.start_date || filters.end_date) ? {
      key: 'date_range',
      label: activeDatePresetLabel
        ? `Date: ${activeDatePresetLabel}`
        : `Date: ${formatDateDisplayToken(filters.start_date) || 'Start'} - ${formatDateDisplayToken(filters.end_date) || 'End'}`,
      onClear: () => setFilters((prev) => ({ ...prev, start_date: '', end_date: '' })),
    } : null,
  ].filter(Boolean);

  const activeFilterCount = [
    searchQuery,
    searchScope !== 'all',
    filters.user_id,
    filters.transaction_type,
    filters.start_date || filters.end_date,
  ].filter(Boolean).length;
  const hasSearchState = Boolean(searchDraft.trim() || searchQuery.trim());
  const handleSearchDraftChange = (value) => setSearchDraft(value);
  const handleSearchSubmit = (value) => setSearchQuery(value);
  const handleSingleSelectChange = (key, nextItems) => setFilters((prev) => ({
    ...prev,
    [key]: Array.isArray(nextItems) && nextItems.length ? String(nextItems[0] || '').trim() : '',
  }));
  const handleDateRangeChange = ([startDate, endDate]) => setFilters((prev) => ({ ...prev, start_date: startDate || '', end_date: endDate || '' }));
  const handleClearAllFilters = () => {
    setSearchDraft('');
    setSearchQuery('');
    setSearchScope('all');
    setFilters({ user_id: '', transaction_type: '', start_date: '', end_date: '' });
    setShowAdvancedFilters(false);
  };
  const handleRefreshLedger = () => fetchLedger(filters.user_id, users);

  const renderLoadingState = () => (
    <div className="credit-khata">
      <BackofficePageHeader className="credit-khata-header" title="Credit Khata" subtitle="Customer payments, manual sales, and running balances." />
      <div className="credit-khata-loading-shell" aria-hidden="true">
        <div className="credit-khata-skeleton-toolbar">
          <div className="credit-khata-skeleton-search" />
          <div className="credit-khata-skeleton-button" />
          <div className="credit-khata-skeleton-button" />
          <div className="credit-khata-skeleton-button" />
        </div>
        <div className="credit-khata-summary-stats credit-khata-skeleton-summary">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="credit-khata-stat-card credit-khata-skeleton-card">
              <span className="credit-khata-skeleton-line credit-khata-skeleton-line--value" />
              <span className="credit-khata-skeleton-line credit-khata-skeleton-line--label" />
            </div>
          ))}
        </div>
        <div className="credit-khata-table-container credit-khata-skeleton-table">
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <div key={rowIndex} className="credit-khata-skeleton-row">
              <span className="credit-khata-skeleton-cell credit-khata-skeleton-cell--customer" />
              <span className="credit-khata-skeleton-cell credit-khata-skeleton-cell--type" />
              <span className="credit-khata-skeleton-cell credit-khata-skeleton-cell--amount" />
              <span className="credit-khata-skeleton-cell credit-khata-skeleton-cell--balance" />
              <span className="credit-khata-skeleton-cell credit-khata-skeleton-cell--details" />
              <span className="credit-khata-skeleton-cell credit-khata-skeleton-cell--actions" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return renderLoadingState();
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="credit-khata">
        <div className="error-message">Only administrators can access Credit Khata.</div>
      </div>
    );
  }

  return (
    <div className="credit-khata">
      <BackofficePageHeader
        className="credit-khata-header"
        title="Credit Khata"
        subtitle="Customer payments, manual sales, and running balances."
        actions={(
          <div className="credit-khata-header-actions">
            <button type="button" className="admin-btn primary credit-khata-header-action" onClick={() => handleOpenLedgerForm('payment')}>
              <ArrowDown size={16} /><span>Add Payment</span>
            </button>
            <button type="button" className="admin-btn credit-khata-header-action" onClick={() => handleOpenLedgerForm('given')}>
              <ArrowUp size={16} /><span>Add Manual Sale</span>
            </button>
            <button
              type="button"
              className="admin-btn credit-khata-header-action credit-khata-header-action--icon"
              onClick={handleRefreshLedger}
              aria-label="Refresh ledger"
              title="Refresh ledger"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      />

      {error && <div className="error-message credit-khata-error">{error}</div>}

      <div className="credit-khata-filters">
        <SearchFilter
          id="credit-khata-search"
          placeholder={SEARCH_SCOPE_COPY[searchScope]?.placeholder || SEARCH_SCOPE_COPY.all.placeholder}
          value={searchDraft}
          onChange={handleSearchDraftChange}
          onSubmit={handleSearchSubmit}
          width="100%"
          stretch
          className="credit-khata-search-filter"
          tone="sky"
          ariaLabel={SEARCH_SCOPE_COPY[searchScope]?.ariaLabel || SEARCH_SCOPE_COPY.all.ariaLabel}
          ariaAutocomplete="none"
          scopeOptions={SEARCH_SCOPE_OPTIONS}
          scopeValue={searchScope}
          onScopeChange={setSearchScope}
          scopeAriaLabel="Search scope"
          submitAriaLabel={SEARCH_SCOPE_COPY[searchScope]?.ariaLabel || SEARCH_SCOPE_COPY.all.ariaLabel}
        />

        <button
          ref={filterToggleRef}
          type="button"
          className={`credit-khata-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
          aria-controls="credit-khata-advanced-filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
          {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {(hasSearchState || activeFilterCount) ? (
          <button type="button" className="credit-khata-filter-clear" onClick={handleClearAllFilters}>Clear</button>
        ) : null}
      </div>

      {activeFilterPills.length ? (
        <div className="credit-khata-active-filters" aria-label="Active filters">
          {activeFilterPills.map((pill) => (
            <button key={pill.key} type="button" className="credit-khata-active-filter-pill" onClick={pill.onClear}>
              <span>{pill.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {showAdvancedFilters ? (
        <div ref={advancedFiltersRef} id="credit-khata-advanced-filters" className="credit-khata-advanced-filters">
          <div className="credit-khata-filter-row credit-khata-filter-row--customer">
            <span className="credit-khata-filter-row-label">Customer</span>
            <DropdownFilter
              options={customerOptions}
              selectedItems={filters.user_id ? [filters.user_id] : []}
              onChange={(nextItems) => handleSingleSelectChange('user_id', nextItems)}
              width="100%"
              allLabel="All Customers"
              tone="sky"
              className="credit-khata-filter-row-control"
            />
          </div>

          <div className="credit-khata-filter-row credit-khata-filter-row--type">
            <span className="credit-khata-filter-row-label">Transaction Type</span>
            <DropdownFilter
              options={TRANSACTION_TYPE_OPTIONS}
              selectedItems={filters.transaction_type ? [filters.transaction_type] : []}
              onChange={(nextItems) => handleSingleSelectChange('transaction_type', nextItems)}
              width="100%"
              allLabel="All Types"
              tone="violet"
              multiSelect
              className="credit-khata-filter-row-control"
            />
          </div>

          <div className="credit-khata-filter-row credit-khata-filter-row--date">
            <span className="credit-khata-filter-row-label">Date Range</span>
            <DateRangeFilter
              value={[filters.start_date, filters.end_date]}
              onChange={handleDateRangeChange}
              width="100%"
              className="credit-khata-filter-row-control credit-khata-filter-row-control--date"
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

      <div className="credit-khata-summary-stats">
        <div className="credit-khata-stat-card credit-khata-stat-card--entries">
          <span className="credit-khata-stat-value">{summaryCounts.visible}</span>
          <span className="credit-khata-stat-label">Visible Entries</span>
        </div>
        <div className={`credit-khata-stat-card ${ledgerBalanceSummary.value >= 0 ? 'credit-khata-stat-card--due' : 'credit-khata-stat-card--advance'}`}>
          <span className={`credit-khata-stat-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(ledgerBalanceSummary.value)}
          </span>
          <span className="credit-khata-stat-label">{ledgerBalanceSummary.label}</span>
        </div>
        <div className="credit-khata-stat-card credit-khata-stat-card--payments">
          <span className="credit-khata-stat-value">{summaryCounts.payments}</span>
          <span className="credit-khata-stat-label">Payments</span>
        </div>
        <div className="credit-khata-stat-card credit-khata-stat-card--sales">
          <span className="credit-khata-stat-value">{summaryCounts.manualSales}</span>
          <span className="credit-khata-stat-label">Manual Sales</span>
        </div>
        <div className="credit-khata-stat-card credit-khata-stat-card--edited">
          <span className="credit-khata-stat-value">{summaryCounts.edited}</span>
          <span className="credit-khata-stat-label">Edited</span>
        </div>
      </div>

      <div className="credit-khata-table-container">
        {ledgerLoading ? (
          <div className="credit-khata-inline-loading" aria-hidden="true">
            <div className="credit-khata-inline-loading-line" />
            <div className="credit-khata-inline-loading-line short" />
          </div>
        ) : filteredLedgerRecords.length === 0 ? (
          <div className="credit-khata-empty-state">
            <strong>{hasSearchState || activeFilterCount ? 'No credit entries match the current filters.' : 'No credit entries found.'}</strong>
            <p>
              {hasSearchState || activeFilterCount
                ? 'Clear the filters or widen the search scope to bring entries back into view.'
                : 'Add a payment or manual sale to start building the ledger.'}
            </p>
            <div className="credit-khata-empty-actions">
              {(hasSearchState || activeFilterCount) ? (
                <button type="button" className="admin-btn" onClick={handleClearAllFilters}>Clear Filters</button>
              ) : null}
              <button type="button" className="admin-btn primary" onClick={() => handleOpenLedgerForm('payment')}>
                <ArrowDown size={16} /><span>Add Payment</span>
              </button>
              <button type="button" className="admin-btn" onClick={() => handleOpenLedgerForm('given')}>
                <ArrowUp size={16} /><span>Add Manual Sale</span>
              </button>
            </div>
          </div>
        ) : (
          <table className="credit-khata-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Balance</th>
                <th scope="col">Details</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedLedgerRecords.map((group) => (
                <Fragment key={group.key}>
                  <tr className="credit-khata-date-group-row">
                    <td colSpan={6}>
                      <span className="credit-khata-date-group-chip">{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map((entry, index) => {
                    const userKey = String(entry.user_id || '');
                    const customerName = truncateUserName(getCustomerName(entry, usersById), 26);
                    const isLatestForCustomer = Number(entry.id || 0) > 0 && Number(entry.id || 0) === Number(latestEntryIdByUser[userKey] || 0);
                    const signedAmount = getSignedLedgerAmount(entry);
                    const balanceValue = toNumber(entry.computed_balance ?? entry.balance);
                    const referenceText = String(getCreditEntrySourceLabel(entry) || entry.reference || '-').trim() || '-';
                    const descriptionText = String(getCreditEntryDescription(entry) || '-').trim() || '-';
                    const hasAttachment = Boolean(String(entry.image_path || '').trim());

                    return (
                      <tr key={entry.id || `${group.key}-${index}`}>
                        <td className="credit-khata-customer-cell" data-label="Customer">
                          <span className="credit-khata-customer-name">{customerName}</span>
                        </td>
                        <td className="credit-khata-type-cell" data-label="Type">
                          <span className={`credit-khata-type-pill ${getEntryTypeTone(entry)}`} title={getCreditEntryTypeLabel(entry)}>
                            {getEntryTypeIcon(entry)}
                            <span>{getCreditEntryTypeLabel(entry)}</span>
                          </span>
                        </td>
                        <td className="credit-khata-amount-cell" data-label="Amount">
                          <span className={signedAmount >= 0 ? 'credit-khata-amount-positive' : 'credit-khata-amount-negative'}>
                            {formatSignedCurrency(signedAmount)}
                          </span>
                        </td>
                        <td className="credit-khata-balance-cell" data-label="Balance">
                          <strong className={balanceValue > 0 ? 'credit-khata-balance-due' : balanceValue < 0 ? 'credit-khata-balance-advance' : 'credit-khata-balance-settled'}>
                            {formatCurrency(balanceValue)}
                          </strong>
                        </td>
                        <td className="credit-khata-details-cell" data-label="Details">
                          <span className="credit-khata-detail-line"><strong>Ref:</strong> <span>{referenceText}</span></span>
                          <span className="credit-khata-detail-note">{descriptionText}</span>
                          <div className="credit-khata-detail-chips">
                            {isLedgerEntryEdited(entry) ? <span className="credit-khata-status-chip edited">Edited</span> : null}
                            {hasAttachment ? <span className="credit-khata-status-chip attachment">Attachment</span> : null}
                            {String(entry.linked_bill_number || '').trim() ? <span className="credit-khata-status-chip bill">Bill Linked</span> : null}
                          </div>
                        </td>
                        <td className="credit-khata-actions-cell" data-label="Actions">
                          {entry.image_path ? (
                            <a
                              href={resolveMediaUrl(entry.image_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="credit-khata-action-icon"
                              title="View attachment"
                              aria-label="View attachment"
                            >
                              <Paperclip size={14} />
                            </a>
                          ) : null}
                          {isLatestForCustomer ? (
                            <button
                              type="button"
                              className="credit-khata-action-icon credit-khata-action-icon--edit"
                              onClick={() => handleOpenLedgerEdit(entry)}
                              title="Edit latest transaction for this customer"
                              aria-label="Edit latest transaction for this customer"
                            >
                              <PencilLine size={14} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showLedgerForm && (
        <WindowModal
          open
          title={editingLedgerEntryId ? `Edit Latest ${ledgerEntryLabel}` : `Add ${ledgerEntryLabel}`}
          onClose={closeLedgerForm}
          dismissible={!ledgerSubmitting && !ledgerUploading}
          themeClassName="credit-khata"
          contentClassName="credit-khata-modal-content px-4 pt-4 pb-4"
          initialSize={{ width: 620, height: 540 }}
        >
          <form className="credit-khata-form" onSubmit={handleLedgerSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ledger-user-id">Customer *</label>
                <select
                  id="ledger-user-id"
                  name="user_id"
                  value={ledgerFormData.user_id}
                  onChange={(e) => setLedgerFormData((prev) => ({ ...prev, user_id: e.target.value }))}
                  disabled={!!editingLedgerEntryId}
                  required
                >
                  <option value="">Select customer</option>
                  {customerOptions.map((customer) => (
                    <option key={customer.value} value={customer.value}>{truncateUserName(customer.label, 32)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ledger-amount">Amount *</label>
                <CalculatedAmountInput
                  id="ledger-amount"
                  name="amount"
                  value={ledgerFormData.amount}
                  onValueChange={(nextValue) => setLedgerFormData((prev) => ({ ...prev, amount: nextValue }))}
                  placeholder="Amount or expression"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ledger-transaction-date">Date</label>
                <input
                  type="date"
                  id="ledger-transaction-date"
                  name="transactionDate"
                  value={ledgerFormData.transactionDate}
                  onChange={(e) => setLedgerFormData((prev) => ({ ...prev, transactionDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ledger-reference">Reference</label>
                <input
                  type="text"
                  id="ledger-reference"
                  name="reference"
                  value={ledgerFormData.reference}
                  onChange={(e) => setLedgerFormData((prev) => ({ ...prev, reference: e.target.value }))}
                  placeholder="Bill / UPI / Bank ref"
                />
              </div>
              <div className="form-group">
                <label htmlFor="ledger-description">Note *</label>
                <input
                  type="text"
                  id="ledger-description"
                  name="description"
                  value={ledgerFormData.description}
                  onChange={(e) => setLedgerFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={`Short note for this ${ledgerEntryLabel.toLowerCase()}`}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ledger-attachment">Attachment</label>
                <input
                  ref={ledgerFileInputRef}
                  type="file"
                  id="ledger-attachment"
                  name="attachment"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLedgerFileUpload}
                  disabled={ledgerSubmitting || ledgerUploading}
                />
                {ledgerFormData.attachmentName ? (
                  <div className="credit-ledger-note">
                    <span>{ledgerFormData.attachmentName}</span>
                    <button type="button" className="admin-btn" onClick={handleClearLedgerAttachment} disabled={ledgerSubmitting || ledgerUploading}>
                      Remove File
                    </button>
                  </div>
                ) : null}
                {!ledgerFormData.attachmentName && ledgerFormData.imagePath ? (
                  <div className="credit-ledger-note">
                    <a href={resolveMediaUrl(ledgerFormData.imagePath)} target="_blank" rel="noopener noreferrer">
                      View Current Attachment
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={closeLedgerForm} disabled={ledgerSubmitting || ledgerUploading}>
                Cancel
              </button>
              <button type="submit" className="submit-btn" disabled={ledgerSubmitting || ledgerUploading}>
                {ledgerSubmitting ? 'Saving...' : ledgerUploading ? 'Preparing File...' : (editingLedgerEntryId ? `Update ${ledgerEntryLabel}` : `Save ${ledgerEntryLabel}`)}
              </button>
            </div>
          </form>
        </WindowModal>
      )}
    </div>
  );
}

export default CreditKhata;
