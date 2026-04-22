import { useState } from 'react';
import ProductInsights from './ProductInsights';

export default {
  title: 'Features/ProductInsights',
  component: ProductInsights,
  parameters: {
    layout: 'fullscreen',
  },
};

// Mock data for stories
const MOCK_PRODUCT_INSIGHTS = [
  {
    product_id: 1,
    product_name: 'Organic Rice 5kg',
    sku: 'RICE-5KG',
    sales_count: 156,
    avg_price: 450.0,
    min_price: 420.0,
    max_price: 480.0,
    supplier_count: 3,
    inventory_level: 125,
    reorder_point: 50,
  },
  {
    product_id: 2,
    product_name: 'Wheat Flour 10kg',
    sku: 'FLOUR-10KG',
    sales_count: 124,
    avg_price: 380.0,
    min_price: 360.0,
    max_price: 410.0,
    supplier_count: 2,
    inventory_level: 95,
    reorder_point: 40,
  },
  {
    product_id: 3,
    product_name: 'Sunflower Oil 1L',
    sku: 'OIL-1L',
    sales_count: 89,
    avg_price: 120.0,
    min_price: 110.0,
    max_price: 135.0,
    supplier_count: 4,
    inventory_level: 8,
    reorder_point: 15,
  },
  {
    product_id: 4,
    product_name: 'Sugar 1kg',
    sku: 'SUGAR-1KG',
    sales_count: 45,
    avg_price: 65.0,
    min_price: 60.0,
    max_price: 75.0,
    supplier_count: 2,
    inventory_level: 250,
    reorder_point: 100,
  },
];

const MOCK_SUPPLIERS = [
  {
    supplier_id: 1,
    supplier_name: 'ACME Foods Ltd',
    is_active: true,
    avg_lead_time: 3.5,
  },
  {
    supplier_id: 2,
    supplier_name: 'Global Supply Co',
    is_active: true,
    avg_lead_time: 5.2,
  },
  {
    supplier_id: 3,
    supplier_name: 'Fresh Direct',
    is_active: true,
    avg_lead_time: 2.8,
  },
  {
    supplier_id: 4,
    supplier_name: 'Premium Imports',
    is_active: true,
    avg_lead_time: 7.5,
  },
];

/**
 * Default state with full data, filters available, and interactive controls
 */
export const Default = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh' }}>
      <ProductInsights />
    </div>
  ),
};

/**
 * Loading state - showing skeleton or loading indicator
 */
export const Loading = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page product-insights">
        <div style={{ padding: '2rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: '#fff', animation: 'pulse 2s infinite' }}>
          <div style={{ height: '2rem', background: '#e5e7eb', borderRadius: '0.5rem', marginBottom: '1rem', maxWidth: '400px' }} />
          <div style={{ height: '1rem', background: '#f3f4f6', borderRadius: '0.5rem', marginBottom: '2rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: '100px', background: '#f3f4f6', borderRadius: '0.5rem' }} />
            ))}
          </div>
          <div style={{ height: '400px', background: '#f3f4f6', borderRadius: '0.5rem' }} />
        </div>
      </div>
    </div>
  ),
};

/**
 * Empty state - no products with insights
 */
export const Empty = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page product-insights">
        <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: '#fff' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>No products with insights</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '2rem' }}>
            Products will appear here once you have sales and purchase history.
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
            Get Started
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
      <div className="insights-page product-insights">
        <div style={{ padding: '2rem', border: '2px solid #ef4444', borderRadius: 'var(--radius-lg)', background: '#fef2f2' }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.5rem' }}>
            ⚠️ Failed to load product insights
          </div>
          <div style={{ fontSize: '0.9rem', color: '#7f1d1d', marginBottom: '1.5rem' }}>
            Unable to fetch product data. Please check your connection and try again.
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
 * With Search Filter - showing filtered results by product name
 */
export const WithSearchFilter = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page product-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Search Results for "Rice"</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600 }}>Sales</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600 }}>Avg Price</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600 }}>Suppliers</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>Organic Rice 5kg</div>
                    <div style={{ fontSize: '0.85rem', color: '#999' }}>RICE-5KG</div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.75rem' }}>156</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem' }}>₹450.00</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem' }}>3</td>
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
      <div className="insights-page product-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.75rem 1rem', background: '#e0f2fe', borderRadius: 'var(--radius-md)', display: 'inline-block', fontSize: '0.9rem', fontWeight: 600 }}>
            ✓ Filtered: Date This Month
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>Total Products</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.5rem' }}>24</div>
          </div>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>High Demand</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.5rem', color: '#059669' }}>7</div>
          </div>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>Low Stock</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.5rem', color: '#dc2626' }}>3</div>
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * High Demand Product - showing strong sales volume
 */
export const HighDemandProduct = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page product-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
              ✓ Organic Rice 5kg - High Demand
            </div>
            <div style={{ color: '#15803d', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Strong sales volume (156 units) with consistent demand and healthy margin
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Sales</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>156</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Avg Price</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>₹450</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Suppliers</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>3</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * Low Stock Warning - showing inventory alert
 */
export const LowStockWarning = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page product-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.5rem' }}>
              ⚠️ Sunflower Oil 1L - Low Stock
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Current inventory (8 units) below reorder point. Consider placing order with suppliers.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>Current Stock</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>8</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>Reorder Point</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>15</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>Lead Time</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>3.5d</div>
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
      <div className="insights-page product-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '1rem', fontWeight: 600, color: '#666' }}>Active Filters:</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ padding: '0.5rem 1rem', background: '#e0f2fe', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              Search: Organic
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <div style={{ padding: '0.5rem 1rem', background: '#fef3c7', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              Date: This Month
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <button style={{ padding: '0.5rem 1rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)', cursor: 'pointer', color: '#666', fontSize: '0.9rem' }}>
              Clear All
            </button>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: '#999' }}>
          Showing filtered results: 5 of 24 products
        </div>
      </div>
    </div>
  ),
};

/**
 * Sorted by Sales Volume - highest sellers first
 */
export const SortedBySalesVolume = {
  render: () => (
    <div style={{ background: '#faf8f5', minHeight: '100vh', padding: '2rem' }}>
      <div className="insights-page product-insights">
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: '#666', fontWeight: 600 }}>
            Sorted by: Sales Volume (Highest First)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', background: '#faf8f5' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: 600 }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: 600 }}>Sales</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: 600 }}>Avg Price</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: 600 }}>Demand</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Organic Rice 5kg', sku: 'RICE-5KG', sales: 156, price: '₹450', demand: 'High' },
                  { name: 'Wheat Flour 10kg', sku: 'FLOUR-10KG', sales: 124, price: '₹380', demand: 'High' },
                  { name: 'Sunflower Oil 1L', sku: 'OIL-1L', sales: 89, price: '₹120', demand: 'Medium' },
                  { name: 'Sugar 1kg', sku: 'SUGAR-1KG', sales: 45, price: '₹65', demand: 'Low' },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#999' }}>{row.sku}</div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '1rem', fontWeight: 600 }}>{row.sales}</td>
                    <td style={{ textAlign: 'right', padding: '1rem' }}>{row.price}</td>
                    <td style={{ textAlign: 'center', padding: '1rem' }}>
                      <span style={{ padding: '0.25rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600, background: row.demand === 'High' ? '#dcfce7' : row.demand === 'Medium' ? '#dbeafe' : '#fef3c7', color: row.demand === 'High' ? '#166534' : row.demand === 'Medium' ? '#0c4a6e' : '#92400e' }}>
                        {row.demand}
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
