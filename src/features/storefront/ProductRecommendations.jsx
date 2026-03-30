import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { useSession } from '../../providers/SessionProvider';
import { productRecommendationsApi } from '../../shared/services/api';
import MobileAccountLayout from '../../shared/components/mobile/MobileAccountLayout';
import './ProductRecommendations.css';

function ProductRecommendations() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    requested_name: '',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await productRecommendationsApi.getMine();
      setList(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      navigate('/login');
      return;
    }
    load();
  }, [navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        requested_name: String(form.requested_name || '').trim(),
        notes: String(form.notes || '').trim(),
      };
      if (!payload.requested_name) {
        throw new Error('Product name is required');
      }
      await productRecommendationsApi.create(payload);
      setSuccess('Request submitted successfully.');
      setForm({ requested_name: '', notes: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileAccountLayout>
      <div className="recommendation-page">
        <section className="recommendation-card">
          <h1><Lightbulb size={18} /> Request a Product</h1>
          <p>Tell us which product is missing. We review and update you in this list.</p>
          {error ? <div className="recommendation-alert error">{error}</div> : null}
          {success ? <div className="recommendation-alert success">{success}</div> : null}
        <form className="recommendation-form" onSubmit={handleSubmit}>
          <label htmlFor="requested_name">Product Name</label>
          <input
            id="requested_name"
            value={form.requested_name}
            onChange={(e) => setForm((prev) => ({ ...prev, requested_name: e.target.value }))}
            placeholder="e.g., Parle-G 800g family pack"
            required
          />
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Brand, size, expected quantity, etc."
            rows={4}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </section>

      <section className="recommendation-history">
        <div className="history-head">
          <h2>Your Requests</h2>
          <button type="button" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : list.length === 0 ? (
          <p className="muted">No requests yet.</p>
        ) : (
          <div className="history-list">
            {list.map((item) => (
              <article key={item.id} className="history-item">
                <div className="history-top">
                  <strong>{item.requested_name}</strong>
                  <span className={`status ${String(item.status || 'open').toLowerCase()}`}>{item.status || 'open'}</span>
                </div>
                {item.notes ? <p>{item.notes}</p> : null}
                {item.admin_note ? <p className="admin-note">Admin: {item.admin_note}</p> : null}
                <small>{new Date(item.created_at || Date.now()).toLocaleString()}</small>
              </article>
            ))}
          </div>
        )}
        </section>
      </div>
    </MobileAccountLayout>
  );
}

export default ProductRecommendations;


