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

