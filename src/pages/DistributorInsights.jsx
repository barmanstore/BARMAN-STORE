import { useEffect, useMemo, useState } from 'react';
import { insightsApi } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import './Insights.css';

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(1)}%`;
};

const DistributorInsights = () => {
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
  });
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDistributorId, setSelectedDistributorId] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadInsights = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
        const data = await insightsApi.getDistributors(params);
        if (cancelled) return;
        setInsights(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load distributor insights');
          setInsights([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const filteredInsights = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    if (!term) return insights;
    return insights.filter((row) => String(row.distributor_name || '').toLowerCase().includes(term));
  }, [insights, search]);

  const loadProducts = async (distributorId) => {
    if (!distributorId) return;
    setSelectedDistributorId(distributorId);
    setProducts([]);
    setProductsError('');
    setProductsLoading(true);
    try {
      const data = await insightsApi.getDistributorProducts(distributorId);
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setProductsError(err?.message || 'Failed to load distributor products');
    } finally {
      setProductsLoading(false);
    }
  };

  const availabilityCoverage = useMemo(() => {
    if (!products.length) return null;
    const available = products.filter((row) => row.is_available !== false).length;
    return {
      total: products.length,
      available,
      pct: (available / products.length) * 100,
    };
  }, [products]);

  return (
    <div className="insights-page distributor-insights">
      <AdminPageHeader
        className="insights-header"
        title="Distributor Insights"
        subtitle="Compare landed costs, lead times, and delivery reliability across suppliers."
      />

      <div className="insights-card">
        <div className="filters-bar">
          <div className="filter-group">
            <label htmlFor="di-start">From</label>
            <input
              id="di-start"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="di-end">To</label>
            <input
              id="di-end"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="di-search">Search</label>
            <input
              id="di-search"
              type="search"
              placeholder="Distributor name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {loading && <div className="empty-state">Loading insights...</div>}
        {!loading && error && <div className="empty-state">{error}</div>}
        {!loading && !error && filteredInsights.length === 0 && (
          <div className="empty-state">No distributor insights found for the selected filters.</div>
        )}

        {!loading && !error && filteredInsights.length > 0 && (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th>Avg Cost</th>
                  <th>Min / Max</th>
                  <th>Lead Time</th>
                  <th>On-Time</th>
                  <th>Volatility</th>
                  <th>Coverage</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredInsights.map((row) => {
                  const isSelected = Number(selectedDistributorId || 0) === Number(row.distributor_id || 0);
                  return (
                    <tr key={row.distributor_id}>
                      <td>{row.distributor_name || '-'}</td>
                      <td>{row.avg_cost !== null ? formatCurrency(row.avg_cost) : '-'}</td>
                      <td>
                        <div>{row.min_cost !== null ? formatCurrency(row.min_cost) : '-'}</div>
                        <div>{row.max_cost !== null ? formatCurrency(row.max_cost) : '-'}</div>
                      </td>
                      <td>{row.avg_lead_time !== null ? `${row.avg_lead_time} days` : '-'}</td>
                      <td>{row.on_time_rate !== null ? formatPercent(row.on_time_rate * 100) : '-'}</td>
                      <td>{row.price_volatility !== null ? formatCurrency(row.price_volatility) : '-'}</td>
                      <td>{row.product_count || 0} items</td>
                      <td>
                        <button
                          type="button"
                          className={`admin-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => loadProducts(row.distributor_id)}
                        >
                          {isSelected ? 'Refreshing' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedDistributorId && (
          <div className="detail-panel">
            <div className="detail-header">
              <h3>Distributor Products</h3>
              {availabilityCoverage && (
                <span>
                  {availabilityCoverage.available}/{availabilityCoverage.total} available ({formatPercent(availabilityCoverage.pct)})
                </span>
              )}
            </div>
            {productsLoading && <div className="empty-state">Loading products...</div>}
            {!productsLoading && productsError && <div className="empty-state">{productsError}</div>}
            {!productsLoading && !productsError && products.length === 0 && (
              <div className="empty-state">No products found for this distributor.</div>
            )}
            {!productsLoading && !productsError && products.length > 0 && (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Avg Cost</th>
                      <th>Min / Max</th>
                      <th>Last Purchase</th>
                      <th>Availability</th>
                      <th>Lead Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((row) => (
                      <tr key={row.product_id}>
                        <td>
                          <strong>{row.product_name}</strong>
                          <div>{row.category || '-'}</div>
                        </td>
                        <td>{row.avg_cost !== null ? formatCurrency(row.avg_cost) : '-'}</td>
                        <td>
                          <div>{row.min_cost !== null ? formatCurrency(row.min_cost) : '-'}</div>
                          <div>{row.max_cost !== null ? formatCurrency(row.max_cost) : '-'}</div>
                        </td>
                        <td>{row.last_purchase_at ? formatDate(row.last_purchase_at) : '-'}</td>
                        <td>{row.is_available === null ? '-' : (row.is_available ? 'Available' : 'Unavailable')}</td>
                        <td>{row.lead_time_days !== null && row.lead_time_days !== undefined ? `${row.lead_time_days} days` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DistributorInsights;
