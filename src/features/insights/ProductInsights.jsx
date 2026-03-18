import { useEffect, useMemo, useState } from 'react';
import { insightsApi, distributorsApi, categoriesApi } from '../../shared/services/api';
import SignedCurrency from '../../shared/components/SignedCurrency';
import { formatCurrency, formatDate, getSignedCurrencyClassName } from '../../shared/utils/formatters';
import AdminPageHeader from '../admin/components/AdminPageHeader';
import './Insights.css';

const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(1)}%`;
};

const Sparkline = ({ values = [] }) => {
  const points = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!points.length) {
    return <span className="sparkline-empty">-</span>;
  }

  const width = 84;
  const height = 24;
  const padding = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? (width - (padding * 2)) / (points.length - 1) : 0;

  const polyline = points.map((value, index) => {
    const x = padding + (step * index);
    const y = height - padding - ((value - min) / range) * (height - (padding * 2));
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={polyline} />
    </svg>
  );
};

const ProductInsights = () => {
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    distributor_id: '',
    category: '',
  });
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadOptions = async () => {
      try {
        const [distRows, categoryRows] = await Promise.all([
          distributorsApi.getAll(),
          categoriesApi.getAll(),
        ]);
        if (cancelled) return;
        setDistributors(Array.isArray(distRows) ? distRows : []);
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
      } catch (_) {
        if (!cancelled) {
          setDistributors([]);
          setCategories([]);
        }
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInsights = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
        if (filters.distributor_id) params.distributor_id = filters.distributor_id;
        if (filters.category) params.category = filters.category;
        const data = await insightsApi.getProducts(params);
        if (cancelled) return;
        setInsights(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load insights');
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
    return insights.filter((row) => String(row.product_name || '').toLowerCase().includes(term));
  }, [insights, search]);

  const loadDetail = async (productId) => {
    if (!productId) return;
    setSelectedProductId(productId);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const data = await insightsApi.getProductById(productId);
      setDetail(data);
    } catch (err) {
      setDetailError(err?.message || 'Failed to load product details');
    } finally {
      setDetailLoading(false);
    }
  };

  const renderRisk = (risk) => {
    const label = String(risk || 'unknown').toLowerCase();
    return (
      <span className={`risk-pill ${label}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="insights-page product-insights">
      <AdminPageHeader
        className="insights-header"
        title="Product Insights"
        subtitle="Track landed costs, volatility, availability, and supplier performance."
      />

      <div className="insights-card">
        <div className="filters-bar">
          <div className="filter-group">
            <label htmlFor="pi-start">From</label>
            <input
              id="pi-start"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="pi-end">To</label>
            <input
              id="pi-end"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="pi-distributor">Distributor</label>
            <select
              id="pi-distributor"
              value={filters.distributor_id}
              onChange={(event) => setFilters((prev) => ({ ...prev, distributor_id: event.target.value }))}
            >
              <option value="">All</option>
              {distributors.map((dist) => (
                <option key={dist.id} value={dist.id}>{dist.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="pi-category">Category</label>
            <select
              id="pi-category"
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            >
              <option value="">All</option>
              {categories.map((cat) => (
                <option key={cat.id || cat.name} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="pi-search">Search</label>
            <input
              id="pi-search"
              type="search"
              placeholder="Product name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {loading && <div className="empty-state">Loading insights...</div>}
        {!loading && error && <div className="empty-state">{error}</div>}
        {!loading && !error && filteredInsights.length === 0 && (
          <div className="empty-state">No product insights found for the selected filters.</div>
        )}

        {!loading && !error && filteredInsights.length > 0 && (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Latest Cost</th>
                  <th>Selling / Margin</th>
                  <th>Change</th>
                  <th>Min / Avg / Max</th>
                  <th>Frequency</th>
                  <th>Best Distributor</th>
                  <th>Volatility</th>
                  <th>Risk</th>
                  <th>Trend</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredInsights.map((row) => {
                  const changeClass = getSignedCurrencyClassName(row.cost_change || 0);
                  const marginClass = getSignedCurrencyClassName(row.margin_amount || 0);
                  const isSelected = Number(selectedProductId || 0) === Number(row.product_id || 0);
                  return (
                    <tr key={row.product_id}>
                      <td>
                        <strong>{row.product_name}</strong>
                        <div>{row.category || '-'}</div>
                      </td>
                      <td>{row.latest_cost !== null ? formatCurrency(row.latest_cost) : '-'}</td>
                    <td className={marginClass}>
                      <div>{row.price != null ? formatCurrency(row.price) : (row.mrp != null ? formatCurrency(row.mrp) : '-')}</div>
                      <div>
                        {row.margin_amount != null ? <SignedCurrency amount={row.margin_amount} /> : '-'}
                        {' '}
                        {row.margin_pct != null ? `(${row.margin_pct.toFixed(1)}%)` : ''}
                      </div>
                    </td>
                      <td className={changeClass}>
                        {row.cost_change !== null ? <SignedCurrency amount={row.cost_change} /> : '-'}
                        <div>{row.cost_change_pct !== null ? formatPercent(row.cost_change_pct) : '-'}</div>
                      </td>
                      <td>
                        <div>{row.min_cost !== null ? formatCurrency(row.min_cost) : '-'}</div>
                        <div>{row.avg_cost !== null ? formatCurrency(row.avg_cost) : '-'}</div>
                        <div>{row.max_cost !== null ? formatCurrency(row.max_cost) : '-'}</div>
                      </td>
                      <td>
                        {row.avg_days_between !== null ? `${row.avg_days_between} days` : '-'}
                        <div>{row.purchase_count || 0} buys</div>
                      </td>
                      <td>
                        <div>{row.best_distributor_name || '-'}</div>
                        <div>{row.best_distributor_avg_cost !== null ? formatCurrency(row.best_distributor_avg_cost) : '-'}</div>
                      </td>
                      <td>{row.price_volatility !== null ? formatCurrency(row.price_volatility) : '-'}</td>
                      <td>{renderRisk(row.stockout_risk)}</td>
                      <td className="sparkline">
                        <Sparkline values={row.cost_series} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => loadDetail(row.product_id)}
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

        {selectedProductId && (
          <div className="detail-panel">
            <div className="detail-header">
              <h3>Product Detail</h3>
              {detail?.product?.name && <span>{detail.product.name}</span>}
            </div>
            {detailLoading && <div className="empty-state">Loading product details...</div>}
            {!detailLoading && detailError && <div className="empty-state">{detailError}</div>}
            {!detailLoading && !detailError && detail && (
              <>
                <div className="detail-grid">
                  <div className="detail-metric">
                    <span>Latest Cost</span>
                    <strong>{detail.latest_cost !== null ? formatCurrency(detail.latest_cost) : '-'}</strong>
                  </div>
                  <div className="detail-metric">
                    <span>Cost Change</span>
                    <strong>
                      {detail.cost_change !== null ? <SignedCurrency amount={detail.cost_change} /> : '-'}
                    </strong>
                  </div>
                  <div className="detail-metric">
                    <span>Avg Days Between</span>
                    <strong>{detail.avg_days_between !== null ? `${detail.avg_days_between} days` : '-'}</strong>
                  </div>
                  <div className="detail-metric">
                    <span>Avg Lead Time</span>
                    <strong>{detail.avg_lead_time !== null ? `${detail.avg_lead_time} days` : '-'}</strong>
                  </div>
                  <div className="detail-metric">
                    <span>On-Time Rate</span>
                    <strong>{detail.on_time_rate !== null ? formatPercent(detail.on_time_rate * 100) : '-'}</strong>
                  </div>
                  <div className="detail-metric">
                    <span>Volatility</span>
                    <strong>{detail.price_volatility !== null ? formatCurrency(detail.price_volatility) : '-'}</strong>
                  </div>
                </div>

                <div className="data-table" style={{ marginTop: '12px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Distributor</th>
                        <th>Avg Cost</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>Last Purchase</th>
                        <th>Availability</th>
                        <th>Lead Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.distributors || []).map((row) => (
                        <tr key={row.distributor_id}>
                          <td>{row.distributor_name || '-'}</td>
                          <td>{row.avg_cost !== null ? formatCurrency(row.avg_cost) : '-'}</td>
                          <td>{row.min_cost !== null ? formatCurrency(row.min_cost) : '-'}</td>
                          <td>{row.max_cost !== null ? formatCurrency(row.max_cost) : '-'}</td>
                          <td>{row.last_purchase_at ? formatDate(row.last_purchase_at) : '-'}</td>
                          <td>{row.is_available === null ? '-' : (row.is_available ? 'Available' : 'Unavailable')}</td>
                          <td>{row.lead_time_days !== null && row.lead_time_days !== undefined ? `${row.lead_time_days} days` : '-'}</td>
                        </tr>
                      ))}
                      {(!detail.distributors || detail.distributors.length === 0) && (
                        <tr>
                          <td colSpan={7}>No distributor history yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductInsights;

