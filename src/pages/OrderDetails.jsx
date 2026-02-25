import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ordersApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';

export default function OrderDetails() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const navigate = useNavigate();

  const getSavedUser = () => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (_) {
      return {};
    }
  };

  const loadOrder = async () => {
    const data = await ordersApi.getById(id);
    const savedUser = getSavedUser();
    const isAdmin = savedUser?.role === 'admin';
    const ownerId = data?.user_id ?? data?.customer_id;
    const hasOwnerField = ownerId !== undefined && ownerId !== null;
    const isOwner = Number(savedUser?.id) === Number(ownerId);
    if (!isAdmin && hasOwnerField && !isOwner) {
      throw new Error('You are not authorized to view this order');
    }

    setOrder(data);
    const hist = await ordersApi.getHistory(id).catch(() => []);
    setHistory(hist || []);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadOrder();
      } catch (err) {
        setError(err.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 20 }}>Loading order...</div>;
  if (error) return <div style={{ padding: 20 }} className="error-message">{error}</div>;
  if (!order) return <div style={{ padding: 20 }}>Order not found</div>;

  const savedUser = getSavedUser();
  const isAdmin = savedUser?.role === 'admin';
  const orderOwnerId = order?.user_id ?? order?.customer_id;
  const canCustomerCancel = !isAdmin && Number(savedUser?.id) === Number(orderOwnerId) && order.status === 'pending';

  return (
    <div style={{ padding: 20 }}>
      <h1>Order {order.order_number || `#${order.id}`}</h1>
      <p><strong>Customer:</strong> {order.customer_name} ({order.customer_email})</p>
      { /* If admin viewing, show admin controls */ }
      {isAdmin && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={async () => {
              if (!window.confirm('Approve this order and apply stock?')) return;
              try {
                setActionLoading(true);
                await ordersApi.updateStatus(order.id, 'confirmed', 'Approved via details page', savedUser.id);
                await loadOrder();
                alert('Order approved');
              } catch (err) {
                alert(err.message || 'Failed to approve');
              } finally {
                setActionLoading(false);
              }
            }}
            className="admin-btn"
            disabled={actionLoading}
          >
            Approve
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Cancel this order?')) return;
              try {
                setActionLoading(true);
                await ordersApi.updateStatus(order.id, 'cancelled', 'Cancelled via details page', savedUser.id);
                await loadOrder();
                alert('Order cancelled');
              } catch (err) {
                alert(err.message || 'Failed to cancel');
              } finally {
                setActionLoading(false);
              }
            }}
            style={{ marginLeft: 8 }}
            className="admin-btn"
            disabled={actionLoading}
          >
            Cancel
          </button>
        </div>
      )}
      {canCustomerCancel && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={async () => {
              if (!window.confirm('Cancel this pending order?')) return;
              try {
                setActionLoading(true);
                await ordersApi.cancel(order.id, 'Cancelled by customer from order details', savedUser.id);
                await loadOrder();
                alert('Order cancelled');
              } catch (err) {
                alert(err.message || 'Failed to cancel order');
              } finally {
                setActionLoading(false);
              }
            }}
            className="admin-btn"
            disabled={actionLoading}
          >
            Cancel Order
          </button>
        </div>
      )}
      <p><strong>Status:</strong> {order.status} &nbsp; <strong>Payment:</strong> {order.payment_status}</p>
      <h3>Items</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8 }}>Product</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Qty</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Price</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items && order.items.map(item => (
            <tr key={item.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{item.product_name}</td>
              <td style={{ padding: 8 }}>{item.quantity}</td>
              <td style={{ padding: 8 }}>{formatCurrency(item.price)}</td>
              <td style={{ padding: 8 }}>{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12 }}>
        <strong>Total:</strong> {formatCurrency(order.total_amount)}
      </div>
      <div style={{ marginTop: 20 }}>
        <h3>Order History</h3>
        {history.length === 0 ? (
          <p>No history available</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8 }}>When</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 8 }}>By</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>{new Date(h.created_at).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{h.status}</td>
                  <td style={{ padding: 8 }}>{h.created_by_name || h.created_by || 'System'}</td>
                  <td style={{ padding: 8 }}>{h.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => navigate(-1)} className="admin-btn">Back</button>
      </div>
    </div>
  );
}
