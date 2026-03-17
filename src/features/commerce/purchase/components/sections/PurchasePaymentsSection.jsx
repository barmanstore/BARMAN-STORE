import { useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  CheckCheck,
  Clock,
  DollarSign,
  Eye,
  MessageCircle,
  Package,
  Plus,
  RotateCcw,
  Sparkles,
  Truck,
  Wallet,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Trash2,
} from 'lucide-react';

const PurchasePaymentsSection = ({
  filters,
  distributors,
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
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-section-header">
      <div>
        <h2>Payments & Ledger</h2>
        <p>Track payable orders, register payments, and review distributor balance movement.</p>
      </div>
      <div className="action-buttons">
        <button className="admin-btn primary" onClick={onOpenLedgerForm}>
          <Plus size={18} /> New Ledger Entry
        </button>
      </div>
    </div>

    <div className="filters-bar compact">
      <div className="filter-group">
        <label>Distributor:</label>
        <select name="distributor_id" value={filters.distributor_id} onChange={onFilterChange}>
          <option value="">All Distributors</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
    </div>

    <div className="purchase-payables-shell">
      <div className="ledger-balance-summary">
        <span className="ledger-balance-label">{ledgerBalanceSummary.label}</span>
        <strong className={`ledger-balance-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
          {formatCurrency(ledgerBalanceSummary.value)}
        </strong>
      </div>
      <div className="purchase-payables-grid">
        {(payables || []).slice(0, 8).map((entry) => (
          <div key={`payments-payable-${entry.order_id}`} className="purchase-payable-card">
            <strong>{entry.distributor_name}</strong>
            <span>{entry.po_number}</span>
            <small>{entry.payment_due_date}{entry.overdue_days ? ` | ${entry.overdue_days} day overdue` : ''}</small>
            <div className="purchase-payable-card-foot">
              <b>{formatCurrency(toNumber(entry.balance_due))}</b>
              <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                Pay
              </button>
            </div>
          </div>
        ))}
        {!(payables || []).length ? <div className="purchase-ops-empty">No payable items due right now.</div> : null}
      </div>
    </div>

    <div className="actions-bar ledger-header">
      <h2>Distributor Credit / Payment Ledger</h2>
    </div>
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Distributor</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Balance</th>
            <th>Mode</th>
            <th>Reference</th>
            <th>Bill No</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {ledgerLoading ? (
            <tr>
              <td colSpan="9" className="empty-state">Loading ledger records...</td>
            </tr>
          ) : ledgerRecords.length === 0 ? (
            <tr>
              <td colSpan="9" className="empty-state">No distributor payment/credit records found</td>
            </tr>
          ) : (
            ledgerRecords.map((entry, index) => (
              <tr key={entry.id || index} className={getLedgerRowStatusClass(entry)}>
                <td data-label="Date">{new Date(entry.created_at || entry.transaction_date || Date.now()).toLocaleDateString()}</td>
                <td data-label="Distributor">{getDistributorName(entry)}</td>
                <td data-label="Type">{getLedgerTypeLabel(entry)}</td>
                <td data-label="Amount">{formatCurrency(toNumber(entry.amount))}</td>
                <td data-label="Balance">{getEntryDisplayBalance(entry) === null ? '-' : formatCurrency(getEntryDisplayBalance(entry))}</td>
                <td data-label="Mode">{entry.payment_mode || entry.method || '-'}</td>
                <td data-label="Reference">{entry.reference || entry.po_number || '-'}</td>
                <td data-label="Bill No">{getLedgerBillNumber(entry)}</td>
                <td data-label="Description">{entry.description || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);

export default PurchasePaymentsSection;
