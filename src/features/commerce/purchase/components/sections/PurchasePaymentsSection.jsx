import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpDown, Clock, FileText, Landmark, Plus, Search, Smartphone, Wallet } from 'lucide-react';

const PAYABLE_CARD_LIMIT = 12;
const RECENT_LEDGER_DAY_WINDOW = 14;
const QUICK_VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'due', label: 'Due' },
  { value: 'recent', label: 'Recent' },
];

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

const PurchasePaymentsSection = ({
  filters,
  distributors,
  suppliers,
  onFilterChange,
  onOpenLedgerForm,
  ledgerBalanceSummary,
  payables,
  onOpenPayable,
  ledgerLoading,
  ledgerRecords,
  getLedgerRowStatusClass,
  getDistributorName,
  getLedgerTypeLabel,
  formatCurrency,
  toNumber,
  getEntryDisplayBalance,
  getLedgerBillNumber,
}) => {
  const [quickView, setQuickView] = useState('all');
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
  const totalPayable = useMemo(
    () => payableEntries.reduce((sum, entry) => sum + toNumber(entry?.balance_due), 0),
    [payableEntries, toNumber]
  );
  const overdueCount = useMemo(
    () => payableEntries.filter((entry) => toNumber(entry?.overdue_days) > 0).length,
    [payableEntries, toNumber]
  );
  const payableLabel = filters.distributor_id ? 'Selected supplier payable' : 'Total payable';
  const payableCountLabel = `${payableEntries.length} due item${payableEntries.length === 1 ? '' : 's'}`;
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
  const recentLedgerEntries = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (RECENT_LEDGER_DAY_WINDOW - 1));
    return ledgerEntries.filter((entry) => {
      const value = entry?.created_at || entry?.transaction_date || entry?.date;
      const parsed = value ? new Date(value) : null;
      return parsed && !Number.isNaN(parsed.getTime()) && parsed >= cutoff;
    });
  }, [ledgerEntries]);
  const filteredPayableEntries = useMemo(() => {
    if (quickView !== 'due') return payableEntries;
    const overdueEntries = payableEntries.filter((entry) => toNumber(entry?.overdue_days) > 0);
    return overdueEntries.length ? overdueEntries : payableEntries;
  }, [payableEntries, quickView, toNumber]);
  const filteredLedgerEntries = useMemo(() => {
    if (quickView === 'recent') return recentLedgerEntries;
    if (quickView === 'due') {
      return ledgerEntries.filter((entry) => {
        const supplierId = String(entry?.supplier_id || '').trim();
        const distributorId = String(entry?.distributor_id || '').trim();
        return (
          (supplierId && dueSupplierKeys.has(`supplier:${supplierId}`))
          || (distributorId && dueSupplierKeys.has(`distributor:${distributorId}`))
        );
      });
    }
    return ledgerEntries;
  }, [dueSupplierKeys, ledgerEntries, quickView, recentLedgerEntries]);
  const visiblePayables = useMemo(
    () => filteredPayableEntries.slice(0, PAYABLE_CARD_LIMIT),
    [filteredPayableEntries]
  );
  const visiblePayableCountLabel = `${filteredPayableEntries.length} due item${filteredPayableEntries.length === 1 ? '' : 's'}`;
  const visibleLedgerCountLabel = `${filteredLedgerEntries.length} ledger entr${filteredLedgerEntries.length === 1 ? 'y' : 'ies'}`;
  const visibleSummaryLabel = filteredPayableEntries.length > PAYABLE_CARD_LIMIT
    ? `Showing ${visiblePayables.length} of ${filteredPayableEntries.length} due items`
    : visiblePayableCountLabel;
  const quickViewDescription = quickView === 'recent'
    ? `Last ${RECENT_LEDGER_DAY_WINDOW} days`
    : quickView === 'due'
      ? overdueCount
        ? `${overdueCount} overdue`
        : 'Focus due work'
      : 'All suppliers';
  const ledgerGroups = useMemo(() => {
    const groups = [];

    filteredLedgerEntries.forEach((entry) => {
      const label = formatLedgerDate(entry.created_at || entry.transaction_date || entry.date || Date.now());
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
  }, [filteredLedgerEntries]);

  return (
    <section className="purchase-section-shell purchase-payments-section">
      <div className="purchase-section-header purchase-payments-header">
        <div className="purchase-payments-title-block">
          <h2>Payments & Ledger</h2>
          <p>Track supplier payables, post payments, and scan running balances from one compact control bar.</p>
        </div>

        <div className="purchase-payments-control-bar">
          <div className="purchase-payments-control-left">
            <label className="purchase-payments-filter-shell" htmlFor="purchase-payments-filter-distributor">
              <Search size={14} />
              <select
                id="purchase-payments-filter-distributor"
                name="distributor_id"
                value={filters.distributor_id}
                onChange={onFilterChange}
                aria-label="Filter payments by supplier"
              >
                <option value="">All Suppliers</option>
                {supplierFilterOptions.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
            </label>

            <div className="purchase-payments-quick-filters" role="toolbar" aria-label="Payments quick views">
              {QUICK_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`purchase-payments-quick-filter${quickView === option.value ? ' is-active' : ''}`}
                  onClick={() => setQuickView(option.value)}
                  aria-pressed={quickView === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <span className="purchase-payments-control-note">
              {filters.distributor_id ? (selectedSupplierFilterLabel || 'Filtered supplier') : quickViewDescription}
            </span>
          </div>

          <div className="purchase-payments-control-right">
            {overdueCount ? (
              <span className="purchase-payments-inline-pill purchase-payments-inline-pill--warning">
                <AlertTriangle size={14} />
                {overdueCount} overdue
              </span>
            ) : null}
            <button
              type="button"
              className="admin-btn primary purchase-payments-entry-btn"
              onClick={onOpenLedgerForm}
              aria-label="Open payment or credit entry"
            >
              <Plus size={16} /> Add Entry
            </button>
          </div>
        </div>
      </div>

      <div className="purchase-payments-overview">
        <div className="purchase-payments-balance-card purchase-payments-balance-card--primary">
          <span className="purchase-payments-balance-kicker">
            <Wallet size={14} />
            {payableLabel}
          </span>
          <strong className="purchase-payments-balance-value">{formatCurrency(totalPayable)}</strong>
          <div className="purchase-payments-balance-meta">
            <span>{payableCountLabel}</span>
            <span>{overdueCount ? `${overdueCount} overdue` : 'Nothing overdue right now'}</span>
          </div>
        </div>

        <div className="purchase-payments-balance-card purchase-payments-balance-card--secondary">
          <span className="purchase-payments-balance-kicker">
            <ArrowUpDown size={14} />
            {ledgerBalanceSummary.label}
          </span>
          <strong className={`purchase-payments-balance-value purchase-payments-balance-value--ledger ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(ledgerBalanceSummary.value)}
          </strong>
          <div className="purchase-payments-balance-meta">
            <span>{visibleLedgerCountLabel}</span>
            <span>{filters.distributor_id ? (selectedSupplierFilterLabel || 'Filtered to one supplier') : quickViewDescription}</span>
          </div>
        </div>
      </div>

      <div className="purchase-payables-shell">
        <div className="purchase-payables-heading">
          <div>
            <h3>Due suppliers</h3>
            <p>{visibleSummaryLabel}</p>
          </div>
        </div>

        <div className="purchase-payables-grid">
          {visiblePayables.map((entry) => {
            const balanceDue = toNumber(entry?.balance_due);
            const overdueDays = toNumber(entry?.overdue_days);
            const isOverdue = overdueDays > 0;
            const supplierDisplayName = getSupplierDisplayName(entry);

            return (
              <div
                key={`payments-payable-${entry.order_id}`}
                className={`purchase-payable-card${isOverdue ? ' is-overdue' : ''}`}
              >
                <div className="purchase-payable-card-head">
                  <div className="purchase-payable-card-identity">
                    <strong title={supplierDisplayName}>{supplierDisplayName}</strong>
                    <span title={entry.po_number}>{entry.po_number || 'Manual payable'}</span>
                  </div>
                  <b>{formatCurrency(balanceDue)}</b>
                </div>

                <div className="purchase-payable-card-foot">
                  <small className="purchase-payable-card-meta">
                    <Clock size={12} />
                    <span>{entry.payment_due_date || 'No due date'}</span>
                    {isOverdue ? <em>{overdueDays}d overdue</em> : null}
                  </small>

                  <button
                    type="button"
                    className="purchase-payable-action"
                    onClick={() => onOpenPayable(entry.order_id)}
                    aria-label={`Record payment for ${supplierDisplayName}`}
                  >
                    <Wallet size={14} />
                    <span>Pay</span>
                  </button>
                </div>
              </div>
            );
          })}

          {!filteredPayableEntries.length ? (
            <div className="purchase-ops-empty">
              {quickView === 'due' ? 'No overdue supplier payables match this view right now.' : 'No supplier payables are due right now.'}
            </div>
          ) : null}
        </div>
      </div>

      <div className="purchase-ledger-shell">
        <div className="actions-bar ledger-header purchase-ledger-header">
          <div className="purchase-ledger-header-copy">
            <h2>Supplier payment ledger</h2>
            <p>Compact running history grouped by day, with payment method icons and only the smallest inline refs.</p>
          </div>
        </div>

        <div className="purchase-ledger-list">
          {ledgerLoading ? (
            <div className="purchase-empty-state-card purchase-empty-state-card--muted purchase-ledger-empty-card">
              <strong>Loading ledger records...</strong>
              <p>Pulling payment and credit entries for the selected suppliers.</p>
            </div>
          ) : filteredLedgerEntries.length === 0 ? (
            <div className="purchase-empty-state-card purchase-ledger-empty-card">
              <strong>No supplier payment or credit records match this view yet.</strong>
              <p>Switch the quick view or add a payment or manual credit entry to start the ledger.</p>
              <button type="button" className="admin-btn primary" onClick={onOpenLedgerForm}>
                <Plus size={18} /> Add Payment / Credit
              </button>
            </div>
          ) : (
            ledgerGroups.map((group) => (
              <section key={group.key} className="purchase-ledger-group">
                <div className="purchase-ledger-group-head">{group.label}</div>
                <div className="purchase-ledger-group-items">
                  {group.items.map((entry, index) => {
                    const typeLabel = getLedgerTypeLabel(entry);
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
          )}
        </div>
      </div>
    </section>
  );
};

export default PurchasePaymentsSection;
