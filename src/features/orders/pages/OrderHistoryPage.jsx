import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Download,
  AlertCircle,
  Eye,
  Package,
  Repeat2,
  RotateCcw,
  ShoppingBag,
} from 'lucide-react';
import { useCart } from '../../../providers/CartProvider';
import { useSession } from '../../../providers/SessionProvider';
import { ordersApi } from '../api/index.js';
import { formatCurrency } from '../../../shared/utils/formatters';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import EmptyState from '../../../shared/components/EmptyState';
import DropdownFilter from '../../../shared/components/filters/DropdownFilter';
import SearchFilter from '../../../shared/components/filters/SearchFilter';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
import {
  buildRepeatCartFromOrder,
  extractQtyLabelFromName,
  formatDate,
  getStatusConfig,
  sortOptions,
  statusFilters,
} from '../utils/orderHistoryUtils';
import './OrderHistoryPage.css';

function OrderFilters({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  statusCounts,
}) {
  const statusOptions = useMemo(
    () =>
      statusFilters.map((status) => ({
        value: status,
        label:
          status === 'all'
            ? `All orders (${statusCounts.all})`
            : `${getStatusConfig(status).label} (${statusCounts[status] || 0})`,
      })),
    [statusCounts]
  );

  const sortOptionsWithAll = useMemo(
    () =>
      sortOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    []
  );

  return (
    <section className="order-history-filters">
      <SearchFilter
        id="order-history-search"
        placeholder="Search by order number, name, or email"
        value={searchTerm}
        onChange={setSearchTerm}
        onSubmit={setSearchTerm}
        width="100%"
        stretch
        tone="slate"
      />

      <div className="order-history-filters__row">
        <DropdownFilter
          label="Status"
          options={statusOptions}
          selectedItems={statusFilter === 'all' ? [] : [statusFilter]}
          onChange={(nextItems) => setStatusFilter(nextItems[0] || 'all')}
          width="100%"
          tone="slate"
        />

        <DropdownFilter
          label="Sort"
          options={sortOptionsWithAll}
          selectedItems={[sortBy]}
          onChange={(nextItems) => setSortBy(nextItems[0] || 'date_desc')}
          width="100%"
          tone="slate"
        />
      </div>
    </section>
  );
}

function EmptyOrdersState({ hasActiveFilters, onStartShopping }) {
  return (
    <div className="order-history-empty-card">
      <EmptyState
        eyebrow={hasActiveFilters ? 'Filtered view' : 'Order history'}
        icon={<Package size={24} aria-hidden="true" />}
        title={hasActiveFilters ? 'No orders match your filters' : 'No orders yet'}
        description={
          hasActiveFilters
            ? 'Try a different status, clear the search, or reset the sort order.'
            : 'Once you place an order, it will appear here with status, totals, and repeat actions.'
        }
        actions={
          <button type="button" onClick={onStartShopping} className="order-history-primary-button">
            <ShoppingBag size={15} aria-hidden="true" />
            Start shopping
          </button>
        }
      />
    </div>
  );
}

function OrderCard({ order, index, onViewOrder, onRepeatOrder, repeatDisabled }) {
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;

  return (
    <article
      className="order-history-card slide-in-up"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <div className="order-history-card__top">
        <div className="order-history-card__identity">
          <button type="button" className="order-history-card__number" onClick={onViewOrder}>
            {order.order_number || `#${order.id}`}
          </button>
          <div className="order-history-card__meta">
            <span>
              <Calendar size={12} aria-hidden="true" />
              {formatDate(order.created_at)}
            </span>
            <span aria-hidden="true">•</span>
            <span>{itemCount} items</span>
          </div>
        </div>

        <div className={`order-history-card__status ${statusConfig.color}`}>
          <StatusIcon size={14} aria-hidden="true" />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      <div className="order-history-card__items">
        {order.items?.slice(0, 3).map((item, itemIndex) => {
          const parsed = extractQtyLabelFromName(item.product_name || item.name);
          const qtyText =
            String(item.quantity_label || parsed.qtyLabel || '').trim() || `x${item.quantity}`;

          return (
            <div key={item.id || itemIndex} className="order-history-card__item">
              <span className="order-history-card__item-name">
                {parsed.name || item.product_name || item.name}
              </span>
              <span className="order-history-card__item-qty">
                {qtyText.startsWith('x') ? qtyText : `Qty ${qtyText}`}
              </span>
            </div>
          );
        })}
        {order.items?.length > 3 ? (
          <span className="order-history-card__more">+{order.items.length - 3} more</span>
        ) : null}
      </div>

      <div className="order-history-card__bottom">
        <div className="order-history-card__total">
          <span>Total</span>
          <strong>{formatCurrency(order.total_amount)}</strong>
        </div>

        <div className="order-history-card__actions">
          <button type="button" className="order-history-action" onClick={onViewOrder}>
            <Eye size={14} aria-hidden="true" />
            View
          </button>
          <button
            type="button"
            className="order-history-action order-history-action--primary"
            onClick={onRepeatOrder}
            disabled={repeatDisabled}
          >
            <Repeat2 size={14} aria-hidden="true" />
            Reorder
          </button>
        </div>
      </div>
    </article>
  );
}

function ExportSection({ onExport }) {
  return (
    <section className="order-history-export">
      <div className="order-history-export__copy">
        <span>Export</span>
        <p>Download the filtered list as CSV for offline review or reporting.</p>
      </div>
      <button type="button" className="order-history-secondary-button" onClick={onExport}>
        <Download size={14} aria-hidden="true" />
        Export CSV
      </button>
    </section>
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

    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      result = result.filter(
        (order) =>
          order.order_number?.toLowerCase().includes(needle) ||
          order.customer_name?.toLowerCase().includes(needle) ||
          order.customer_email?.toLowerCase().includes(needle)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((order) => order.status === statusFilter);
    }

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

  const statusCounts = {
    all: orders.length,
    ordered: orders.filter((o) => o.status === 'ordered').length,
    received: orders.filter((o) => o.status === 'received').length,
  };

  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'all' || sortBy !== 'date_desc';

  const activeOrderCount = useMemo(
    () => orders.filter((order) => order.status !== 'received').length,
    [orders]
  );

  const pageStats = useMemo(
    () => [
      {
        label: 'Total orders',
        value: String(statusCounts.all),
        hint: 'All saved order records',
        icon: ShoppingBag,
      },
      {
        label: 'Open',
        value: String(activeOrderCount),
        hint: 'Not yet received',
        icon: AlertCircle,
      },
      {
        label: 'Received',
        value: String(statusCounts.received || 0),
        hint: 'Completed orders',
        icon: CheckCircle2,
      },
    ],
    [activeOrderCount, statusCounts.all, statusCounts.received]
  );

  const handleViewOrder = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortBy('date_desc');
  };

  const handleRepeatLastOrder = () => {
    if (!latestOrder) return;
    const repeatCart = buildRepeatCartFromOrder(latestOrder).filter((item) =>
      String(item?.name || '').trim()
    );
    if (repeatCart.length === 0) {
      return;
    }
    try {
      setRepeatLoading(true);
      restoreFromOrder(repeatCart);
      setRepeatLoading(false);
      navigate('/cart');
    } catch {
      setRepeatLoading(false);
    }
  };

  const handleRepeatOrder = (order) => {
    if (!order) return;
    const repeatCart = buildRepeatCartFromOrder(order).filter((item) =>
      String(item?.name || '').trim()
    );
    if (repeatCart.length === 0) {
      return;
    }
    try {
      setRepeatLoading(true);
      restoreFromOrder(repeatCart);
      setRepeatLoading(false);
      navigate('/cart');
    } catch {
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
          <div className="order-history-state">
            <div className="order-history-state__panel">
              <RotateCcw size={30} className="spinning" />
              <h2>Loading order history</h2>
              <p>Fetching your timeline and filter counts.</p>
            </div>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  if (error) {
    return (
      <MobileAccountLayout>
        <div className="order-history-page">
          <div className="order-history-state">
            <div className="order-history-state__panel">
              <Package size={30} aria-hidden="true" />
              <h2>Unable to load orders</h2>
              <p>{error}</p>
              <button type="button" onClick={loadOrders} className="order-history-primary-button">
                Try again
              </button>
            </div>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  return (
    <MobileAccountLayout>
      <div className="order-history-page">
        <div className="order-history-page__background" aria-hidden="true" />
        <div className="order-history-page__shell">
          <BackofficePageHeader
            title="Order History"
            subtitle="Review recent purchases, repeat the latest order, and keep the list tidy with fast filters."
            actions={
              <div className="order-history-header-actions">
                {latestOrder ? (
                  <button
                    type="button"
                    className="order-history-primary-button"
                    onClick={handleRepeatLastOrder}
                    disabled={repeatLoading}
                  >
                    {repeatLoading ? (
                      <>
                        <RotateCcw size={14} className="is-spinning" aria-hidden="true" />
                        Repeating
                      </>
                    ) : (
                      <>
                        <Repeat2 size={14} aria-hidden="true" />
                        Repeat latest
                      </>
                    )}
                  </button>
                ) : null}

                {hasActiveFilters ? (
                  <button
                    type="button"
                    className="order-history-secondary-button"
                    onClick={handleClearAllFilters}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            }
          >
            <div className="order-history-header-kpis">
              {pageStats.map((stat) => (
                <div key={stat.label} className="order-history-kpi">
                  <div className="order-history-kpi__icon">
                    <stat.icon size={15} aria-hidden="true" />
                  </div>
                  <div>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.hint}</small>
                  </div>
                </div>
              ))}
            </div>
          </BackofficePageHeader>

          <OrderFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            statusCounts={statusCounts}
          />

          <section className="order-history-list-section">
            <div className="order-history-list-section__header">
              <div>
                <span className="order-history-section-label">Results</span>
                <h2>
                  {filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'}
                </h2>
              </div>
              <span className="order-history-toolbar-note">
                {hasActiveFilters ? 'Filtered view active' : 'Showing all orders'}
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <EmptyOrdersState
                hasActiveFilters={hasActiveFilters}
                onStartShopping={() => navigate('/products')}
              />
            ) : (
              <div className="order-history-list">
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
          </section>

          {orders.length > 0 ? <ExportSection onExport={handleExportOrders} /> : null}
        </div>
      </div>
    </MobileAccountLayout>
  );
}

export default OrderHistoryPage;
