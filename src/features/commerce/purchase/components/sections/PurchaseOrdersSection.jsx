import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Eye,
  MessageCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Truck,
  ArrowUpDown,
  Check,
  Trash2,
} from 'lucide-react';
import {
  DateRangeFilter,
  DropdownFilter,
  SearchFilter,
} from '../../../../../shared/components/filters';
import WindowModal from '../../../../../shared/components/window/WindowModal';

const SORTABLE_COLUMNS = {
  poNumber: 'po_number',
  balanceDue: 'balance_due',
  dueDate: 'due_date',
};

const DEFAULT_SORT_DIRECTION = {
  [SORTABLE_COLUMNS.poNumber]: 'asc',
  [SORTABLE_COLUMNS.balanceDue]: 'desc',
  [SORTABLE_COLUMNS.dueDate]: 'asc',
};

const PAGE_SIZE = 8;
const FILTER_WIDTH = '100%';
const SEARCH_FILTER_WIDTH = '100%';

const PO_STATUS_FILTER_OPTIONS = [
  { value: 'prepared', label: 'Prepared' },
  { value: 'sent', label: 'Sent' },
  { value: 'revised', label: 'Revised' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'part_paid', label: 'Part Paid' },
  { value: 'fully_paid', label: 'Fully Paid' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_FILTER_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'part_paid', label: 'Part Paid' },
  { value: 'paid', label: 'Paid' },
];

const SEARCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'po_number', label: 'PO #' },
  { value: 'supplier', label: 'Supplier' },
];

const SEARCH_SCOPE_COPY = {
  all: {
    placeholder: 'Search PO or Supplier',
    ariaLabel: 'Search PO or Supplier',
    submitAriaLabel: 'Search purchase orders by PO number or supplier',
  },
  po_number: {
    placeholder: 'Search PO #',
    ariaLabel: 'Search PO #',
    submitAriaLabel: 'Search purchase orders by PO number',
  },
  supplier: {
    placeholder: 'Search Supplier',
    ariaLabel: 'Search Supplier',
    submitAriaLabel: 'Search purchase orders by supplier',
  },
};

const parseMultiSelectValue = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const getOrderSupplierLabel = (order) => String(order?.supplier_name || order?.distributor_name || '').trim();

const getOrderSupplierFilterKey = (order) => {
  const supplierId = String(order?.supplier_id || '').trim();
  if (supplierId) return `supplier:${supplierId}`;

  const distributorId = String(order?.distributor_id || '').trim();
  const supplierLabel = getOrderSupplierLabel(order);
  if (distributorId && supplierLabel) {
    return `distributor:${distributorId}:${supplierLabel.toLowerCase()}`;
  }
  if (supplierLabel) return `name:${supplierLabel.toLowerCase()}`;
  if (distributorId) return `distributor:${distributorId}`;
  return '';
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
  return [
    { label: 'Today', value: [todayToken, todayToken] },
    { label: 'Last 7 Days', value: [toDateToken(shiftDateByDays(today, -6)), todayToken] },
    { label: 'This Month', value: [toDateToken(new Date(today.getFullYear(), today.getMonth(), 1)), todayToken] },
  ];
};

const compareNullable = (left, right, comparator) => {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return comparator(left, right);
};

const PurchaseOrdersSection = ({
  filters,
  onFilterChange,
  onOpenLedgerForm,
  onOpenReturn,
  onNewOrder,
  purchaseOrders,
  isPoEditable,
  canAddPaymentToPo,
  canReceivePo,
  canClosePo,
  getPoLifecycleStatus,
  getPoPaymentStatus,
  handleViewOrder,
  handleOpenProcessModal,
  handleSendDistributorWhatsApp,
  sendingWhatsAppOrderId,
  handleReceiveClick,
  handleOpenPoPaymentModal,
  handleOpenPoCorrectionForm,
  poCorrectionSubmitting,
  handleUpdateStatus,
  handleDeleteOrder,
  getOrderDisplayTotal,
  getStatusBadge,
  getPoBalanceDue,
  formatCurrency,
}) => {
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [selectedSupplierFilters, setSelectedSupplierFilters] = useState([]);
  const [selectedPoStatuses, setSelectedPoStatuses] = useState(() => parseMultiSelectValue(filters.status));
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState(() => parseMultiSelectValue(filters.payment_status));
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    Boolean(filters.distributor_id || filters.status || filters.payment_status || filters.start_date || filters.end_date)
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc',
  });
  const advancedFiltersRef = useRef(null);
  const filterToggleRef = useRef(null);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);
  const supplierFilterOptions = useMemo(() => {
    const optionsByKey = new Map();

    purchaseOrders.forEach((order) => {
      const value = getOrderSupplierFilterKey(order);
      const label = getOrderSupplierLabel(order);
      if (!value || !label || optionsByKey.has(value)) return;
      optionsByKey.set(value, { value, label });
    });

    return [...optionsByKey.values()].sort((left, right) => (
      left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    ));
  }, [purchaseOrders]);

  const controllerSelectedSupplierFilters = useMemo(() => {
    const distributorId = String(filters.distributor_id || '').trim();
    if (!distributorId) return [];

    const matchedSuppliers = purchaseOrders
      .filter((order) => String(order?.distributor_id || '').trim() === distributorId)
      .map(getOrderSupplierFilterKey)
      .filter(Boolean);

    return [...new Set(matchedSuppliers)];
  }, [filters.distributor_id, purchaseOrders]);

  const effectiveSelectedSupplierFilters = selectedSupplierFilters.length
    ? selectedSupplierFilters
    : controllerSelectedSupplierFilters;
  const activeSupplierFilterCount = effectiveSelectedSupplierFilters.length || (filters.distributor_id ? 1 : 0);
  const hasActiveDateRange = Boolean(filters.start_date || filters.end_date);
  const activeAdvancedFilterCount = [
    activeSupplierFilterCount,
    selectedPoStatuses.length,
    selectedPaymentStatuses.length,
    hasActiveDateRange ? 1 : 0,
  ].reduce((total, value) => total + value, 0);

  const handleFilterValuesChange = (nextValues) => {
    onFilterChange(nextValues);
  };

  const handleFilterValueChange = (name, value) => {
    handleFilterValuesChange({ [name]: value });
  };

  const getNormalizedDateRange = (nextValues = {}) => {
    let startDate = typeof nextValues.start_date === 'string' ? nextValues.start_date : filters.start_date;
    let endDate = typeof nextValues.end_date === 'string' ? nextValues.end_date : filters.end_date;

    if (startDate && endDate && startDate > endDate) {
      if (typeof nextValues.start_date === 'string' && typeof nextValues.end_date !== 'string') {
        endDate = startDate;
      } else if (typeof nextValues.end_date === 'string' && typeof nextValues.start_date !== 'string') {
        startDate = endDate;
      } else {
        [startDate, endDate] = [endDate, startDate];
      }
    }

    return {
      start_date: startDate,
      end_date: endDate,
    };
  };

  const handleDateRangeChange = (nextRange = []) => {
    const [startDate = '', endDate = ''] = Array.isArray(nextRange) ? nextRange : [];
    handleFilterValuesChange(getNormalizedDateRange({
      start_date: startDate,
      end_date: endDate,
    }));
  };

  const handleSupplierFilterChange = (nextItems = []) => {
    if (filters.distributor_id) {
      handleFilterValueChange('distributor_id', '');
    }
    setSelectedSupplierFilters(Array.isArray(nextItems) ? nextItems : []);
  };

  const handleLocalMultiSelectChange = (nextItems, setSelectedValues, controllerFieldName) => {
    if (filters[controllerFieldName]) {
      handleFilterValueChange(controllerFieldName, '');
    }
    setSelectedValues(Array.isArray(nextItems) ? nextItems : []);
  };

  const handleClearAllFilters = () => {
    handleFilterValuesChange({
      distributor_id: '',
      status: '',
      payment_status: '',
      start_date: '',
      end_date: '',
    });
    setSelectedSupplierFilters([]);
    setSelectedPoStatuses([]);
    setSelectedPaymentStatuses([]);
    setSearchDraft('');
    setSearchQuery('');
    setSearchScope('all');
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

  const handleSearchDraftChange = (nextValue) => {
    const normalizedValue = String(nextValue || '');
    setSearchDraft(normalizedValue);
    if (!normalizedValue.trim()) {
      setSearchQuery('');
    }
  };

  const handleSearchSubmit = () => {
    setSearchQuery(searchDraft);
  };

  const handleSearchScopeChange = (nextScope) => {
    const normalizedScope = SEARCH_SCOPE_COPY[nextScope] ? nextScope : 'all';
    setSearchScope(normalizedScope);
    setSearchQuery(searchDraft);
  };

  const handleRequestDelete = (order) => {
    setPendingDeleteOrder(order || null);
  };

  const handleCancelDelete = () => {
    setPendingDeleteOrder(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteOrder) return;
    await handleDeleteOrder(pendingDeleteOrder.id);
    setPendingDeleteOrder(null);
  };

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
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={13} />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const getAriaSort = (columnKey) => {
    if (sortConfig.key !== columnKey) return 'none';
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  const sortedPurchaseOrders = useMemo(() => {
    if (!sortConfig.key) return purchaseOrders;

    const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;
    return [...purchaseOrders].sort((left, right) => {
      if (sortConfig.key === SORTABLE_COLUMNS.poNumber) {
        return directionMultiplier * compareNullable(
          String(left?.po_number || '').trim(),
          String(right?.po_number || '').trim(),
          (leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
        );
      }

      if (sortConfig.key === SORTABLE_COLUMNS.balanceDue) {
        return directionMultiplier * compareNullable(
          Number(getPoBalanceDue(left) || 0),
          Number(getPoBalanceDue(right) || 0),
          (leftValue, rightValue) => leftValue - rightValue
        );
      }

      if (sortConfig.key === SORTABLE_COLUMNS.dueDate) {
        const leftValue = left?.payment_due_date ? new Date(left.payment_due_date).getTime() : null;
        const rightValue = right?.payment_due_date ? new Date(right.payment_due_date).getTime() : null;
        return directionMultiplier * compareNullable(
          Number.isFinite(leftValue) ? leftValue : null,
          Number.isFinite(rightValue) ? rightValue : null,
          (normalizedLeft, normalizedRight) => normalizedLeft - normalizedRight
        );
      }

      return 0;
    });
  }, [getPoBalanceDue, purchaseOrders, sortConfig.direction, sortConfig.key]);

  const visiblePurchaseOrders = useMemo(() => {
    return sortedPurchaseOrders.filter((order) => {
      const lifecycleStatus = String(getPoLifecycleStatus(order) || '').trim().toLowerCase();
      const paymentStatus = String(getPoPaymentStatus(order) || '').trim().toLowerCase();
      const searchableText = (
        searchScope === 'po_number'
          ? [order?.po_number]
          : searchScope === 'supplier'
            ? [order?.supplier_name, order?.distributor_name]
            : [order?.po_number, order?.supplier_name, order?.distributor_name]
      )
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const supplierFilterKey = getOrderSupplierFilterKey(order);

      if (effectiveSelectedSupplierFilters.length && !effectiveSelectedSupplierFilters.includes(supplierFilterKey)) return false;
      if (selectedPoStatuses.length && !selectedPoStatuses.includes(lifecycleStatus)) return false;
      if (selectedPaymentStatuses.length && !selectedPaymentStatuses.includes(paymentStatus)) return false;
      if (normalizedSearchQuery && !searchableText.includes(normalizedSearchQuery)) return false;
      return true;
    });
  }, [
    effectiveSelectedSupplierFilters,
    getPoLifecycleStatus,
    getPoPaymentStatus,
    normalizedSearchQuery,
    searchScope,
    selectedPaymentStatuses,
    selectedPoStatuses,
    sortedPurchaseOrders,
  ]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCurrentPage(1);
  }, [
    normalizedSearchQuery,
    searchScope,
    activeSupplierFilterCount,
    filters.distributor_id,
    filters.status,
    filters.payment_status,
    filters.start_date,
    filters.end_date,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalPages = Math.max(1, Math.ceil(visiblePurchaseOrders.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const paginatedPurchaseOrders = useMemo(() => {
    const startIndex = (activePage - 1) * PAGE_SIZE;
    return visiblePurchaseOrders.slice(startIndex, startIndex + PAGE_SIZE);
  }, [activePage, visiblePurchaseOrders]);

  const pageSummaryStart = visiblePurchaseOrders.length === 0 ? 0 : ((activePage - 1) * PAGE_SIZE) + 1;
  const pageSummaryEnd = Math.min(activePage * PAGE_SIZE, visiblePurchaseOrders.length);

  const paginationItems = useMemo(() => {
    if (totalPages <= 1) return [1];

    const pages = new Set([1, totalPages, activePage - 1, activePage, activePage + 1]);
    const normalizedPages = [...pages]
      .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
      .sort((left, right) => left - right);

    const items = [];
    normalizedPages.forEach((pageNumber, index) => {
      const previousPage = normalizedPages[index - 1];
      if (previousPage && pageNumber - previousPage > 1) {
        items.push(`ellipsis-${previousPage}-${pageNumber}`);
      }
      items.push(pageNumber);
    });
    return items;
  }, [activePage, totalPages]);

  const activeSearchScopeCopy = SEARCH_SCOPE_COPY[searchScope] || SEARCH_SCOPE_COPY.all;

  return (
    <section className="purchase-section-shell">
      <div className="purchase-section-header purchase-orders-header">
        <div>
          <h2>Purchase Orders</h2>
          <p>Track, receive, pay, and close purchase orders in one compact list.</p>
        </div>
      </div>

      <div className="purchase-orders-toolbar-row">
        <div className="purchase-orders-toolbar" aria-label="Purchase order actions">
          <button className="admin-btn primary purchase-orders-toolbar-btn purchase-orders-toolbar-btn--primary" onClick={onNewOrder}>
            <Plus size={16} /> New Order
          </button>
          <span className="purchase-orders-toolbar-separator" aria-hidden="true" />
          <button
            className="admin-btn secondary purchase-orders-toolbar-btn purchase-orders-toolbar-btn--secondary"
            onClick={onOpenLedgerForm}
            title="Payment / Credit Entry"
            aria-label="Open payment or credit entry"
          >
            <DollarSign size={15} /> Payment
          </button>
          <button
            className="admin-btn secondary purchase-orders-toolbar-btn purchase-orders-toolbar-btn--secondary"
            onClick={onOpenReturn}
            title="Return / Exchange"
            aria-label="Open return or exchange"
          >
            <RotateCcw size={15} /> Return
          </button>
        </div>
        <div className="purchase-orders-toolbar-note" aria-live="polite">
          <strong>{visiblePurchaseOrders.length}</strong>
          <span>{visiblePurchaseOrders.length === 1 ? 'order' : 'orders'} matched</span>
          {normalizedSearchQuery ? <small>of {purchaseOrders.length}</small> : null}
        </div>
      </div>

      <div className="filters-bar purchase-orders-filters">
        <SearchFilter
          placeholder={activeSearchScopeCopy.placeholder}
          value={searchDraft}
          onChange={handleSearchDraftChange}
          onSubmit={handleSearchSubmit}
          width={SEARCH_FILTER_WIDTH}
          className="purchase-orders-search-filter"
          ariaLabel={activeSearchScopeCopy.ariaLabel}
          ariaAutocomplete="none"
          scopeOptions={SEARCH_SCOPE_OPTIONS}
          scopeValue={searchScope}
          onScopeChange={handleSearchScopeChange}
          scopeAriaLabel="Search scope"
          submitAriaLabel={activeSearchScopeCopy.submitAriaLabel}
          tone="sky"
        />
        <button
          ref={filterToggleRef}
          type="button"
          className={`purchase-orders-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
          aria-controls="purchase-orders-advanced-filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeAdvancedFilterCount ? <strong>{activeAdvancedFilterCount}</strong> : null}
          {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {(searchDraft || searchQuery || activeAdvancedFilterCount) ? (
          <button type="button" className="purchase-orders-filter-clear" onClick={handleClearAllFilters}>
            Clear
          </button>
        ) : null}
      </div>

      {showAdvancedFilters ? (
        <div ref={advancedFiltersRef} id="purchase-orders-advanced-filters" className="purchase-orders-advanced-filters">
          <div className="purchase-orders-filter-row purchase-orders-filter-row--supplier">
            <span className="purchase-orders-filter-row-label">Supplier</span>
            <DropdownFilter
              options={supplierFilterOptions}
              multiSelect
              selectedItems={effectiveSelectedSupplierFilters}
              onChange={handleSupplierFilterChange}
              width={FILTER_WIDTH}
              allLabel="All Suppliers"
              tone="amber"
              className="purchase-orders-filter-row-control"
            />
          </div>
          <div className="purchase-orders-filter-row purchase-orders-filter-row--status">
            <span className="purchase-orders-filter-row-label">PO Status</span>
            <DropdownFilter
              options={PO_STATUS_FILTER_OPTIONS}
              multiSelect
              selectedItems={selectedPoStatuses}
              onChange={(nextItems) => handleLocalMultiSelectChange(nextItems, setSelectedPoStatuses, 'status')}
              width={FILTER_WIDTH}
              allLabel="All Status"
              tone="violet"
              className="purchase-orders-filter-row-control"
            />
          </div>
          <div className="purchase-orders-filter-row purchase-orders-filter-row--payment">
            <span className="purchase-orders-filter-row-label">Payment</span>
            <DropdownFilter
              options={PAYMENT_FILTER_OPTIONS}
              multiSelect
              selectedItems={selectedPaymentStatuses}
              onChange={(nextItems) => handleLocalMultiSelectChange(nextItems, setSelectedPaymentStatuses, 'payment_status')}
              width={FILTER_WIDTH}
              allLabel="All Payment"
              tone="emerald"
              className="purchase-orders-filter-row-control"
            />
          </div>
          <div className="purchase-orders-filter-row purchase-orders-filter-row--date">
            <span className="purchase-orders-filter-row-label">Date Range</span>
            <DateRangeFilter
              value={[filters.start_date, filters.end_date]}
              onChange={handleDateRangeChange}
              width={FILTER_WIDTH}
              presets={dateRangePresets}
              helperText="Created date"
              tone="sky"
              className="purchase-orders-filter-row-control purchase-orders-filter-row-control--date"
            />
          </div>
        </div>
      ) : null}

      <div className="data-table purchase-orders-table">
        <table>
          <thead>
            <tr>
              <th aria-sort={getAriaSort(SORTABLE_COLUMNS.poNumber)}>
                <button type="button" className="purchase-orders-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.poNumber)}>
                  <span>PO Number</span>
                  {renderSortIcon(SORTABLE_COLUMNS.poNumber)}
                </button>
              </th>
              <th aria-sort={getAriaSort(SORTABLE_COLUMNS.balanceDue)}>
                <button type="button" className="purchase-orders-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.balanceDue)}>
                  <span>Balance Due</span>
                  {renderSortIcon(SORTABLE_COLUMNS.balanceDue)}
                </button>
              </th>
              <th aria-sort={getAriaSort(SORTABLE_COLUMNS.dueDate)}>
                <button type="button" className="purchase-orders-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.dueDate)}>
                  <span>Due Date</span>
                  {renderSortIcon(SORTABLE_COLUMNS.dueDate)}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty-state">
                  <div className="purchase-empty-state-card">
                    <strong>No purchase orders yet.</strong>
                    <p>Create a purchase order to start tracking supplier items, receiving, and balance due.</p>
                    <button type="button" className="admin-btn primary" onClick={onNewOrder}>
                      <Plus size={18} /> Create First Order
                    </button>
                  </div>
                </td>
              </tr>
            ) : visiblePurchaseOrders.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty-state">
                  <div className="purchase-empty-state-card purchase-empty-state-card--muted">
                    <strong>No purchase orders match these filters.</strong>
                    <p>Try a different PO number, supplier, or status selection.</p>
                    <button type="button" className="admin-btn secondary purchase-orders-toolbar-btn" onClick={handleClearAllFilters}>
                      Clear Filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedPurchaseOrders.map((order) => {
                const isEditableOrder = isPoEditable(order);
                const isPaymentEligible = canAddPaymentToPo(order);
                const isReceivableOrder = canReceivePo(order);
                const isCloseEligible = canClosePo(order);
                const poPaymentStatus = getPoPaymentStatus(order);
                const supplierDisplayName = String(order.supplier_name || order.distributor_name || '').trim() || '-';
                const itemCount = Math.max(0, Number(order.item_count ?? order.items?.length ?? 0) || 0);
                const totalAmount = getOrderDisplayTotal(order);
                const dueDateLabel = order.payment_due_date ? new Date(order.payment_due_date).toLocaleDateString() : '-';
                const paymentRowClass = poPaymentStatus === 'paid'
                  ? 'payment-status-paid'
                  : poPaymentStatus === 'part_paid'
                    ? 'payment-status-part-paid'
                    : 'payment-status-unpaid';
                return (
                  <tr key={order.id} className={`purchase-orders-row ${paymentRowClass}`}>
                    <td data-label="PO Number" className="purchase-order-primary-cell">
                      <div className="purchase-order-primary">
                        <strong className="purchase-order-number">{order.po_number}</strong>
                        <div className="purchase-order-meta" aria-label="Purchase order info">
                          <div className="purchase-order-meta-item supplier">
                            <span className="purchase-order-meta-value">{supplierDisplayName}</span>
                          </div>
                          <div className="purchase-order-meta-item count">
                            <span className="purchase-order-meta-value">{itemCount} items</span>
                          </div>
                          <div className="purchase-order-meta-item total">
                            <span className="purchase-order-meta-value">{formatCurrency(totalAmount)}</span>
                          </div>
                          <div className="purchase-order-meta-item status">
                            <span className="purchase-order-meta-value">{getStatusBadge(order)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Balance Due" className="purchase-order-balance-cell">
                      <span className="purchase-order-balance-value">{formatCurrency(getPoBalanceDue(order))}</span>
                    </td>
                    <td data-label="Due Date" className="purchase-order-due-cell">
                      <span className="purchase-order-due-value">{dueDateLabel}</span>
                    </td>
                    <td className="actions-cell" data-label="Actions">
                      <button
                        className="action-btn view"
                        title="View Details"
                        aria-label="View purchase order details"
                        onClick={() => handleViewOrder(order.id)}
                      >
                        <Eye size={15} />
                      </button>
                      {isEditableOrder ? (
                        <>
                          <button
                            className="action-btn"
                            title="Confirm"
                            aria-label="Confirm purchase order"
                            onClick={() => handleOpenProcessModal(order)}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            className="action-btn whatsapp"
                            title={sendingWhatsAppOrderId === order.id ? 'Preparing WhatsApp...' : 'Prepare WhatsApp (Manual)'}
                            aria-label="Prepare WhatsApp (Manual)"
                            onClick={() => handleSendDistributorWhatsApp(order)}
                            disabled={sendingWhatsAppOrderId === order.id}
                          >
                            <MessageCircle size={15} />
                          </button>
                        </>
                      ) : null}
                      {isReceivableOrder ? (
                        <button
                          className="action-btn receive"
                          title="Receive Items"
                          aria-label="Receive purchase order items"
                          onClick={() => handleReceiveClick(order)}
                        >
                          <Truck size={15} />
                        </button>
                      ) : null}
                      {isPaymentEligible && poPaymentStatus !== 'paid' ? (
                        <button
                          className="action-btn receive"
                          title="Add Payment"
                          aria-label="Add purchase order payment"
                          onClick={() => handleOpenPoPaymentModal(order)}
                        >
                          <DollarSign size={15} />
                        </button>
                      ) : null}
                      {isPaymentEligible ? (
                        <button
                          className="action-btn correction"
                          title="Correct Ledger Impact"
                          aria-label="Correct purchase order ledger impact"
                          onClick={() => handleOpenPoCorrectionForm(order)}
                          disabled={poCorrectionSubmitting}
                        >
                          <ArrowUpDown size={15} />
                        </button>
                      ) : null}
                      {isCloseEligible ? (
                        <button
                          className="action-btn"
                          title="Close Purchase Order"
                          aria-label="Close purchase order"
                          onClick={() => handleUpdateStatus(order.id, 'closed')}
                        >
                          <CheckCheck size={15} />
                        </button>
                      ) : null}
                      {isEditableOrder ? (
                        <button
                          className="action-btn delete"
                          title="Delete"
                          aria-label="Delete purchase order"
                          onClick={() => handleRequestDelete(order)}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {visiblePurchaseOrders.length > 0 ? (
        <div className="purchase-orders-pagination-shell">
          <div className="purchase-orders-pagination-summary">
            Showing {pageSummaryStart}-{pageSummaryEnd} of {visiblePurchaseOrders.length}
          </div>
          {totalPages > 1 ? (
            <div className="purchase-orders-pagination" aria-label="Purchase order pages">
              <button
                type="button"
                className="purchase-orders-page-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={activePage === 1}
              >
                Prev
              </button>
              {paginationItems.map((item) => (
                typeof item === 'number' ? (
                  <button
                    key={item}
                    type="button"
                    className={`purchase-orders-page-btn${item === activePage ? ' active' : ''}`}
                    onClick={() => setCurrentPage(item)}
                    aria-current={item === activePage ? 'page' : undefined}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={item} className="purchase-orders-page-ellipsis" aria-hidden="true">
                    ...
                  </span>
                )
              ))}
              <button
                type="button"
                className="purchase-orders-page-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={activePage === totalPages}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {pendingDeleteOrder ? (
        <WindowModal
          open
          title="Delete Purchase Order"
          onClose={handleCancelDelete}
          dismissible
          themeClassName="purchase-management"
          dialogClassName="purchase-modal-frame"
          headerClassName="purchase-modal-header"
          closeButtonClassName="purchase-modal-close-btn"
          initialSize={{ width: 520, height: 260 }}
        >
          <div className="purchase-confirm-delete">
            <p>
              Delete PO <strong>{pendingDeleteOrder.po_number || `#${pendingDeleteOrder.id}`}</strong>
              {pendingDeleteOrder.distributor_name ? ` for ${pendingDeleteOrder.distributor_name}` : ''}?
            </p>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={handleCancelDelete}>
                Cancel
              </button>
              <button type="button" className="submit-btn" onClick={handleConfirmDelete}>
                Delete PO
              </button>
            </div>
          </div>
        </WindowModal>
      ) : null}
    </section>
  );
};

export default PurchaseOrdersSection;
