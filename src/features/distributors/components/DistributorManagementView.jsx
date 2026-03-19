import React from 'react';
import { Plus, Edit, Trash2, Search, Phone, MapPin, Calendar, Package } from 'lucide-react';
import CalculatedAmountInput from '../../../shared/components/CalculatedAmountInput';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import WindowModal from '../../../shared/components/window/WindowModal';

const DistributorManagementView = ({
  loading,
  error,
  searchTerm,
  onSearchChange,
  filteredDistributors,
  parseContacts,
  getStatusBadge,
  onAddDistributor,
  onEditDistributor,
  onDeleteDistributor,
  showForm,
  onCloseForm,
  formData,
  onFormChange,
  onFormSubmit,
  editingDistributor,
}) => {
  if (loading) {
    return (
      <div className="distributor-management">
        <div className="loading">Loading distributors...</div>
      </div>
    );
  }

  return (
    <div className="distributor-management">
      <BackofficePageHeader
        className="page-header"
        title="Distributor Management"
        actions={(
          <button className="admin-btn primary" onClick={onAddDistributor}>
            <Plus size={20} /> Add Distributor
          </button>
        )}
      />

      {error && <div className="error-message">{error}</div>}

      <div className="search-bar">
        <Search size={20} />
        <input
          type="text"
          id="distributor-search"
          name="distributor-search"
          placeholder="Search distributors by name, salesman, or products..."
          value={searchTerm}
          onChange={onSearchChange}
        />
      </div>

      <div className="distributors-grid">
        {filteredDistributors.length === 0 ? (
          <div className="empty-state">
            <p>No distributors found.</p>
            <p>Click "Add Distributor" to create one.</p>
          </div>
        ) : (
          filteredDistributors.map((distributor) => {
            const contacts = parseContacts(distributor.contacts);

            return (
              <div key={distributor.id} className="distributor-card fade-in-up">
                <div className="card-header">
                  <div className="distributor-name">
                    <h3>{distributor.name}</h3>
                    {getStatusBadge(distributor.status)}
                  </div>
                  <div className="card-actions">
                    <button className="action-btn edit" onClick={() => onEditDistributor(distributor)}>
                      <Edit size={16} />
                    </button>
                    <button className="action-btn delete" onClick={() => onDeleteDistributor(distributor.id)}>
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

      {showForm && (
        <WindowModal
          open
          title={editingDistributor ? 'Edit Distributor' : 'Add New Distributor'}
          onClose={onCloseForm}
          dialogClassName="modal-content fade-in-up"
          headerClassName="modal-header"
          closeButtonClassName="close-btn"
          themeClassName="distributor-management"
          initialSize={{ width: 860, height: 760 }}
        >
          <form onSubmit={onFormSubmit}>
              <div className="form-section">
                <h3 className="section-title">Basic Information</h3>

                <div className="form-group">
                  <label>Distributor Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={onFormChange}
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
                    onChange={onFormChange}
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
                      onChange={onFormChange}
                      placeholder="Enter phone number"
                    />
                  </div>

                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={onFormChange}
                      placeholder="Enter email address"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={onFormChange}
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
                    onChange={onFormChange}
                    placeholder="e.g., Coffee, Tea, Sugar, Biscuits"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Order Day</label>
                    <select name="order_day" value={formData.order_day} onChange={onFormChange}>
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
                    <select name="delivery_day" value={formData.delivery_day} onChange={onFormChange}>
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
                    <select name="visit_day" value={formData.visit_day} onChange={onFormChange}>
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
                      onChange={onFormChange}
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
                      onChange={onFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Terms</label>
                    <select name="payment_terms" value={formData.payment_terms} onChange={onFormChange}>
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
                    <select name="payment_cycle_type" value={formData.payment_cycle_type} onChange={onFormChange}>
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
                      onChange={onFormChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Credit Limit</label>
                    <CalculatedAmountInput
                      id="distributor-credit-limit"
                      name="credit_limit"
                      min="0"
                      value={formData.credit_limit}
                      onValueChange={(nextValue) => onFormChange({ target: { name: 'credit_limit', value: nextValue, type: 'text' } })}
                      placeholder="Optional credit cap or expression"
                    />
                  </div>

                  <div className="form-group">
                    <label>Status</label>
                    <select name="status" value={formData.status} onChange={onFormChange}>
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
                    onChange={onFormChange}
                    placeholder="Optional note for inactive vendors"
                  />
                </div>

                <div className="form-row">
                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      name="auto_suggest_items"
                      checked={formData.auto_suggest_items}
                      onChange={onFormChange}
                    />
                    <span>Enable smart item suggestions</span>
                  </label>
                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      name="auto_reminders_enabled"
                      checked={formData.auto_reminders_enabled}
                      onChange={onFormChange}
                    />
                    <span>Enable reminder warnings</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={onCloseForm}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  {editingDistributor ? 'Update Distributor' : 'Add Distributor'}
                </button>
              </div>
          </form>
        </WindowModal>
      )}
    </div>
  );
};

export default DistributorManagementView;

