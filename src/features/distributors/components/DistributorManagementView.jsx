import React from 'react';
import { Plus, Phone, MapPin, Calendar, Users } from 'lucide-react';
import CalculatedAmountInput from '../../../shared/components/CalculatedAmountInput';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import EmptyState from '../../../shared/components/EmptyState';
import SearchFilter from '../../../shared/components/filters/SearchFilter';
import WindowModal from '../../../shared/components/window/WindowModal';

const DistributorManagementView = ({
  loading,
  error,
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  distributorCards,
  parseContacts,
  getStatusBadge,
  onAddDistributor,
  onManageDistributor,
  onAddSupplier,
  onManageSupplier,
  showForm,
  onCloseForm,
  showSupplierForm,
  onCloseSupplierForm,
  formData,
  onFormChange,
  onFormSubmit,
  supplierFormData,
  onSupplierFormChange,
  onSupplierFormSubmit,
  supplierDistributorName,
  supplierDistributorOptions,
  canEditSupplierDistributor,
  editingDistributor,
  editingSupplier,
  managingDistributorCard,
  onCloseDistributorManager,
  onEditDistributorRecord,
  onToggleDistributorStatus,
  onRequestDeleteDistributor,
  managingSupplier,
  onCloseSupplierManager,
  onEditManagedSupplier,
  onToggleSupplierStatus,
  onRequestDeleteSupplier,
  deleteConfirmTarget,
  deleteConfirmText,
  onDeleteConfirmTextChange,
  onCloseDeleteConfirm,
  onConfirmDelete,
  pendingActionKey,
}) => {
  const getSupplierScheduleLabel = (supplier) => {
    if (supplier?.schedule_type === 'weekly') {
      return `Weekly${supplier?.schedule_day ? ` • ${supplier.schedule_day}` : ''}`;
    }
    if (supplier?.schedule_type === 'daily') return 'Daily';
    return 'Irregular';
  };

  const isDeleteConfirmReady =
    String(deleteConfirmText || '').trim() === String(deleteConfirmTarget?.label || '').trim();

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
        actions={
          <button className="admin-btn primary" onClick={onAddDistributor}>
            <Plus size={20} /> Add Distributor
          </button>
        }
      />

      {error && <div className="error-message">{error}</div>}

      <SearchFilter
        id="distributor-search"
        placeholder="Search distributors, suppliers, or product groups..."
        value={searchTerm}
        onChange={onSearchChange}
        onSubmit={onSearchSubmit}
        width="min(920px, 100%)"
        stretch
        className="distributor-search-filter"
        tone="sky"
        ariaLabel="Search distributors, suppliers, or product groups"
        ariaAutocomplete="none"
        submitAriaLabel="Search distributors, suppliers, or product groups"
      />

      <div className="distributors-grid">
        {distributorCards.length === 0 ? (
          <EmptyState
            title="No distributors found"
            description='Click "Add Distributor" to create one.'
          />
        ) : (
          distributorCards.map((card) => {
            const distributor = card.distributor;
            const contacts = parseContacts(distributor.contacts);

            return (
              <div key={card.key} className="distributor-card fade-in-up">
                <div className="card-header">
                  <div className="distributor-name">
                    <h3>{distributor.name}</h3>
                    {getStatusBadge(distributor.status)}
                    {card.hasDuplicateRecords ? (
                      <small className="empty-muted">
                        {card.distributorCount} distributor records grouped in one card
                      </small>
                    ) : null}
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="action-btn manage"
                      onClick={() => onManageDistributor(card)}
                    >
                      {card.hasDuplicateRecords ? 'Manage Records' : 'Manage'}
                    </button>
                  </div>
                </div>

                <div className="card-body">
                  <div className="card-summary">
                    <span className="summary-pill">{card.supplierCount} suppliers</span>
                    <span className="summary-pill">{distributor.payment_terms || 'Net 30'}</span>
                    {distributor.payment_due_days ? (
                      <span className="summary-pill">Due {distributor.payment_due_days}d</span>
                    ) : null}
                  </div>

                  <div className="info-row">
                    <Phone size={14} />
                    <span>{contacts.phone || '-'}</span>
                  </div>

                  {contacts.email ? (
                    <div className="info-row">
                      <span className="label">Email:</span>
                      <span className="truncate-text" title={contacts.email}>
                        {contacts.email}
                      </span>
                    </div>
                  ) : null}

                  {distributor.address && (
                    <div className="info-row address">
                      <MapPin size={14} />
                      <span className="truncate-text" title={distributor.address}>
                        {distributor.address}
                      </span>
                    </div>
                  )}

                  <div className="info-row schedule">
                    <Calendar size={14} />
                    <span>
                      Cutoff {distributor.order_cutoff_time || '-'}
                      {' • '}
                      WhatsApp {distributor.preferred_whatsapp_time || '-'}
                    </span>
                  </div>

                  <div className="info-row supplier-block">
                    <div className="label-row">
                      <span className="label">Suppliers</span>
                      <button
                        type="button"
                        className="action-btn add"
                        onClick={() =>
                          card.hasDuplicateRecords
                            ? onManageDistributor(card)
                            : onAddSupplier(distributor)
                        }
                      >
                        <Users size={14} />
                        {card.hasDuplicateRecords ? 'Select Record' : 'Add Supplier'}
                      </button>
                    </div>
                    {card.suppliers.length ? (
                      <div className="supplier-list">
                        {card.suppliers.map((supplier) => {
                          const scheduleLabel = getSupplierScheduleLabel(supplier);
                          const supplierMeta = [supplier.phone || '', scheduleLabel]
                            .filter(Boolean)
                            .join(' • ');
                          const suppliedProducts =
                            supplier.products_supplied || 'No supplied product group set';
                          return (
                            <div key={supplier.id} className="supplier-chip">
                              <div className="supplier-chip-copy">
                                <div className="supplier-chip-primary">
                                  <strong title={supplier.name}>
                                    {supplier.name}
                                    {supplier.is_primary ? ' (Primary)' : ''}
                                  </strong>
                                  <span className="supplier-chip-meta" title={supplierMeta || '-'}>
                                    {supplierMeta || '-'}
                                  </span>
                                </div>
                                <small className="supplier-group-text" title={suppliedProducts}>
                                  {suppliedProducts}
                                </small>
                              </div>
                              <div className="supplier-chip-actions">
                                <button
                                  type="button"
                                  className="action-btn manage"
                                  onClick={() => onManageSupplier(supplier)}
                                >
                                  Manage
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="empty-muted">
                        No suppliers yet. Add one to set schedule.
                      </span>
                    )}
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
          dialogClassName="distributor-modal-frame fade-in-up"
          headerClassName="distributor-modal-header"
          closeButtonClassName="distributor-modal-close-btn"
          themeClassName="distributor-management"
          initialSize={{ width: 860, height: 760 }}
        >
          <form onSubmit={onFormSubmit}>
            <div className="form-section">
              <h3 className="section-title">Basic Information</h3>

              <div className="form-group">
                <label htmlFor="distributor-name">Distributor Name *</label>
                <input
                  id="distributor-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={onFormChange}
                  placeholder="Enter distributor name"
                  required
                />
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Contact Information</h3>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="distributor-phone">Phone</label>
                  <input
                    id="distributor-phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={onFormChange}
                    placeholder="Enter phone number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="distributor-email">Email</label>
                  <input
                    id="distributor-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={onFormChange}
                    placeholder="Enter email address"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="distributor-address">Address</label>
                <textarea
                  id="distributor-address"
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

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="distributor-order-cutoff-time">Order Cutoff Time</label>
                  <input
                    id="distributor-order-cutoff-time"
                    type="time"
                    name="order_cutoff_time"
                    value={formData.order_cutoff_time}
                    onChange={onFormChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="distributor-preferred-whatsapp-time">
                    Preferred WhatsApp Time
                  </label>
                  <input
                    id="distributor-preferred-whatsapp-time"
                    type="time"
                    name="preferred_whatsapp_time"
                    value={formData.preferred_whatsapp_time}
                    onChange={onFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="distributor-payment-terms">Payment Terms</label>
                  <select
                    id="distributor-payment-terms"
                    name="payment_terms"
                    value={formData.payment_terms}
                    onChange={onFormChange}
                  >
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
                  <label htmlFor="distributor-payment-cycle-type">Payment Cycle</label>
                  <select
                    id="distributor-payment-cycle-type"
                    name="payment_cycle_type"
                    value={formData.payment_cycle_type}
                    onChange={onFormChange}
                  >
                    <option value="net">Net Terms</option>
                    <option value="cod">Cash / COD</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="distributor-payment-due-days">Payment Due Days</label>
                  <input
                    id="distributor-payment-due-days"
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
                  <label htmlFor="distributor-credit-limit">Credit Limit</label>
                  <CalculatedAmountInput
                    id="distributor-credit-limit"
                    name="credit_limit"
                    min="0"
                    value={formData.credit_limit}
                    onValueChange={(nextValue) =>
                      onFormChange({
                        target: { name: 'credit_limit', value: nextValue, type: 'text' },
                      })
                    }
                    placeholder="Optional credit cap or expression"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="distributor-status">Status</label>
                  <select
                    id="distributor-status"
                    name="status"
                    value={formData.status}
                    onChange={onFormChange}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="distributor-inactive-reason">Inactive Reason</label>
                <input
                  id="distributor-inactive-reason"
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

      {managingDistributorCard ? (
        <WindowModal
          open
          title={
            managingDistributorCard.hasDuplicateRecords
              ? 'Manage Distributor Records'
              : 'Manage Distributor'
          }
          onClose={onCloseDistributorManager}
          dialogClassName="distributor-modal-frame fade-in-up"
          headerClassName="distributor-modal-header"
          closeButtonClassName="distributor-modal-close-btn"
          themeClassName="distributor-management"
          initialSize={{ width: 760, height: 620 }}
        >
          <div className="manage-modal-copy">
            {managingDistributorCard.hasDuplicateRecords ? (
              <p>
                This card groups multiple distributor records with the same name. Choose the exact
                record before editing, adding a supplier, archiving, or deleting.
              </p>
            ) : (
              <p>
                Use archive for normal cleanup. Permanent delete is intentionally harder and the
                backend blocks it when suppliers or purchase history still exist.
              </p>
            )}
          </div>
          <div className="manage-record-list">
            {(Array.isArray(managingDistributorCard.records)
              ? managingDistributorCard.records
              : []
            ).map((record) => {
              const contacts = parseContacts(record.contacts);
              const statusText =
                String(record?.status || 'active').toLowerCase() === 'inactive'
                  ? 'Restore'
                  : 'Archive';
              return (
                <div key={record.id} className="manage-record-card">
                  <div className="manage-record-copy">
                    <div className="manage-record-title-row">
                      <strong>{record.name}</strong>
                      <span className="record-id">ID {record.id}</span>
                      {getStatusBadge(record.status)}
                    </div>
                    <small>
                      {contacts.phone || '-'}
                      {contacts.email ? ` • ${contacts.email}` : ''}
                    </small>
                    <small>
                      {record.supplier_count} supplier{record.supplier_count === 1 ? '' : 's'}
                      {' • '}
                      {record.payment_terms || 'Net 30'}
                      {record.payment_due_days ? ` • Due ${record.payment_due_days}d` : ''}
                    </small>
                  </div>
                  <div className="manage-record-actions">
                    <button
                      type="button"
                      className="action-btn manage"
                      onClick={() => onEditDistributorRecord(record)}
                      disabled={Boolean(pendingActionKey)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action-btn add"
                      onClick={() => onAddSupplier(record)}
                      disabled={Boolean(pendingActionKey)}
                    >
                      Add Supplier
                    </button>
                    <button
                      type="button"
                      className="action-btn archive"
                      onClick={() => onToggleDistributorStatus(record)}
                      disabled={Boolean(pendingActionKey)}
                    >
                      {statusText}
                    </button>
                    <button
                      type="button"
                      className="action-btn delete-text"
                      onClick={() => onRequestDeleteDistributor(record, record.supplier_count)}
                      disabled={Boolean(pendingActionKey)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onCloseDistributorManager}>
              Close
            </button>
          </div>
        </WindowModal>
      ) : null}

      {managingSupplier ? (
        <WindowModal
          open
          title="Manage Supplier"
          onClose={onCloseSupplierManager}
          dialogClassName="distributor-modal-frame fade-in-up"
          headerClassName="distributor-modal-header"
          closeButtonClassName="distributor-modal-close-btn"
          themeClassName="distributor-management"
          initialSize={{ width: 680, height: 460 }}
        >
          <div className="manage-modal-copy">
            <p>
              Supplier changes affect learned product groups and supplier routing. Prefer inactive
              status unless you are removing a brand-new unused supplier.
            </p>
          </div>
          <div className="manage-record-card supplier-manage-card">
            <div className="manage-record-copy">
              <div className="manage-record-title-row">
                <strong>{managingSupplier.name}</strong>
                {managingSupplier.is_primary ? <span className="record-id">Primary</span> : null}
                {managingSupplier.is_active === false ? (
                  <span className="status-badge inactive">Inactive</span>
                ) : (
                  <span className="status-badge active">Active</span>
                )}
              </div>
              <small>
                {[managingSupplier.phone || '', getSupplierScheduleLabel(managingSupplier)]
                  .filter(Boolean)
                  .join(' • ') || '-'}
              </small>
              <small
                className="manage-product-group"
                title={managingSupplier.products_supplied || 'No supplied product group set'}
              >
                {managingSupplier.products_supplied || 'No supplied product group set'}
              </small>
            </div>
            <div className="manage-record-actions">
              <button
                type="button"
                className="action-btn manage"
                onClick={() => onEditManagedSupplier(managingSupplier)}
                disabled={Boolean(pendingActionKey)}
              >
                Edit
              </button>
              <button
                type="button"
                className="action-btn archive"
                onClick={() => onToggleSupplierStatus(managingSupplier)}
                disabled={Boolean(pendingActionKey)}
              >
                {managingSupplier.is_active === false ? 'Restore' : 'Archive'}
              </button>
              <button
                type="button"
                className="action-btn delete-text"
                onClick={() => onRequestDeleteSupplier(managingSupplier)}
                disabled={Boolean(pendingActionKey)}
              >
                Delete
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onCloseSupplierManager}>
              Close
            </button>
          </div>
        </WindowModal>
      ) : null}

      {deleteConfirmTarget ? (
        <WindowModal
          open
          title={deleteConfirmTarget.title || 'Confirm Delete'}
          onClose={onCloseDeleteConfirm}
          dialogClassName="distributor-modal-frame fade-in-up"
          headerClassName="distributor-modal-header"
          closeButtonClassName="distributor-modal-close-btn"
          themeClassName="distributor-management"
          initialSize={{ width: 640, height: 360 }}
        >
          <div className="danger-confirmation">
            <p>{deleteConfirmTarget.description}</p>
            <p>
              Type <strong>{deleteConfirmTarget.label}</strong> to confirm permanent delete.
            </p>
            <div className="form-group">
              <label htmlFor="delete-confirm-input">Confirm Name</label>
              <input
                id="delete-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(event) => onDeleteConfirmTextChange(event.target.value)}
                placeholder={deleteConfirmTarget.label}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onCloseDeleteConfirm}>
              Cancel
            </button>
            <button
              type="button"
              className="submit-btn danger-submit"
              onClick={onConfirmDelete}
              disabled={!isDeleteConfirmReady || Boolean(pendingActionKey)}
            >
              Delete Permanently
            </button>
          </div>
        </WindowModal>
      ) : null}

      {showSupplierForm && (
        <WindowModal
          open
          title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
          onClose={onCloseSupplierForm}
          dialogClassName="distributor-modal-frame fade-in-up"
          headerClassName="distributor-modal-header"
          closeButtonClassName="distributor-modal-close-btn"
          themeClassName="distributor-management"
          initialSize={{ width: 720, height: 720 }}
        >
          <form onSubmit={onSupplierFormSubmit}>
            <div className="form-section">
              <h3 className="section-title">Supplier Details</h3>
              <div className="form-group">
                <label htmlFor="supplier-distributor-name">Distributor</label>
                {canEditSupplierDistributor ? (
                  <select
                    id="supplier-distributor-name"
                    name="distributor_id"
                    value={supplierFormData.distributor_id}
                    onChange={onSupplierFormChange}
                    required
                  >
                    <option value="">Select distributor</option>
                    {(Array.isArray(supplierDistributorOptions)
                      ? supplierDistributorOptions
                      : []
                    ).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      id="supplier-distributor-name"
                      type="text"
                      value={supplierDistributorName || 'Selected distributor'}
                      readOnly
                    />
                    <small className="empty-muted">
                      Current primary suppliers stay attached to their distributor. Reassign another
                      supplier instead.
                    </small>
                  </>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="supplier-name">Supplier Name *</label>
                <input
                  id="supplier-name"
                  type="text"
                  name="name"
                  value={supplierFormData.name}
                  onChange={onSupplierFormChange}
                  placeholder="Enter supplier name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="supplier-products-supplied">Supplied Product Groups</label>
                <textarea
                  id="supplier-products-supplied"
                  name="products_supplied"
                  value={supplierFormData.products_supplied}
                  onChange={onSupplierFormChange}
                  placeholder="Optional. Auto-updates from saved PO items for this supplier."
                  rows="3"
                />
                <small className="empty-muted">
                  Remove a product here if this supplier no longer delivers it. A future saved PO
                  for this supplier can add it back automatically.
                </small>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="supplier-phone">Phone</label>
                  <input
                    id="supplier-phone"
                    type="tel"
                    name="phone"
                    value={supplierFormData.phone}
                    onChange={onSupplierFormChange}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="supplier-alt-phone">Alt Phone</label>
                  <input
                    id="supplier-alt-phone"
                    type="tel"
                    name="alt_phone"
                    value={supplierFormData.alt_phone}
                    onChange={onSupplierFormChange}
                    placeholder="Optional alternate phone"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="supplier-schedule-type">Schedule Type</label>
                  <select
                    id="supplier-schedule-type"
                    name="schedule_type"
                    value={supplierFormData.schedule_type}
                    onChange={onSupplierFormChange}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="irregular">Irregular</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="supplier-schedule-day">Schedule Day</label>
                  <select
                    id="supplier-schedule-day"
                    name="schedule_day"
                    value={supplierFormData.schedule_day}
                    onChange={onSupplierFormChange}
                    disabled={supplierFormData.schedule_type !== 'weekly'}
                  >
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
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    name="is_primary"
                    checked={supplierFormData.is_primary}
                    onChange={onSupplierFormChange}
                  />
                  <span>Primary supplier for this distributor</span>
                </label>
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={supplierFormData.is_active}
                    onChange={onSupplierFormChange}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={onCloseSupplierForm}>
                Cancel
              </button>
              <button type="submit" className="submit-btn">
                {editingSupplier ? 'Update Supplier' : 'Add Supplier'}
              </button>
            </div>
          </form>
        </WindowModal>
      )}
    </div>
  );
};

export default DistributorManagementView;
