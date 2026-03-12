import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Search, Phone, MapPin, Calendar, Package } from 'lucide-react';
import { distributorsApi } from '../services/api';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import useLockBodyScroll from '../hooks/useLockBodyScroll';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import './DistributorManagement.css';

function DistributorManagement({ user }) {
  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDistributor, setEditingDistributor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  useLockBodyScroll(showForm);

  const [formData, setFormData] = useState({
    name: '',
    salesman_name: '',
    phone: '',
    email: '',
    address: '',
    products_supplied: '',
    order_day: '',
    delivery_day: '',
    visit_day: '',
    order_cutoff_time: '',
    preferred_whatsapp_time: '',
    payment_terms: 'Net 30',
    payment_cycle_type: 'net',
    payment_due_days: '30',
    credit_limit: '',
    inactive_reason: '',
    auto_suggest_items: true,
    auto_reminders_enabled: true,
    status: 'active'
  });

  useEffect(() => {
    fetchDistributors();
  }, []);

  const parseContacts = (contacts) => {
    if (!contacts) return {};
    if (typeof contacts === 'object') return contacts;
    try {
      return JSON.parse(contacts);
    } catch (_) {
      return {};
    }
  };

  const fetchDistributors = async () => {
    try {
      setLoading(true);
      const data = await distributorsApi.getAll();
      setDistributors(data || []);
    } catch (err) {
      setError('Failed to load distributors');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (formData.phone && !isValidIndianPhone(formData.phone)) {
        setError(PHONE_POLICY_MESSAGE);
        return;
      }
      const distributorData = {
        name: formData.name.trim(),
        salesman_name: formData.salesman_name.trim(),
        contacts: JSON.stringify({
          phone: formData.phone ? normalizeIndianPhone(formData.phone) : '',
          email: formData.email
        }),
        address: formData.address.trim(),
        products_supplied: formData.products_supplied.trim(),
        order_day: formData.order_day,
        delivery_day: formData.delivery_day,
        visit_day: formData.visit_day,
        order_cutoff_time: formData.order_cutoff_time,
        preferred_whatsapp_time: formData.preferred_whatsapp_time,
        payment_terms: formData.payment_terms,
        payment_cycle_type: formData.payment_cycle_type,
        payment_due_days: formData.payment_due_days,
        credit_limit: formData.credit_limit,
        inactive_reason: formData.inactive_reason.trim(),
        auto_suggest_items: formData.auto_suggest_items,
        auto_reminders_enabled: formData.auto_reminders_enabled,
        status: formData.status
      };

      if (editingDistributor) {
        await distributorsApi.update(editingDistributor.id, distributorData);
      } else {
        await distributorsApi.create(distributorData);
      }

      setShowForm(false);
      setEditingDistributor(null);
      resetForm();
      fetchDistributors();
    } catch (err) {
      setError(err.message || 'Failed to save distributor');
    }
  };

  const handleEdit = (distributor) => {
    const contacts = parseContacts(distributor.contacts);
    
    setFormData({
      name: distributor.name || '',
      salesman_name: distributor.salesman_name || '',
      phone: contacts.phone || '',
      email: contacts.email || '',
      address: distributor.address || '',
      products_supplied: distributor.products_supplied || '',
      order_day: distributor.order_day || '',
      delivery_day: distributor.delivery_day || '',
      visit_day: distributor.visit_day || distributor.order_day || '',
      order_cutoff_time: distributor.order_cutoff_time || '',
      preferred_whatsapp_time: distributor.preferred_whatsapp_time || '',
      payment_terms: distributor.payment_terms || 'Net 30',
      payment_cycle_type: distributor.payment_cycle_type || 'net',
      payment_due_days: distributor.payment_due_days ? String(distributor.payment_due_days) : '30',
      credit_limit: distributor.credit_limit ? String(distributor.credit_limit) : '',
      inactive_reason: distributor.inactive_reason || '',
      auto_suggest_items: distributor.auto_suggest_items !== false,
      auto_reminders_enabled: distributor.auto_reminders_enabled !== false,
      status: distributor.status || 'active'
    });
    setEditingDistributor(distributor);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this distributor?')) return;

    try {
      await distributorsApi.delete(id);
      setDistributors(distributors.filter(d => d.id !== id));
    } catch (err) {
      setError('Failed to delete distributor');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      salesman_name: '',
      phone: '',
      email: '',
      address: '',
      products_supplied: '',
      order_day: '',
      delivery_day: '',
      visit_day: '',
      order_cutoff_time: '',
      preferred_whatsapp_time: '',
      payment_terms: 'Net 30',
      payment_cycle_type: 'net',
      payment_due_days: '30',
      credit_limit: '',
      inactive_reason: '',
      auto_suggest_items: true,
      auto_reminders_enabled: true,
      status: 'active'
    });
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingDistributor(null);
    resetForm();
  };

  const filteredDistributors = distributors.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.salesman_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.products_supplied?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    return status === 'active' 
      ? <span className="status-badge active">Active</span>
      : <span className="status-badge inactive">Inactive</span>;
  };

  if (loading) {
    return (
      <div className="distributor-management">
        <div className="loading">Loading distributors...</div>
      </div>
    );
  }

  return (
    <div className="distributor-management">
      <AdminPageHeader
        className="page-header"
        title="Distributor Management"
        actions={(
          <button className="admin-btn primary" onClick={() => setShowForm(true)}>
            <Plus size={20} /> Add Distributor
          </button>
        )}
      />

      {error && <div className="error-message">{error}</div>}

      {/* Search */}
      <div className="search-bar">
        <Search size={20} />
        <input
          type="text"
          id="distributor-search"
          name="distributor-search"
          placeholder="Search distributors by name, salesman, or products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Distributors Grid */}
      <div className="distributors-grid">
        {filteredDistributors.length === 0 ? (
          <div className="empty-state">
            <p>No distributors found.</p>
            <p>Click "Add Distributor" to create one.</p>
          </div>
        ) : (
          filteredDistributors.map(distributor => {
            const contacts = parseContacts(distributor.contacts);
            
            return (
              <div key={distributor.id} className="distributor-card fade-in-up">
                <div className="card-header">
                  <div className="distributor-name">
                    <h3>{distributor.name}</h3>
                    {getStatusBadge(distributor.status)}
                  </div>
                  <div className="card-actions">
                    <button className="action-btn edit" onClick={() => handleEdit(distributor)}>
                      <Edit size={16} />
                    </button>
                    <button className="action-btn delete" onClick={() => handleDelete(distributor.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="card-body">
                  {distributor.salesman_name && (
                    <div className="info-row">
                      <span className="label">Salesman:</span>
                      <span className="value">{distributor.salesman_name}</span>
                    </div>
                  )}

                  <div className="info-row">
                    <Phone size={14} />
                    <span>{contacts.phone || '-'}</span>
                  </div>

                  <div className="info-row">
                    <span className="label">Email:</span>
                    <span>{contacts.email || '-'}</span>
                  </div>

                  {distributor.address && (
                    <div className="info-row address">
                      <MapPin size={14} />
                      <span>{distributor.address}</span>
                    </div>
                  )}

                  {distributor.products_supplied && (
                    <div className="info-row">
                      <Package size={14} />
                      <span>{distributor.products_supplied}</span>
                    </div>
                  )}

                  <div className="info-row schedule">
                    <div className="schedule-item">
                      <Calendar size={14} />
                      <span>Order: {distributor.order_day || '-'}</span>
                    </div>
                    <div className="schedule-item">
                      <Calendar size={14} />
                      <span>Delivery: {distributor.delivery_day || '-'}</span>
                    </div>
                    <div className="schedule-item">
                      <Calendar size={14} />
                      <span>Visit: {distributor.visit_day || distributor.order_day || '-'}</span>
                    </div>
                  </div>

                  <div className="info-row">
                    <span className="label">Payment Terms:</span>
                    <span>{distributor.payment_terms || 'Net 30'}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Due Days:</span>
                    <span>{distributor.payment_due_days ?? '-'}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Cutoff / WhatsApp:</span>
                    <span>{distributor.order_cutoff_time || '-'} / {distributor.preferred_whatsapp_time || '-'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal-content fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingDistributor ? 'Edit Distributor' : 'Add New Distributor'}</h2>
              <button className="close-btn" onClick={handleClose}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-section">
                <h3 className="section-title">Basic Information</h3>
                
                <div className="form-group">
                  <label>Distributor Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter distributor name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Salesman Name</label>
                  <input
                    type="text"
                    name="salesman_name"
                    value={formData.salesman_name}
                    onChange={handleChange}
                    placeholder="Enter salesman name"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3 className="section-title">Contact Information</h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Enter phone number"
                    />
                  </div>

                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Enter email address"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Enter full address"
                    rows="2"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3 className="section-title">Business Details</h3>
                
                <div className="form-group">
                  <label>Products Supplied</label>
                  <input
                    type="text"
                    name="products_supplied"
                    value={formData.products_supplied}
                    onChange={handleChange}
                    placeholder="e.g., Coffee, Tea, Sugar, Biscuits"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Order Day</label>
                    <select name="order_day" value={formData.order_day} onChange={handleChange}>
                      <option value="">Select day</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Delivery Day</label>
                    <select name="delivery_day" value={formData.delivery_day} onChange={handleChange}>
                      <option value="">Select day</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Visit Day</label>
                    <select name="visit_day" value={formData.visit_day} onChange={handleChange}>
                      <option value="">Select day</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Order Cutoff Time</label>
                    <input
                      type="time"
                      name="order_cutoff_time"
                      value={formData.order_cutoff_time}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Preferred WhatsApp Time</label>
                    <input
                      type="time"
                      name="preferred_whatsapp_time"
                      value={formData.preferred_whatsapp_time}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Terms</label>
                    <select name="payment_terms" value={formData.payment_terms} onChange={handleChange}>
                      <option value="Cash on Delivery">Cash on Delivery</option>
                      <option value="Net 15">Net 15</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="Net 60">Net 60</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Cycle</label>
                    <select name="payment_cycle_type" value={formData.payment_cycle_type} onChange={handleChange}>
                      <option value="net">Net Terms</option>
                      <option value="cod">Cash / COD</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Payment Due Days</label>
                    <input
                      type="number"
                      min="0"
                      name="payment_due_days"
                      value={formData.payment_due_days}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Credit Limit</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="credit_limit"
                      value={formData.credit_limit}
                      onChange={handleChange}
                      placeholder="Optional credit cap"
                    />
                  </div>

                  <div className="form-group">
                    <label>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Inactive Reason</label>
                  <input
                    type="text"
                    name="inactive_reason"
                    value={formData.inactive_reason}
                    onChange={handleChange}
                    placeholder="Optional note for inactive vendors"
                  />
                </div>

                <div className="form-row">
                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      name="auto_suggest_items"
                      checked={formData.auto_suggest_items}
                      onChange={handleChange}
                    />
                    <span>Enable smart item suggestions</span>
                  </label>
                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      name="auto_reminders_enabled"
                      checked={formData.auto_reminders_enabled}
                      onChange={handleChange}
                    />
                    <span>Enable reminder warnings</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  {editingDistributor ? 'Update Distributor' : 'Add Distributor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistributorManagement;
