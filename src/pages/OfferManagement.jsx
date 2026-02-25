import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { offersApi } from '../services/api';

function OfferManagement() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'percentage',
    value: 0,
    status: 'active',
  });

  const fetchOffers = async () => {
    try {
      setLoading(true);
      setOffers(await offersApi.getAll());
    } catch (e) {
      setError('Failed to load offers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await offersApi.create(form);
      setForm({ name: '', description: '', type: 'percentage', value: 0, status: 'active' });
      await fetchOffers();
    } catch (e) {
      setError(e.message || 'Failed to create offer');
    }
  };

  const handleDelete = async (id) => {
    try {
      await offersApi.delete(id);
      setOffers((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      setError('Failed to delete offer');
    }
  };

  if (loading) return <div className="billing-content"><p>Loading offers...</p></div>;

  return (
    <div className="billing-content">
      <h1>Offer Management</h1>
      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="form-section">
        <div className="form-row">
          <label className="form-label">Name</label>
          <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className="form-row">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="form-row">
          <label className="form-label">Type</label>
          <select className="form-input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
            <option value="percentage">Percentage</option>
            <option value="bogo">Buy One Get One</option>
            <option value="bundle">Bundle</option>
            <option value="volume">Volume</option>
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Value</label>
          <input type="number" className="form-input" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: Number(e.target.value || 0) }))} />
        </div>
        <button type="submit" className="add-btn"><Plus size={16} /> Add Offer</button>
      </form>

      <div className="table-container">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id}>
                <td>{offer.name}</td>
                <td>{offer.type}</td>
                <td>{offer.value}</td>
                <td>{offer.status}</td>
                <td>
                  <button className="delete-btn" onClick={() => handleDelete(offer.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OfferManagement;

