import { useState, useEffect } from 'react';
import { Search, Filter, Download, RefreshCw, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { stockLedgerApi, productsApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import './StockLedgerHistory.css';

function StockLedgerHistory({ user }) {
  const [ledger, setLedger] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    product_id: '',
    transaction_type: '',
    start_date: '',
    end_date: ''
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchLedger();
  }, [filters]);

  const fetchProducts = async () => {
    try {
      const data = await productsApi.getAll();
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

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

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({
      product_id: '',
      transaction_type: '',
      start_date: '',
      end_date: ''
    });
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'PURCHASE':
        return <ArrowDown size={16} className="icon purchase" />;
      case 'SALE':
        return <ArrowUp size={16} className="icon sale" />;
      case 'RETURN':
        return <RefreshCw size={16} className="icon return" />;
      case 'PURCHASE_RETURN':
        return <ArrowUp size={16} className="icon purchase-return" />;
      case 'ADJUSTMENT':
        return <Minus size={16} className="icon adjustment" />;
      case 'EXCHANGE_IN':
        return <ArrowDown size={16} className="icon exchange-in" />;
      case 'EXCHANGE_OUT':
        return <ArrowUp size={16} className="icon exchange-out" />;
      default:
        return <Minus size={16} className="icon default" />;
    }
  };

  const getTransactionBadge = (type) => {
    const config = {
      PURCHASE: { label: 'Purchase', class: 'purchase' },
      SALE: { label: 'Sale', class: 'sale' },
      RETURN: { label: 'Return', class: 'return' },
      PURCHASE_RETURN: { label: 'Purchase Return', class: 'purchase-return' },
      ADJUSTMENT: { label: 'Adjustment', class: 'adjustment' },
      EXCHANGE_IN: { label: 'Exchange In', class: 'exchange-in' },
      EXCHANGE_OUT: { label: 'Exchange Out', class: 'exchange-out' }
    };
    const c = config[type] || { label: type, class: '' };
    return <span className={`type-badge ${c.class}`}>{c.label}</span>;
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
      <div className="page-header">
        <h1>Stock Ledger History</h1>
        <button className="admin-btn" onClick={fetchLedger}>
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-row">
          <div className="filter-group">
            <label>Product:</label>
            <select name="product_id" value={filters.product_id} onChange={handleFilterChange}>
              <option value="">All Products</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Transaction Type:</label>
            <select name="transaction_type" value={filters.transaction_type} onChange={handleFilterChange}>
              {transactionTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>From:</label>
            <input
              type="date"
              name="start_date"
              value={filters.start_date}
              onChange={handleFilterChange}
            />
          </div>

          <div className="filter-group">
            <label>To:</label>
            <input
              type="date"
              name="end_date"
              value={filters.end_date}
              onChange={handleFilterChange}
            />
          </div>

          <button className="reset-btn" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <span className="stat-value">{ledger.length}</span>
          <span className="stat-label">Total Transactions</span>
        </div>
        <div className="stat-card purchase">
          <span className="stat-value">
            {ledger.filter(l => l.transaction_type === 'PURCHASE').length}
          </span>
          <span className="stat-label">Purchases</span>
        </div>
        <div className="stat-card sale">
          <span className="stat-value">
            {ledger.filter(l => l.transaction_type === 'SALE').length}
          </span>
          <span className="stat-label">Sales</span>
        </div>
        <div className="stat-card return">
          <span className="stat-value">
            {ledger.filter(l => l.transaction_type === 'RETURN').length}
          </span>
          <span className="stat-label">Returns</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="ledger-table-container">
        {loading ? (
          <div className="loading">Loading stock ledger...</div>
        ) : ledger.length === 0 ? (
          <div className="empty-state">
            <p>No stock transactions found.</p>
            <p>Transactions will appear here when inventory changes occur.</p>
          </div>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Product</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Previous</th>
                <th>New Balance</th>
                <th>Reference</th>
                <th>By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(entry => (
                <tr key={entry.id}>
                  <td className="date-cell">
                    {new Date(entry.created_at).toLocaleDateString()}
                    <span className="time">
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="product-cell">
                    <span className="product-name">{entry.product_name}</span>
                    <span className="product-sku">{entry.sku}</span>
                  </td>
                  <td>
                    {getTransactionIcon(entry.transaction_type)}
                    {getTransactionBadge(entry.transaction_type)}
                  </td>
                  <td className="qty-cell">
                    <span className={entry.quantity_change >= 0 ? 'positive' : 'negative'}>
                      {entry.quantity_change >= 0 ? '+' : ''}{entry.quantity_change}
                    </span>
                  </td>
                  <td>{entry.previous_balance}</td>
                  <td><strong>{entry.new_balance}</strong></td>
                  <td className="ref-cell">
                    {entry.reference_id && (
                      <span className="reference">{entry.reference_type}: {entry.reference_id}</span>
                    )}
                  </td>
                  <td>{entry.user_name || '-'}</td>
                  <td className="notes-cell">{entry.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default StockLedgerHistory;
