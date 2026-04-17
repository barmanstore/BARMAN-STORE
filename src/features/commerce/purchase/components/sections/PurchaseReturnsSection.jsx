import { RotateCcw } from 'lucide-react';

const PurchaseReturnsSection = ({
  filters,
  distributors,
  onFilterChange,
  onOpenReturn,
  purchaseReturns,
  formatCurrency,
}) => (
  <section className="purchase-section-shell">
    <div className="purchase-section-header">
      <div>
        <h2>Purchase Returns</h2>
        <p>Review supplier returns and exchanges separately from active purchase orders.</p>
      </div>
      <div className="action-buttons">
        <button className="admin-btn primary" onClick={onOpenReturn}>
          <RotateCcw size={18} /> New Return / Exchange
        </button>
      </div>
    </div>

    <div className="filters-bar compact">
      <div className="filter-group">
        <label htmlFor="purchase-returns-filter-distributor">Distributor:</label>
        <select id="purchase-returns-filter-distributor" name="distributor_id" value={filters.distributor_id} onChange={onFilterChange}>
          <option value="">All Distributors</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
    </div>

    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>Return Number</th>
            <th>Distributor</th>
            <th>Type</th>
            <th>Items</th>
            <th>Total</th>
            <th>Reason</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {purchaseReturns.length === 0 ? (
            <tr>
              <td colSpan="7" className="empty-state">
                <div className="purchase-empty-state-card">
                  <strong>No purchase returns yet.</strong>
                  <p>Record supplier returns and exchanges here when stock needs to move back out.</p>
                  <button type="button" className="admin-btn primary" onClick={onOpenReturn}>
                    <RotateCcw size={18} /> New Return / Exchange
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            purchaseReturns.map((ret) => (
              <tr key={ret.id}>
                <td data-label="Return Number"><strong>{ret.return_number}</strong></td>
                <td data-label="Distributor">{ret.distributor_name}</td>
                <td data-label="Type">
                  <span className={`type-badge ${ret.return_type}`}>
                    {ret.return_type === 'exchange' ? 'Exchange' : 'Return'}
                  </span>
                </td>
                <td data-label="Items">{ret.items?.length || 0}</td>
                <td data-label="Total">{formatCurrency(ret.total)}</td>
                <td data-label="Reason">{ret.reason || '-'}</td>
                <td data-label="Date">{new Date(ret.created_at).toLocaleDateString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);

export default PurchaseReturnsSection;
