import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { createClientRequestId, creditApi, usersApi } from '../../../shared/services/api';
import { formatCurrency, truncateUserName } from '../../../shared/utils/formatters';
import { getTodayDate } from '../../../shared/utils/dateTime';
import { getLedgerEntryTimestamp, getLedgerTypeLabel, getSignedLedgerAmount, toNumber } from '../../../shared/utils/ledger';
import CalculatedAmountInput from '../../../shared/components/CalculatedAmountInput';
import WindowModal from '../../../shared/components/window/WindowModal';
import useCreditKhataLedgerForm from './hooks/useCreditKhataLedgerForm';
import './CreditKhata.css';

const getRecordDate = (entry) => getLedgerEntryTimestamp(entry, ['transaction_ts', 'transactionTs', 'transaction_date', 'created_at', 'date']);
const getRecordDateLabel = (entry) => new Date(getRecordDate(entry)).toLocaleDateString();
const isLedgerEntryEdited = (entry) => Number(entry?.edited || 0) === 1 || !!entry?.edited_at;

const getDefaultFormData = () => ({
  user_id: '',
  type: 'payment',
  amount: '',
  transactionDate: getTodayDate(),
  reference: '',
  description: ''
});


function CreditKhata({ user }) {
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [filters, setFilters] = useState({ user_id: '' });
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerFormData, setLedgerFormData] = useState(getDefaultFormData());
  const [editingLedgerEntryId, setEditingLedgerEntryId] = useState(null);
  const [ledgerSubmitting, setLedgerSubmitting] = useState(false);
  const ledgerSubmitLockRef = useRef(false);
  const ledgerRequestIdRef = useRef('');

  const usersById = useMemo(() => {
    const map = {};
    users.forEach((row) => {
      map[String(row.id)] = row;
    });
    return map;
  }, [users]);

  const fetchUsers = async () => {
    const allUsers = await usersApi.getAll();
    const customers = (allUsers || []).filter((row) => row.role !== 'admin');
    setUsers(customers);
    return customers;
  };

  const fetchLedger = async (selectedUserId, customerRows = users) => {
    setLedgerLoading(true);
    setError('');
    try {
      let merged = [];
      try {
        merged = await creditApi.getLedger(selectedUserId || '');
      } catch (err) {
        const errMsg = String(err?.message || '').toLowerCase();
        const isMissingLedgerEndpoint =
          errMsg.includes('not found') ||
          errMsg.includes('cannot get') ||
          errMsg.includes('not available');
        if (!isMissingLedgerEndpoint) throw err;

        // Backward-compatible fallback for older backend versions without /api/credit/ledger.
        const sourceUsers = selectedUserId
          ? customerRows.filter((row) => String(row.id) === String(selectedUserId))
          : customerRows;

        const responses = await Promise.all(
          sourceUsers.map(async (customer) => {
            const rows = await creditApi.getHistory(customer.id);
            return (rows || []).map((entry) => ({
              ...entry,
              user_id: entry.user_id ?? customer.id,
              customer_name: entry.customer_name || customer.name
            }));
          })
        );
        merged = responses.flat();
      }

      const runningBalanceByUser = {};
      const chronological = [...(merged || [])].sort((a, b) => {
        const dateDiff = getRecordDate(a) - getRecordDate(b);
        if (dateDiff !== 0) return dateDiff;
        return Number(a.id || 0) - Number(b.id || 0);
      });
      const withBalances = chronological.map((entry) => {
        const userKey = String(entry.user_id || 'unknown');
        const previous = runningBalanceByUser[userKey] || 0;
        const next = previous + getSignedLedgerAmount(entry);
        runningBalanceByUser[userKey] = next;
        return {
          ...entry,
          computed_balance: next
        };
      });

      setLedgerRecords(withBalances.sort((a, b) => {
        const dateDiff = getRecordDate(b) - getRecordDate(a);
        if (dateDiff !== 0) return dateDiff;
        return Number(b.id || 0) - Number(a.id || 0);
      }));
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      setError(err.message || 'Failed to load credit khata ledger');
      setLedgerRecords([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      setError('');
      try {
        await fetchUsers();
      } catch (err) {
        if (err?.status === 401) {
          localStorage.removeItem('user');
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

  const handleFilterChange = (e) => {
    setFilters({ user_id: e.target.value });
  };

  const {
    handleOpenLedgerForm,
    handleOpenLedgerEdit,
    closeLedgerForm,
    handleLedgerSubmit,
  } = useCreditKhataLedgerForm({
    getDefaultFormData,
    setShowLedgerForm,
    setEditingLedgerEntryId,
    setLedgerFormData,
    setLedgerSubmitting,
    ledgerSubmitLockRef,
    ledgerRequestIdRef,
    setError,
    ledgerSubmitting,
    ledgerFormData,
    editingLedgerEntryId,
    user,
    creditApi,
    createClientRequestId,
    fetchLedger,
    filters,
    users,
  });

  const ledgerBalanceSummary = useMemo(() => {
    const balanceByUser = {};
    for (const entry of ledgerRecords) {
      const userKey = String(entry.user_id || 'unknown');
      if (balanceByUser[userKey] === undefined) {
        balanceByUser[userKey] = toNumber(entry.computed_balance ?? entry.balance);
      }
    }

    if (filters.user_id) {
      return {
        label: 'Customer Balance',
        value: toNumber(balanceByUser[String(filters.user_id)] || 0)
      };
    }

    return {
      label: 'Total Balance (All Customers)',
      value: Object.values(balanceByUser).reduce((sum, value) => sum + toNumber(value), 0)
    };
  }, [filters.user_id, ledgerRecords]);

  const latestEntryIdByUser = useMemo(() => {
    const map = {};
    for (const entry of ledgerRecords) {
      const userKey = String(entry.user_id || '');
      if (!userKey || map[userKey]) continue;
      map[userKey] = Number(entry.id || 0);
    }
    return map;
  }, [ledgerRecords]);

  if (loading) {
    return (
      <div className="credit-khata">
        <div className="loading">Loading credit khata...</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="credit-khata">
        <div className="error-message">Only administrators can access Credit Khata.</div>
      </div>
    );
  }

  return (
    <div className="credit-khata purchase-management">
      {error && <div className="error-message">{error}</div>}

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="filter-user-id">Customer:</label>
          <select 
            id="filter-user-id"
            name="user_id" 
            value={filters.user_id} 
            onChange={handleFilterChange}
          >
            <option value="">All Customers</option>
            {users.map((customer) => (
              <option key={customer.id} value={customer.id}>{truncateUserName(customer.name, 15)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions-bar ledger-header">
        <h2>Customer Credit / Payment Ledger</h2>
        <div className="action-buttons">
          <button className="admin-btn primary" onClick={handleOpenLedgerForm}>
            <Plus size={18} /> Payment / Credit Entry
          </button>
        </div>
      </div>

      <div className="ledger-balance-summary">
        <span className="ledger-balance-label">{ledgerBalanceSummary.label}</span>
        <strong className={`ledger-balance-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
          {formatCurrency(ledgerBalanceSummary.value)}
        </strong>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Reference</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ledgerLoading ? (
              <tr>
                <td colSpan="9" className="empty-state">Loading ledger records...</td>
              </tr>
            ) : ledgerRecords.length === 0 ? (
              <tr>
                <td colSpan="9" className="empty-state">No customer payment/credit records found</td>
              </tr>
            ) : (
              ledgerRecords.map((entry, index) => {
                const userKey = String(entry.user_id || '');
                const isLatestForCustomer = Number(entry.id || 0) > 0 && Number(entry.id || 0) === Number(latestEntryIdByUser[userKey] || 0);
                return (
                  <tr key={entry.id || index}>
                    <td>{getRecordDateLabel(entry)}</td>
                    <td>{truncateUserName(usersById[userKey]?.name || entry.customer_name || '-', 15)}</td>
                    <td>{getLedgerTypeLabel(entry)}</td>
                    <td>{formatCurrency(toNumber(entry.amount))}</td>
                    <td>{formatCurrency(toNumber(entry.computed_balance ?? entry.balance))}</td>
                    <td>{entry.reference || entry.invoice_number || '-'}</td>
                    <td>{entry.description || '-'}</td>
                    <td>{isLedgerEntryEdited(entry) ? 'EDITED' : '-'}</td>
                    <td>
                      {isLatestForCustomer ? (
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={() => handleOpenLedgerEdit(entry)}
                          title="Only latest transaction for this customer can be edited"
                        >
                          Edit
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showLedgerForm && (
        <WindowModal
          open
          title={editingLedgerEntryId ? 'Edit Latest Customer Transaction' : 'Add Customer Payment / Credit'}
          onClose={closeLedgerForm}
          dismissible={!ledgerSubmitting}
          dialogClassName="modal-content"
          themeClassName="credit-khata"
          contentClassName="window-modal-body-padded"
          initialSize={{ width: 640, height: 560 }}
        >
            <form onSubmit={handleLedgerSubmit}>
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
                    {users.map((customer) => (
                      <option key={customer.id} value={customer.id}>{truncateUserName(customer.name, 15)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="ledger-type">Type *</label>
                  <select
                    id="ledger-type"
                    name="type"
                    value={ledgerFormData.type}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="payment">Payment (Reduce due)</option>
                    <option value="given">Credit (Increase due)</option>
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
                    placeholder="Enter amount or expression like (5+7)*100/35+56-25"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ledger-transaction-date">Transaction Date</label>
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
                  <label htmlFor="ledger-description">Description *</label>
                  <input
                    type="text"
                    id="ledger-description"
                    name="description"
                    value={ledgerFormData.description}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter description"
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeLedgerForm} disabled={ledgerSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={ledgerSubmitting}>
                  {ledgerSubmitting ? 'Saving...' : (editingLedgerEntryId ? 'Update Entry' : 'Save Entry')}
                </button>
              </div>
            </form>
        </WindowModal>
      )}
    </div>
  );
}

export default CreditKhata;

