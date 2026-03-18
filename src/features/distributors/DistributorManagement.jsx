import { useState, useEffect } from 'react';
import { distributorsApi } from '../../shared/services/api';
import { validateAmountInput } from '../../shared/utils/amountExpression';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../../shared/utils/phone';
import useLockBodyScroll from '../../shared/hooks/useLockBodyScroll';
import DistributorManagementView from './components/DistributorManagementView';
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
      const hasCreditLimit = String(formData.credit_limit || '').trim() !== '';
      const creditLimitResult = hasCreditLimit
        ? validateAmountInput(formData.credit_limit, { min: 0 })
        : { valid: true, value: '' };
      if (hasCreditLimit && !creditLimitResult.valid) {
        setError(creditLimitResult.message || 'Please enter a valid credit limit');
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
        credit_limit: hasCreditLimit ? Number(creditLimitResult.value) : '',
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

  return (
    <DistributorManagementView
      loading={loading}
      error={error}
      searchTerm={searchTerm}
      onSearchChange={(e) => setSearchTerm(e.target.value)}
      filteredDistributors={filteredDistributors}
      parseContacts={parseContacts}
      getStatusBadge={getStatusBadge}
      onAddDistributor={() => setShowForm(true)}
      onEditDistributor={handleEdit}
      onDeleteDistributor={handleDelete}
      showForm={showForm}
      onCloseForm={handleClose}
      formData={formData}
      onFormChange={handleChange}
      onFormSubmit={handleSubmit}
      editingDistributor={editingDistributor}
    />
  );
}

export default DistributorManagement;

