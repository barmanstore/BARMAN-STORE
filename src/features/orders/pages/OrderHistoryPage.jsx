import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Eye, RotateCcw, Download, Package } from 'lucide-react';
import { useCart } from '../../../providers/CartProvider';
import { useSession } from '../../../providers/SessionProvider';
import { ordersApi } from '../api/index.js';
import { formatCurrency } from '../../../shared/utils/formatters';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
import {
  formatDate,
  getStatusConfig,
  statusFilters,
  sortOptions,
  extractQtyLabelFromName,
  buildRepeatCartFromOrder,
} from '../utils/orderHistoryUtils';
import './OrderHistoryPage.css';

function HistoryHeader({ latestOrder, onRepeatLastOrder, repeatLoading, repeatMessage }) {
  return (
    <div className="history-header fade-in-up">
      <h1>Order History</h1>
      <p>View and manage all your orders</p>
      {latestOrder ? (
        <button
          type="button"
          className="repeat-last-order-btn"
          onClick={onRepeatLastOrder}
          disabled={repeatLoading}
        >
          {repeatLoading ? 'Adding Last Order...' : 'Last Order'}
        </button>
      ) : null}
      {repeatMessage ? <p className="repeat-last-order-msg">{repeatMessage}</p> : null}
    </div>
  );
}

function OrderFilters({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  statusCounts,
}) {
  return (
    <div className="filters-section fade-in-up">
      <div className="search-box">
        <Search size={20} />
        <input
          id="order-history-search"
          name="order_history_search"
          type="text"
          placeholder="Search by order number, name, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filter-controls">
        <div className="filter-group">
          <Filter size={18} />
          <select
            name="status_filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusFilters.map((status) => (
              <option key={status} value={status}>
                {status === 'all'
                  ? `All Orders (${statusCounts.all})`
                  : `${getStatusConfig(status).label} (${statusCounts[status] || 0})`}
              </option>
            ))}
          </select>
        </div>

        <div className="sort-group">
          <select name="sort_by" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function StatusTabs({ statusCounts, statusFilter, setStatusFilter }) {
  return (
    <div className="status-tabs fade-in-up">
      {Object.entries(statusCounts).map(([status, count]) => (
        <button
          key={status}
          className={`status-tab ${statusFilter === status ? 'active' : ''}`}
          onClick={() => setStatusFilter(status)}
        >
          {status === 'all' ? 'All' : getStatusConfig(status).label}
          <span className="tab-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyOrdersState({ hasActiveFilters, onStartShopping }) {
  return (
    <div className="empty-state fade-in-up">
      <Package size={80} />
      <h2>No Orders Found</h2>
      <p>{hasActiveFilters ? 'Try adjusting your filters' : "You haven't placed any orders yet"}</p>
      <button onClick={onStartShopping}>Start Shopping</button>
    </div>
  );
}

function OrderCard({ order, index, onViewOrder, onRepeatOrder, repeatDisabled }) {
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="order-card slide-in-up" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="order-header">
        <div className="order-info">
          <button
            type="button"
            className="order-number"
            onClick={onViewOrder}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {order.order_number || `#${order.id}`}
          </button>
          <span className="order-date">{formatDate(order.created_at)}</span>
        </div>
        <div className="order-status">
          <StatusIcon size={18} className={`status-icon ${statusConfig.color}`} />
          <span className={`status-text ${statusConfig.color}`}>{statusConfig.label}</span>
        </div>
      </div>

      <div className="order-items-preview">
        {order.items?.slice(0, 3).map((item, itemIndex) => {
          const parsed = extractQtyLabelFromName(item.product_name || item.name);
          const qtyText =
            String(item.quantity_label || parsed.qtyLabel || '').trim() || `x${item.quantity}`;
          return (
            <div key={item.id || itemIndex} className="item-preview">
              <span className="item-name">{parsed.name || item.product_name || item.name}</span>
              <span className="item-qty">
                {qtyText.startsWith('x') ? qtyText : `Qty: ${qtyText}`}
              </span>
            </div>
          );
        })}
        {order.items?.length > 3 && (
          <span className="more-items">+{order.items.length - 3} more</span>
        )}
      </div>

      <div className="order-footer">
        <div className="order-total">
          <span className="total-label">Total</span>
          <span className="total-amount">{formatCurrency(order.total_amount)}</span>
        </div>
        <div className="order-actions">
          <button className="view-btn" onClick={onViewOrder}>
            <Eye size={16} />
            View Details
          </button>
          <button className="reorder-btn" onClick={onRepeatOrder} disabled={repeatDisabled}>
            <RotateCcw size={16} />
            Reorder
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportSection({ onExport }) {
  return (
    <div className="export-section fade-in-up">
      <button className="export-btn" onClick={onExport}>
        <Download size={18} />
        Export Order History
      </button>
    </div>
  );
}

function OrderHistoryPage() {
  const { user } = useSession();
  const { restoreFromOrder } = useCart();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [repeatLoading, setRepeatLoading] = useState(false);
  const [repeatMessage, setRepeatMessage] = useState('');
  const navigate = useNavigate();

  const latestOrder = useMemo(() => {
    if (!Array.isArray(orders) || orders.length === 0) return null;
    return (
      [...orders].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )[0] || null
    );
  }, [orders]);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    filterAndSortOrders();
  }, [orders, searchTerm, statusFilter, sortBy]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!user.id) {
        navigate('/login');
        return;
      }
      const userOrders = await ordersApi.getByUser(user.id);
      setOrders(userOrders || []);
    } catch (err) {
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortOrders = () => {
    let result = [...orders];

    // Filter by search term
    if (searchTerm) {
      result = result.filter(
        (order) =>
          order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((order) => order.status === statusFilter);
    }

    // Sort
    switch (sortBy) {
      case 'date_desc':
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'date_asc':
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'amount_desc':
        result.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
        break;
      case 'amount_asc':
        result.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0));
        break;
      default:
        break;
    }

    setFilteredOrders(result);
  };

  const getStatusCounts = () => {
    const counts = {
      all: orders.length,
      ordered: orders.filter((o) => o.status === 'ordered').length,
      received: orders.filter((o) => o.status === 'received').length,
    };
    return counts;
  };

  const statusCounts = getStatusCounts();

  const handleViewOrder = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  const handleRepeatLastOrder = () => {
    if (!latestOrder) return;
    const repeatCart = buildRepeatCartFromOrder(latestOrder).filter((item) =>
      String(item?.name || '').trim()
    );
    if (repeatCart.length === 0) {
      setRepeatMessage('Last order has no repeatable items.');
      return;
    }
    try {
      setRepeatLoading(true);
      restoreFromOrder(repeatCart);
      setRepeatMessage(
        `Added ${repeatCart.length} items from ${latestOrder.order_number || `#${latestOrder.id}`}.`
      );
      navigate('/cart');
    } catch (_) {
      setRepeatMessage('Unable to repeat last order right now.');
    } finally {
      setRepeatLoading(false);
    }
  };

  const handleRepeatOrder = (order) => {
    if (!order) return;
    const repeatCart = buildRepeatCartFromOrder(order).filter((item) =>
      String(item?.name || '').trim()
    );
    if (repeatCart.length === 0) {
      setRepeatMessage('This order has no repeatable items.');
      return;
    }
    try {
      setRepeatLoading(true);
      restoreFromOrder(repeatCart);
      setRepeatMessage(
        `Added ${repeatCart.length} items from ${order.order_number || `#${order.id}`}.`
      );
      navigate('/cart');
    } catch (_) {
      setRepeatMessage('Unable to repeat this order right now.');
    } finally {
      setRepeatLoading(false);
    }
  };

  const handleExportOrders = () => {
    const rows = filteredOrders.map((order) => ({
      order_number: order.order_number || `#${order.id}`,
      date: order.created_at ? new Date(order.created_at).toISOString() : '',
      customer_name: order.customer_name || '',
      customer_email: order.customer_email || '',
      status: order.status || '',
      payment_status: order.payment_status || '',
      fulfillment_status: order.fulfillment_status || '',
      total_amount: Number(order.total_amount || 0).toFixed(2),
      item_count: Array.isArray(order.items) ? order.items.length : 0,
    }));

    const headers = [
      'order_number',
      'date',
      'customer_name',
      'customer_email',
      'status',
      'payment_status',
      'fulfillment_status',
      'total_amount',
      'item_count',
    ];

    const escapeCsv = (value) => {
      const raw = String(value ?? '');
      if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `order-history-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <MobileAccountLayout>
        <div className="order-history-page">
          <div className="loading-container">
            <RotateCcw size={40} className="spinning" />
            <p>Loading your orders...</p>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  if (error) {
    return (
      <MobileAccountLayout>
        <div className="order-history-page">
          <div className="error-container">
            <Package size={60} />
            <h2>Unable to Load Orders</h2>
            <p>{error}</p>
            <button onClick={loadOrders}>Try Again</button>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  return (
    <MobileAccountLayout>
      <div className="order-history-page">
        <HistoryHeader
          latestOrder={latestOrder}
          onRepeatLastOrder={handleRepeatLastOrder}
          repeatLoading={repeatLoading}
          repeatMessage={repeatMessage}
        />
        <OrderFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          statusCounts={statusCounts}
        />
        <StatusTabs
          statusCounts={statusCounts}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
        {filteredOrders.length === 0 ? (
          <EmptyOrdersState
            hasActiveFilters={Boolean(searchTerm) || statusFilter !== 'all'}
            onStartShopping={() => navigate('/products')}
          />
        ) : (
          <div className="orders-list">
            {filteredOrders.map((order, index) => (
              <OrderCard
                key={order.id}
                order={order}
                index={index}
                onViewOrder={() => handleViewOrder(order.id)}
                onRepeatOrder={() => handleRepeatOrder(order)}
                repeatDisabled={repeatLoading}
              />
            ))}
          </div>
        )}
        {orders.length > 0 && <ExportSection onExport={handleExportOrders} />}
      </div>
    </MobileAccountLayout>
  );
}

export default OrderHistoryPage;
