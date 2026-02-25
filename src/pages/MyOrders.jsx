import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ordersApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const saved = JSON.parse(localStorage.getItem('user') || '{}');
        if (!saved?.id) {
          // not logged in - redirect to login
          navigate('/login');
          return;
        }
        const data = await ordersApi.getByUser(saved.id);
        setOrders(data || []);
      } catch (err) {
        setError(err.message || 'Failed to load orders');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  if (loading) return <div style={{ padding: 20 }}>Loading your orders...</div>;
  if (error) return <div style={{ padding: 20 }} className="error-message">{error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>My Orders</h1>
      {orders.length === 0 ? (
        <p>You have no orders yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px' }}>Order #</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Amount</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '8px' }}>{o.order_number || `#${o.id}`}</td>
                <td style={{ padding: '8px' }}>{formatCurrency(o.total_amount || 0)}</td>
                <td style={{ padding: '8px' }}>{o.status}</td>
                <td style={{ padding: '8px' }}>{new Date(o.created_at).toLocaleString()}</td>
                <td style={{ padding: '8px' }}>
                  <Link to={`/orders/${o.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
