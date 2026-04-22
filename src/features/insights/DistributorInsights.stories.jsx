import { useState } from 'react';
import DistributorInsights from './DistributorInsights';

export default {
  title: 'Features/DistributorInsights',
  component: DistributorInsights,
  parameters: {
    layout: 'fullscreen',
  },
};

// Mock data for stories
const MOCK_DISTRIBUTOR_INSIGHTS = [
  {
    distributor_id: 1,
    distributor_name: 'ACME Foods Ltd',
    purchase_count: 24,
    product_count: 18,
    avg_cost: 450.75,
    min_cost: 280.0,
    max_cost: 850.0,
    avg_lead_time: 3.5,
    on_time_rate: 0.96,
    price_volatility: 45.25,
  },
  {
    distributor_id: 2,
    distributor_name: 'Global Supply Co',
    purchase_count: 18,
    product_count: 12,
    avg_cost: 520.5,
    min_cost: 350.0,
    max_cost: 900.0,
    avg_lead_time: 5.2,
    on_time_rate: 0.88,
    price_volatility: 78.5,
  },
  {
    distributor_id: 3,
    distributor_name: 'Fresh Direct',
    purchase_count: 32,
    product_count: 22,
    avg_cost: 380.0,
    min_cost: 200.0,
    max_cost: 750.0,
    avg_lead_time: 2.8,
    on_time_rate: 0.98,
    price_volatility: 25.0,
  },
  {
    distributor_id: 4,
    distributor_name: 'Premium Imports',
    purchase_count: 8,
    product_count: 5,
    avg_cost: 1250.0,
    min_cost: 900.0,
    max_cost: 1600.0,
    avg_lead_time: 7.5,
    on_time_rate: 0.75,
    price_volatility: 150.0,
  },
];

const MOCK_PRODUCTS = [
  {
    product_id: 1,
    product_name: 'Organic Rice 5kg',
    sku: 'RICE-5KG',
    is_available: true,
    last_cost: 450.0,
  },
  {
    product_id: 2,
    product_name: 'Sunflower Oil 1L',
    sku: 'OIL-1L',
    is_available: true,
    last_cost: 120.0,
  },
  {
    product_id: 3,
    product_name: 'Wheat Flour 10kg',
    sku: 'FLOUR-10KG',
    is_available: true,
    last_cost: 380.0,
  },
];

/**
 * Default state with full data, filters available, and interactive controls
 */
export const Default = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh' }}>
      <DistributorInsights />
    </div>
  ),
};

/**
 * Loading state - showing skeleton or loading indicator
 */
export const Loading = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ padding: '2rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: '#fff', animation: 'pulse 2s infinite' }}>
          <div style={{ height: '2rem', background: '#e5e7eb', borderRadius: '0.5rem', marginBottom: '1rem', maxWidth: '400px' }} />
          <div style={{ height: '1rem', background: '#f3f4f6', borderRadius: '0.5rem', marginBottom: '2rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: '100px', background: '#f3f4f6', borderRadius: '0.5rem' }} />
            ))}
          </div>
          <div style={{ height: '300px', background: '#f3f4f6', borderRadius: '0.5rem' }} />
        </div>
      </div>
    </div>
  ),
};

/**
 * Empty state - no matching distributors after filter
 */
export const Empty = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: '#fff' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>No matching distributors</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '2rem' }}>
            Try adjusting your search or date filters to find distributors.
          </div>
          <button
            type="button"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-primary)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  ),
};

/**
 * Error state - API call failed
 */
export const Error = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ padding: '2rem', border: '2px solid #ef4444', borderRadius: 'var(--radius-lg)', background: '#fef2f2' }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.5rem' }}>
            ⚠️ Failed to load distributor insights
          </div>
          <div style={{ fontSize: '0.9rem', color: '#7f1d1d', marginBottom: '1.5rem' }}>
            Unable to fetch distributor data. Please check your connection and try again.
          </div>
          <button
            type="button"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #991b1b',
              background: '#fca5a5',
              color: '#991b1b',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  ),
};

/**
 * With Search Filter - showing filtered results by distributor name
 */
export const WithSearchFilter = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Search Results for "Fresh"</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Distributor</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600 }}>Purchases</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600 }}>Avg Cost</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600 }}>Lead Time</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.75rem' }}>Fresh Direct</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem' }}>32</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem' }}>₹380.00</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem' }}>2.8 days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * With Date Range Filter - showing insights for specific period
 */
export const WithDateRangeFilter = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.75rem 1rem', background: '#e0f2fe', borderRadius: 'var(--radius-md)', display: 'inline-block', fontSize: '0.9rem', fontWeight: 600 }}>
            ✓ Filtered: Date Last 30 Days
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>Total Distributors</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.5rem' }}>4</div>
          </div>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>High Risk</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.5rem', color: '#dc2626' }}>1</div>
          </div>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>Reliable (97%+)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.5rem', color: '#059669' }}>2</div>
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * High Risk Distributor - showing warning indicators
 */
export const HighRiskDistributor = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.5rem' }}>
              ▲ Premium Imports - High Risk
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Long lead time (7.5 days) and delayed delivery pattern (75% on-time rate)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>Avg Lead Time</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>7.5 days</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>On-Time Rate</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>75%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * Reliable Distributor - showing positive indicators
 */
export const ReliableDistributor = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
              ○ Fresh Direct - Reliable
            </div>
            <div style={{ color: '#15803d', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Excellent on-time delivery (98%), fast lead time (2.8 days), and stable pricing
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Lead Time</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>2.8 days</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>On-Time Rate</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>98%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Products</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>22</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * Multiple Active Filters - search + date range combined
 */
export const MultipleFiltersActive = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '1rem', fontWeight: 600, color: '#666' }}>Active Filters:</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ padding: '0.5rem 1rem', background: '#e0f2fe', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              Search: Fresh
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <div style={{ padding: '0.5rem 1rem', background: '#fef3c7', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              Date: Last 30 Days
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <button style={{ padding: '0.5rem 1rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)', cursor: 'pointer', color: '#666', fontSize: '0.9rem' }}>
              Clear All
            </button>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: '#999' }}>
          Showing filtered results: 1 of 4 distributors
        </div>
      </div>
    </div>
  ),
};

/**
 * Sorted by On-Time Rate - showing distribution by reliability
 */
export const SortedByReliability = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page distributor-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: '#666', fontWeight: 600 }}>
            Sorted by: On-Time Rate (Highest First)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', background: '#faf8f5' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: 600 }}>Distributor</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: 600 }}>On-Time %</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: 600 }}>Lead Time</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Fresh Direct', onTime: 98, leadTime: '2.8d', status: 'Reliable' },
                  { name: 'ACME Foods Ltd', onTime: 96, leadTime: '3.5d', status: 'Good' },
                  { name: 'Global Supply Co', onTime: 88, leadTime: '5.2d', status: 'Follow up' },
                  { name: 'Premium Imports', onTime: 75, leadTime: '7.5d', status: 'Delay watch' },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem' }}>{row.name}</td>
                    <td style={{ textAlign: 'right', padding: '1rem', fontWeight: 600 }}>{row.onTime}%</td>
                    <td style={{ textAlign: 'right', padding: '1rem' }}>{row.leadTime}</td>
                    <td style={{ textAlign: 'center', padding: '1rem' }}>
                      <span style={{ padding: '0.25rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, background: row.status === 'Reliable' ? '#dcfce7' : row.status === 'Good' ? '#dbeafe' : row.status === 'Follow up' ? '#fef3c7' : '#fee2e2', color: row.status === 'Reliable' ? '#166534' : row.status === 'Good' ? '#0c4a6e' : row.status === 'Follow up' ? '#92400e' : '#991b1b' }}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  ),
};
