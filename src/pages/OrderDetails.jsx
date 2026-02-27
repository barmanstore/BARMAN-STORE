import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ordersApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';

const extractQtyLabelFromName = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/\s*\[Qty:\s*([^\]]+)\]\s*$/i);
  if (!match) return { name: raw, qtyLabel: '' };
  return {
    name: raw.replace(/\s*\[Qty:\s*([^\]]+)\]\s*$/i, '').trim(),
    qtyLabel: String(match[1] || '').trim(),
  };
};

const getOrderItemDisplay = (item) => {
  const parsed = extractQtyLabelFromName(item?.product_name || item?.name || '');
  const manual = Number(item?.is_manual || 0) === 1 || !Number(item?.product_id || 0);
  const unitPrice = Number(item?.price || 0);
  const quantity = Number(item?.quantity || 0);
  const computedTotal = Number(item?.total || (quantity * unitPrice));
  const quantityLabel = String(item?.quantity_label || parsed.qtyLabel || '').trim();
  return {
    name: parsed.name || '-',
    quantityText: quantityLabel || String(quantity > 0 ? quantity : 1),
    unitPrice,
    total: computedTotal,
    unknownPrice: manual && unitPrice <= 0,
  };
};

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
  const isOrdered = String(order.status || '').toLowerCase() === 'ordered';

  return (
    <div style={{ padding: 20 }}>
      <h1>Order {order.order_number || `#${order.id}`}</h1>
      <p><strong>Customer:</strong> {order.customer_name} ({order.customer_email})</p>
      { /* If admin viewing, show admin controls */ }
      {isAdmin && (
        <div style={{ marginTop: 8 }}>
          {isOrdered ? (
            <button
              onClick={async () => {
                if (!window.confirm('Mark this order as received/confirmed?')) return;
                try {
                  setActionLoading(true);
                  await ordersApi.updateStatus(order.id, 'received', 'Marked received via order details', savedUser.id);
                  await loadOrder();
                  alert('Order marked as received');
                } catch (err) {
                  alert(err.message || 'Failed to update order');
                } finally {
                  setActionLoading(false);
                }
              }}
              className="admin-btn"
              disabled={actionLoading}
            >
              Mark Received
            </button>
          ) : (
            <span style={{ opacity: 0.8 }}>Already received</span>
          )}
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
          {order.items && order.items.map(item => {
            const display = getOrderItemDisplay(item);
            return (
            <tr key={item.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{display.name}</td>
              <td style={{ padding: 8 }}>{display.quantityText}</td>
              <td style={{ padding: 8 }}>{display.unknownPrice ? 'Unknown' : formatCurrency(display.unitPrice)}</td>
              <td style={{ padding: 8 }}>{display.unknownPrice ? 'Unknown' : formatCurrency(display.total)}</td>
            </tr>
          );
          })}
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
