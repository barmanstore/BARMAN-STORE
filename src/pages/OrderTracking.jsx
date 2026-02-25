import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Package, Truck, CheckCircle, Clock, AlertCircle, 
  MapPin, Phone, Mail, CreditCard, Printer, RefreshCw 
} from 'lucide-react';
import { ordersApi } from '../services/api';
import { printHtmlDocument, escapeHtml } from '../utils/printService';
import { formatCurrency } from '../utils/formatters';
import { formatDateTime } from '../utils/dateTime';
import './OrderTracking.css';

const formatDate = (dateString) => {
  return formatDateTime(dateString, 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'delivered':
    case 'confirmed':
      return <CheckCircle size={20} className="status-icon delivered" />;
    case 'shipped':
      return <Truck size={20} className="status-icon shipped" />;
    case 'processing':
    case 'pending':
      return <Clock size={20} className="status-icon pending" />;
    default:
      return <Package size={20} className="status-icon default" />;
  }
};

const getStatusStep = (status) => {
  const steps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
  const index = steps.indexOf(status);
  return index >= 0 ? index : 0;
};

function OrderTracking() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchOrderNumber, setSearchOrderNumber] = useState('');

  useEffect(() => {
    if (orderId) {
      loadOrder();
    }
  }, [orderId]);

  const loadOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      let orderData;
      if (orderId.match(/^ORD-/)) {
        orderData = await ordersApi.getByOrderNumber(orderId);
      } else {
        orderData = await ordersApi.getById(orderId);
      }
      setOrder(orderData);
    } catch (err) {
      setError(err.message || 'Order not found');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchOrderNumber.trim()) {
      navigate(`/order-tracking/${searchOrderNumber.trim()}`);
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid': return 'status-paid';
      case 'pending': return 'status-pending';
      case 'refunded': return 'status-refunded';
      case 'declined': return 'status-declined';
      default: return '';
    }
  };

  const getFulfillmentStatusColor = (status) => {
    switch (status) {
      case 'fulfilled': return 'status-fulfilled';
      case 'shipped': return 'status-shipped';
      case 'label_created': return 'status-label-created';
      case 'processing': return 'status-processing';
      default: return '';
    }
  };

  const buildOrderReceiptHtml = (orderData) => {
    const items = Array.isArray(orderData?.items) ? orderData.items : [];
    const rows = items.map((item) => {
      const qty = Number(item.quantity || 0);
      const unit = Number(item.price || 0);
      const total = Number(item.total || (qty * unit));
      return `
        <tr>
          <td>${escapeHtml(item.product_name || '-')}</td>
          <td>${qty}</td>
          <td>${escapeHtml(formatCurrency(unit))}</td>
          <td>${escapeHtml(formatCurrency(total))}</td>
        </tr>
      `;
    }).join('');

    const shipping = orderData?.shipping_address || {};
    const subtotal = Number(orderData?.total_amount || 0) - Number(orderData?.tax_amount || 0) - Number(orderData?.shipping_amount || 0);

    return `
      <div class="order-receipt">
        <div class="receipt-header">
          <h1>Order Receipt</h1>
          <div><strong>Order #</strong> ${escapeHtml(orderData?.order_number || '')}</div>
          <div><strong>Date</strong> ${escapeHtml(formatDate(orderData?.created_at || Date.now()))}</div>
        </div>
        <div class="receipt-customer">
          <div><strong>${escapeHtml(orderData?.customer_name || '-')}</strong></div>
          <div>${escapeHtml(orderData?.customer_email || '')}</div>
          <div>${escapeHtml(orderData?.customer_phone || '')}</div>
          <div>${escapeHtml(shipping?.street || '')}</div>
          <div>${escapeHtml([shipping?.city, shipping?.state, shipping?.zip].filter(Boolean).join(', '))}</div>
        </div>
        <table class="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
        </table>
        <div class="receipt-summary">
          <div><span>Subtotal</span><strong>${escapeHtml(formatCurrency(subtotal))}</strong></div>
          <div><span>Tax</span><strong>${escapeHtml(formatCurrency(orderData?.tax_amount || 0))}</strong></div>
          <div><span>Shipping</span><strong>${escapeHtml(formatCurrency(orderData?.shipping_amount || 0))}</strong></div>
          <div class="total"><span>Total</span><strong>${escapeHtml(formatCurrency(orderData?.total_amount || 0))}</strong></div>
        </div>
      </div>
    `;
  };

  const handlePrintReceipt = () => {
    if (!order) return;
    printHtmlDocument({
      title: `Receipt ${order.order_number || ''}`,
      bodyHtml: buildOrderReceiptHtml(order),
      cssText: `
        .order-receipt { max-width: 760px; margin: 0 auto; }
        .receipt-header h1 { margin: 0 0 8px; font-size: 24px; }
        .receipt-header { margin-bottom: 12px; line-height: 1.6; font-size: 12px; }
        .receipt-customer { margin: 12px 0; font-size: 12px; line-height: 1.6; }
        .receipt-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .receipt-table th, .receipt-table td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
        .receipt-table thead th { background: #f3f4f6; }
        .receipt-summary { width: 320px; margin-top: 14px; margin-left: auto; }
        .receipt-summary div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
        .receipt-summary .total { font-weight: 700; border-bottom: none; font-size: 14px; }
      `,
      onError: (message) => setError(message),
    });
  };

  if (orderId && loading) {
    return (
      <div className="order-tracking-page">
        <div className="loading-container">
          <RefreshCw size={40} className="spinning" />
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (orderId && error) {
    return (
      <div className="order-tracking-page">
        <div className="search-section fade-in-up">
          <h1>Track Your Order</h1>
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Enter Order Number (e.g., ORD-240209-ABC123)"
              value={searchOrderNumber}
              onChange={(e) => setSearchOrderNumber(e.target.value)}
            />
            <button type="submit">Track</button>
          </form>
        </div>
        <div className="error-container fade-in-up">
          <AlertCircle size={60} />
          <h2>Order Not Found</h2>
          <p>We couldn't find an order with that number. Please check and try again.</p>
          <button onClick={() => navigate('/products')}>Continue Shopping</button>
        </div>
      </div>
    );
  }

  if (!orderId) {
    return (
      <div className="order-tracking-page">
        <div className="search-section fade-in-up">
          <h1>Track Your Order</h1>
          <p>Enter your order number to track your shipment</p>
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Enter Order Number (e.g., ORD-240209-ABC123)"
              value={searchOrderNumber}
              onChange={(e) => setSearchOrderNumber(e.target.value)}
            />
            <button type="submit">Track Order</button>
          </form>
        </div>
      </div>
    );
  }

  const currentStep = getStatusStep(order.status);
  const progressPercentage = (currentStep / 4) * 100;

  return (
    <div className="order-tracking-page">
      <div className="tracking-header fade-in-up">
        <h1>Order Tracking</h1>
        <p className="order-number-display">
          Order <strong>{order.order_number}</strong>
        </p>
      </div>

      {/* Order Status Progress */}
      <div className="status-progress-section fade-in-up">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPercentage}%` }}></div>
        </div>
        <div className="progress-steps">
          <div className={`step ${currentStep >= 0 ? 'active' : ''}`}>
            {getStatusIcon('pending')}
            <span>Order Placed</span>
          </div>
          <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
            {getStatusIcon('confirmed')}
            <span>Confirmed</span>
          </div>
          <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
            {getStatusIcon('processing')}
            <span>Processing</span>
          </div>
          <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
            {getStatusIcon('shipped')}
            <span>Shipped</span>
          </div>
          <div className={`step ${currentStep >= 4 ? 'active' : ''}`}>
            {getStatusIcon('delivered')}
            <span>Delivered</span>
          </div>
        </div>
      </div>

      {/* Order Info Grid */}
      <div className="tracking-content">
        {/* Left Column - Order Details */}
        <div className="tracking-main slide-in-left">
          {/* Order Items */}
          <div className="tracking-card">
            <h2>Order Items</h2>
            <div className="order-items-list">
              {order.items?.map((item, index) => (
                <div key={item.id} className="tracking-item" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="item-image">
                    {item.product_image ? (
                      <img src={item.product_image} alt={item.product_name} />
                    ) : (
                      <div className="placeholder-image">No Image</div>
                    )}
                  </div>
                  <div className="item-details">
                    <h4>{item.product_name}</h4>
                    <p className="item-quantity">Quantity: {item.quantity}</p>
                    <p className="item-price">{formatCurrency(item.price)} each</p>
                  </div>
                  <div className="item-total">
                    {formatCurrency(item.total || item.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Timeline */}
          <div className="tracking-card">
            <h2>Order Timeline</h2>
            <div className="timeline">
              {order.status_history?.map((history, index) => (
                <div key={history.id} className="timeline-item" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <span className="timeline-date">{formatDate(history.created_at)}</span>
                    <p className="timeline-status">{history.status}</p>
                    {history.description && <p className="timeline-description">{history.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications */}
          {order.notifications?.length > 0 && (
            <div className="tracking-card">
              <h2>Notifications Sent</h2>
              <div className="notifications-list">
                {order.notifications?.map((notif) => (
                  <div key={notif.id} className="notification-item">
                    <span className="notif-type">{notif.type.toUpperCase()}</span>
                    <span className="notif-sent-to">{notif.recipient}</span>
                    <span className={`notif-status ${notif.status}`}>{notif.status}</span>
                    <span className="notif-date">{formatDate(notif.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Summary & Actions */}
        <div className="tracking-sidebar slide-in-right">
          {/* Order Summary */}
          <div className="summary-card">
            <h2>Order Summary</h2>
            <div className="summary-rows">
              <div className="summary-row">
                <span>Order Number</span>
                <span className="mono">{order.order_number}</span>
              </div>
              <div className="summary-row">
                <span>Order Date</span>
                <span>{formatDate(order.created_at)}</span>
              </div>
              <div className="summary-row">
                <span>Status</span>
                <span className={`status-badge ${order.status}`}>{order.status}</span>
              </div>
              <div className="summary-row">
                <span>Payment Status</span>
                <span className={`payment-badge ${getPaymentStatusColor(order.payment_status)}`}>
                  {order.payment_status}
                </span>
              </div>
              <div className="summary-row">
                <span>Fulfillment</span>
                <span className={`fulfillment-badge ${getFulfillmentStatusColor(order.fulfillment_status)}`}>
                  {order.fulfillment_status}
                </span>
              </div>
            </div>

            <div className="summary-totals">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(order.total_amount - (order.tax_amount || 0) - (order.shipping_amount || 0))}</span>
              </div>
              <div className="summary-row">
                <span>Tax</span>
                <span>{formatCurrency(order.tax_amount || 0)}</span>
              </div>
              <div className="summary-row">
                <span>Shipping</span>
                <span>{formatCurrency(order.shipping_amount || 0)}</span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-total">
                <span>Total</span>
                <span>{formatCurrency(order.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shipping_address && (
            <div className="address-card">
              <h3><MapPin size={18} /> Shipping Address</h3>
              <div className="address-content">
                <p className="recipient-name">{order.customer_name}</p>
                <p>{order.shipping_address.street}</p>
                <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}</p>
                {order.shipping_address.country && <p>{order.shipping_address.country}</p>}
              </div>
            </div>
          )}

          {/* Contact Info */}
          <div className="contact-card">
            <h3>Contact Information</h3>
            <div className="contact-item">
              <Mail size={16} />
              <span>{order.customer_email}</span>
            </div>
            {order.customer_phone && (
              <div className="contact-item">
                <Phone size={16} />
                <span>{order.customer_phone}</span>
              </div>
            )}
          </div>

          {/* Payment Info */}
          {order.payments?.length > 0 && (
            <div className="payment-card">
              <h3><CreditCard size={18} /> Payment Details</h3>
              <div className="payment-content">
                {order.payments.map((payment) => (
                  <div key={payment.id} className="payment-item">
                    <p className="payment-method">{payment.payment_method}</p>
                    {payment.card_last4 && (
                      <p className="card-info">Card ending in {payment.card_last4}</p>
                    )}
                    <p className="payment-amount">{formatCurrency(payment.amount)}</p>
                    <p className={`payment-status ${payment.status}`}>{payment.status}</p>
                    {payment.transaction_id && (
                      <p className="transaction-id">TXN: {payment.transaction_id}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shipping Info */}
          {order.shipping_tracking_number && (
            <div className="shipping-card">
              <h3><Truck size={18} /> Shipping Information</h3>
              <div className="shipping-content">
                <p className="carrier">{order.shipping_carrier}</p>
                <p className="tracking-number">
                  Tracking: <strong>{order.shipping_tracking_number}</strong>
                </p>
                {order.estimated_delivery && (
                  <p className="estimated-delivery">
                    Est. Delivery: {formatDate(order.estimated_delivery)}
                  </p>
                )}
                {order.shipping_records?.length > 0 && (
                  <div className="shipping-history">
                    {order.shipping_records.map((record) => (
                      <div key={record.id} className="shipping-record">
                        <span className="record-status">{record.status}</span>
                        <span className="record-date">{formatDate(record.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="track-package-btn">
                Track Package on {order.shipping_carrier}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="actions-card">
            <button className="print-receipt-btn" onClick={handlePrintReceipt}>
              <Printer size={18} /> Print Receipt
            </button>
            <button className="continue-shopping-btn" onClick={() => navigate('/products')}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderTracking;
