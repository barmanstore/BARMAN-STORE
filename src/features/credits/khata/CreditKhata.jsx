import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { createClientRequestId, creditApi, usersApi } from '../../../services/api';
import { formatCurrency, truncateUserName } from '../../../utils/formatters';
import { getTodayDate } from '../../../utils/dateTime';
import { getLedgerEntryTimestamp, getLedgerTypeLabel, getSignedLedgerAmount, toNumber } from '../../../utils/ledger';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
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

const tokenizeMathExpression = (raw) => {
  const value = String(raw || '').replace(/,/g, '').trim();
  if (!value) return [];
  if (!/^[\d+\-*/().\s]+$/.test(value)) {
    throw new Error('Only numbers and + - * / ( ) are allowed');
  }
  const tokens = [];
  const compact = value.replace(/\s+/g, '');
  let i = 0;
  while (i < compact.length) {
    const ch = compact[i];
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < compact.length && /[\d.]/.test(compact[j])) j += 1;
      const numText = compact.slice(i, j);
      if (!/^\d*\.?\d+$/.test(numText)) throw new Error('Invalid number format');
      const num = Number(numText);
      if (!Number.isFinite(num)) throw new Error('Invalid number');
      tokens.push(num);
      i = j;
      continue;
    }
    throw new Error('Invalid expression');
  }
  return tokens;
};

const evaluateMathExpression = (raw) => {
  const tokens = tokenizeMathExpression(raw);
  if (!tokens.length) return { valid: false, value: 0, message: '' };
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const output = [];
  const ops = [];
  tokens.forEach((token) => {
    if (typeof token === 'number') {
      output.push(token);
      return;
    }
    if (token === '(') {
      ops.push(token);
      return;
    }
    if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop());
      if (ops.pop() !== '(') throw new Error('Mismatched parentheses');
      return;
    }
    while (ops.length && prec[ops[ops.length - 1]] >= prec[token]) output.push(ops.pop());
    ops.push(token);
  });
  while (ops.length) {
    const op = ops.pop();
    if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
    output.push(op);
  }
  const stack = [];
  output.forEach((token) => {
    if (typeof token === 'number') {
      stack.push(token);
      return;
    }
    const b = Number(stack.pop());
    const a = Number(stack.pop());
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid expression');
    if (token === '+') stack.push(a + b);
    else if (token === '-') stack.push(a - b);
    else if (token === '*') stack.push(a * b);
    else if (token === '/') {
      if (b === 0) throw new Error('Cannot divide by zero');
      stack.push(a / b);
    }
  });
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('Invalid expression');
  return { valid: true, value: stack[0], message: '' };
};

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
  useLockBodyScroll(showLedgerForm);
  const amountPreview = useMemo(() => {
    try {
      return evaluateMathExpression(ledgerFormData.amount);
    } catch (error) {
      return { valid: false, value: 0, message: error.message || 'Invalid expression' };
    }
  }, [ledgerFormData.amount]);

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

  const handleOpenLedgerForm = () => {
    setError('');
    setEditingLedgerEntryId(null);
    setLedgerFormData({
      ...getDefaultFormData(),
      user_id: filters.user_id || ''
    });
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = createClientRequestId('credit');
    setShowLedgerForm(true);
  };

  const handleOpenLedgerEdit = (entry) => {
    setError('');
    setEditingLedgerEntryId(Number(entry.id || 0));
    setLedgerFormData({
      user_id: String(entry.user_id || ''),
      type: entry.type === 'payment' ? 'payment' : 'given',
      amount: String(toNumber(entry.amount || 0)),
      transactionDate: String(entry.transaction_date || '').slice(0, 10) || getTodayDate(),
      reference: entry.reference || '',
      description: entry.description || ''
    });
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
    setShowLedgerForm(true);
  };

  const closeLedgerForm = () => {
    setShowLedgerForm(false);
    setEditingLedgerEntryId(null);
    setLedgerFormData(getDefaultFormData());
    setLedgerSubmitting(false);
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    if (ledgerSubmitting || ledgerSubmitLockRef.current) return;
    ledgerSubmitLockRef.current = true;
    setError('');

    const amount = amountPreview.valid ? Number(amountPreview.value) : 0;
    if (!ledgerFormData.user_id) {
      ledgerSubmitLockRef.current = false;
      setError('Please select a customer');
      return;
    }
    if (!amountPreview.valid || amount <= 0) {
      ledgerSubmitLockRef.current = false;
      setError(amountPreview.message || 'Please enter a valid amount');
      return;
    }
    if (!ledgerFormData.description.trim()) {
      ledgerSubmitLockRef.current = false;
      setError('Please enter a description');
      return;
    }

    try {
      setLedgerSubmitting(true);
      if (editingLedgerEntryId) {
        await creditApi.updateTransaction(ledgerFormData.user_id, editingLedgerEntryId, {
          type: ledgerFormData.type,
          amount: Number(amount.toFixed(2)),
          reference: ledgerFormData.reference,
          description: ledgerFormData.description,
          transactionDate: ledgerFormData.transactionDate,
          edited_by: user?.id
        });
      } else {
        const clientRequestId = ledgerRequestIdRef.current || createClientRequestId('credit');
        ledgerRequestIdRef.current = clientRequestId;
        await creditApi.addTransaction(ledgerFormData.user_id, {
          type: ledgerFormData.type,
          amount: Number(amount.toFixed(2)),
          reference: ledgerFormData.reference,
          description: ledgerFormData.description,
          transactionDate: ledgerFormData.transactionDate,
          created_by: user?.id,
          client_request_id: clientRequestId
        });
      }
      closeLedgerForm();
      await fetchLedger(filters.user_id, users);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      setError(err.message || (editingLedgerEntryId ? 'Failed to edit ledger transaction' : 'Failed to add ledger transaction'));
    } finally {
      setLedgerSubmitting(false);
      ledgerSubmitLockRef.current = false;
    }
  };

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
        <div className="modal-overlay" onClick={closeLedgerForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingLedgerEntryId ? 'Edit Latest Customer Transaction' : 'Add Customer Payment / Credit'}</h2>
              <button className="close-btn" onClick={closeLedgerForm}>
                <X size={24} />
              </button>
            </div>
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
                  <input
                    type="text"
                    id="ledger-amount"
                    name="amount"
                    inputMode="decimal"
                    value={ledgerFormData.amount}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount or expression (example: 2+5)"
                    required
                  />
                  {String(ledgerFormData.amount || '').trim() ? (
                    <div className={`amount-live-result ${amountPreview.valid ? 'ok' : 'error'}`}>
                      {amountPreview.valid
                        ? `Result: ${Number(amountPreview.value).toFixed(2)}`
                        : `Result: ${amountPreview.message || 'Invalid expression'}`}
                    </div>
                  ) : null}
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
          </div>
        </div>
      )}
    </div>
  );
}

export default CreditKhata;
