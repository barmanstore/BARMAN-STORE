import { Link } from 'react-router-dom';
import { Package, ShoppingCart, Users, TrendingUp, CreditCard } from 'lucide-react';
import SignedCurrency from '../../../shared/components/SignedCurrency';
import { formatCurrency, truncateUserName } from '../../../shared/utils/formatters';
import { asNumber } from '../utils/adminHelpers';

function DashboardSection({
  dashboardDensity,
  setDashboardDensity,
  isMobile,
  stats,
  creditAgingSummary,
  purchaseOpsSummary,
  dailySalesSummary,
  topSellingProducts,
  slowMovingProducts,
  pendingOrdersCount,
  activeProductsCount,
  inactiveProductsCount,
  lowStockProducts,
  products,
  totalCustomers,
  visitorStats,
  recentOrders,
  recentCustomers,
  onTabChange,
}) {
  const todayDistributors = Array.isArray(purchaseOpsSummary?.todayDistributors)
    ? purchaseOpsSummary.todayDistributors
    : [];
  const predictedDeliveries = Array.isArray(purchaseOpsSummary?.predictedDeliveriesNext)
    ? purchaseOpsSummary.predictedDeliveriesNext
    : [];
  const vendorOutstanding = Number(purchaseOpsSummary?.cards?.outstanding_amount || 0);
  const nextDeliveryDate = predictedDeliveries[0]?.next_delivery_date || '';
  const totalOutstanding = Number(creditAgingSummary?.totalOutstanding || 0);
  const customersNeedFollowUp = Number(creditAgingSummary?.customersNeedFollowUp || 0);
  const customersOverdue = Number(creditAgingSummary?.customersOverdue || 0);
  const cashCollected = Number(dailySalesSummary?.cashCollected || 0);
  const creditIssued = Number(dailySalesSummary?.creditIssued || 0);

  return (
    <div className={`dashboard dashboard-${dashboardDensity}`}>
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        {!isMobile && (
          <div className="dashboard-density-toggle" role="group" aria-label="Dashboard density">
            <button
              type="button"
              className={`dashboard-density-btn ${dashboardDensity === 'compact' ? 'active' : ''}`}
              onClick={() => setDashboardDensity('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`dashboard-density-btn ${dashboardDensity === 'standard' ? 'active' : ''}`}
              onClick={() => setDashboardDensity('standard')}
            >
              Standard
            </button>
          </div>
        )}
      </div>
      <div className="stats-grid grouped-stats-grid">
        <div className="stat-group-card">
          <div className="stat-group-head">
            <ShoppingCart size={28} />
            <div>
              <p className="stat-group-kicker">Sales Snapshot</p>
              <h3><SignedCurrency amount={stats.totalRevenue} /></h3>
              <p className="stat-group-main-label">Total Revenue</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Total Orders</span>
              <strong>{asNumber(stats.totalOrders, 0)}</strong>
            </div>
            <div className="stat-group-metric">
              <span>Ordered (Pending Receive)</span>
              <strong>{pendingOrdersCount}</strong>
            </div>
          </div>
        </div>

        <div className="stat-group-card">
          <div className="stat-group-head">
            <Package size={28} />
            <div>
              <p className="stat-group-kicker">Catalog Health</p>
              <h3>{activeProductsCount}</h3>
              <p className="stat-group-main-label">Active Products</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Inactive Products</span>
              <strong>{inactiveProductsCount}</strong>
            </div>
            <div className="stat-group-metric">
              <span>Low Stock (≤10)</span>
              <strong>{lowStockProducts.length}</strong>
            </div>
            <div className="stat-group-metric">
              <span>Total Products</span>
              <strong>{products.length}</strong>
            </div>
          </div>
        </div>

        <div className="stat-group-card">
          <div className="stat-group-head">
            <Users size={28} />
            <div>
              <p className="stat-group-kicker">Customer Status</p>
              <h3>{totalCustomers}</h3>
              <p className="stat-group-main-label">Total Customers</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Online Logged-In</span>
              <strong>{visitorStats.onlineLoggedInUsers}</strong>
            </div>
          </div>
        </div>

        <div className="stat-group-card">
          <div className="stat-group-head">
            <TrendingUp size={28} />
            <div>
              <p className="stat-group-kicker">Visitor Traffic</p>
              <h3>{visitorStats.onlineVisitors}</h3>
              <p className="stat-group-main-label">Online Visitors</p>
            </div>
          </div>
          <div className="stat-group-metrics">
            <div className="stat-group-metric">
              <span>Unique Today</span>
              <strong>{visitorStats.uniqueSessionsToday}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Today Focus</h3>
          </div>
          <div className="dashboard-list">
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Customers needing follow‑up</span>
              <strong className="dashboard-row-value">{customersNeedFollowUp}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Customers overdue</span>
              <strong className="dashboard-row-value">{customersOverdue}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Outstanding credit</span>
              <strong className="dashboard-row-value">{formatCurrency(totalOutstanding)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Low stock items</span>
              <strong className="dashboard-row-value">{lowStockProducts.length}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Pending orders</span>
              <strong className="dashboard-row-value">{pendingOrdersCount}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Distributors today</span>
              <strong className="dashboard-row-value">{todayDistributors.length}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Next delivery</span>
              <strong className="dashboard-row-value">
                {nextDeliveryDate ? new Date(nextDeliveryDate).toLocaleDateString() : '-'}
              </strong>
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn" onClick={() => onTabChange('credit-aging')}>View Credit Aging</button>
            <button className="admin-btn" onClick={() => onTabChange('orders')}>View Orders</button>
            <button className="admin-btn" onClick={() => onTabChange('products')}>View Low Stock</button>
            <button className="admin-btn" onClick={() => onTabChange('purchases')}>View Purchases</button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Store Analytics (Today)</h3>
          </div>
          <div className="dashboard-list">
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Cash collected</span>
              <strong className="dashboard-row-value">{formatCurrency(cashCollected)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Udhar given</span>
              <strong className="dashboard-row-value">{formatCurrency(creditIssued)}</strong>
            </div>
            <div className="dashboard-list-row">
              <span className="dashboard-row-primary">Vendor dues</span>
              <strong className="dashboard-row-value">{formatCurrency(vendorOutstanding)}</strong>
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn" onClick={() => onTabChange('daily-sales')}>View Daily Sales</button>
            <button className="admin-btn" onClick={() => onTabChange('purchases')}>View Vendor Dues</button>
          </div>
          <div className="dashboard-panel-sublist">
            <div>
              <p className="dashboard-subhead">Top items</p>
              {Array.isArray(topSellingProducts) && topSellingProducts.length ? (
                topSellingProducts.map((item) => (
                  <div key={`top-${item.product_id}`} className="dashboard-list-row">
                    <span className="dashboard-row-primary">{item.product_name}</span>
                    <span className="dashboard-row-value">{Math.max(0, Number(item.purchase_count || 0))} buys</span>
                  </div>
                ))
              ) : (
                <p className="dashboard-empty">No top items yet.</p>
              )}
            </div>
            <div>
              <p className="dashboard-subhead">Slow moving</p>
              {Array.isArray(slowMovingProducts) && slowMovingProducts.length ? (
                slowMovingProducts.map((item) => (
                  <div key={`slow-${item.product_id}`} className="dashboard-list-row">
                    <span className="dashboard-row-primary">{item.product_name}</span>
                    <span className="dashboard-row-value">
                      {Number(item.avg_days_between || 0) > 0 ? `${Number(item.avg_days_between).toFixed(1)}d` : '-'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="dashboard-empty">No slow items yet.</p>
              )}
            </div>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn secondary" onClick={() => onTabChange('product-insights')}>
              View Product Insights
            </button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Quick Actions</h3>
          </div>
          <div className="dashboard-actions">
            <button className="admin-btn" onClick={() => onTabChange('orders')}>Manage Orders</button>
            <button className="admin-btn" onClick={() => onTabChange('products')}>Manage Products</button>
            <button className="admin-btn" onClick={() => onTabChange('billing')}>Create Bill</button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Low Stock (≤ 10)</h3>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="dashboard-empty">No low stock products.</p>
          ) : (
            <div className="dashboard-list">
              {lowStockProducts.map((product) => (
                <div className="dashboard-list-row" key={product.id}>
                  <span className="dashboard-row-primary">{product.name}</span>
                  <strong className="dashboard-row-value">Stock: {asNumber(product.stock, 0)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Recent Orders</h3>
          </div>
          {recentOrders.length === 0 ? (
            <p className="dashboard-empty">No orders yet.</p>
          ) : (
            <div className="dashboard-list">
              {recentOrders.map((order) => (
                <div className="dashboard-list-row" key={order.id}>
                  <span className="dashboard-row-primary">{order.order_number || `#${order.id}`}</span>
                  <span className="dashboard-row-secondary">
                    Date: {new Date(order.created_at || Date.now()).toLocaleDateString()}
                  </span>
                  <span className="dashboard-row-value">{formatCurrency(order.total_amount || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-head">
            <h3>Recent Customers</h3>
          </div>
          {recentCustomers.length === 0 ? (
            <p className="dashboard-empty">No customers found.</p>
          ) : (
            <div className="dashboard-list">
              {recentCustomers.map((customer) => (
                <div className="dashboard-list-row" key={customer.id}>
                  <span className="dashboard-row-primary">{truncateUserName(customer.name || '-', 15)}</span>
                  <span className="dashboard-row-secondary">{customer.phone || customer.email || '-'}</span>
                  <Link
                    className="action-btn credit"
                    to={`/admin/users/${customer.id}/credit?returnTab=dashboard`}
                    title="Open credit history"
                  >
                    <CreditCard size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardSection;

