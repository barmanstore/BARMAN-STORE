import { useCallback, useEffect, useMemo, useState } from 'react';
import { distributorsApi, suppliersApi } from '../../shared/services/api';
import { validateAmountInput } from '../../shared/utils/amountExpression';
import {
  isValidIndianPhone,
  normalizeIndianPhone,
  PHONE_POLICY_MESSAGE,
} from '../../shared/utils/phone';
import DistributorManagementView from './components/DistributorManagementView';
import './DistributorManagement.css';

function DistributorManagement() {
  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDistributor, setEditingDistributor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [managingDistributorCard, setManagingDistributorCard] = useState(null);
  const [managingSupplier, setManagingSupplier] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [pendingActionKey, setPendingActionKey] = useState('');
  const [supplierFormData, setSupplierFormData] = useState({
    distributor_id: '',
    name: '',
    phone: '',
    alt_phone: '',
    products_supplied: '',
    schedule_type: 'irregular',
    schedule_day: '',
    is_active: true,
    is_primary: false,
  });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    order_cutoff_time: '',
    preferred_whatsapp_time: '',
    payment_terms: 'Net 30',
    payment_cycle_type: 'net',
    payment_due_days: '30',
    credit_limit: '',
    inactive_reason: '',
    auto_suggest_items: true,
    auto_reminders_enabled: true,
    status: 'active',
  });

  const parseContacts = (contacts) => {
    if (!contacts) return {};
    if (typeof contacts === 'object') return contacts;
    try {
      return JSON.parse(contacts);
    } catch (_) {
      return {};
    }
  };

  const normalizeSupplierContactValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return String(value?.phone || '').trim();
    }
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return String(parsed?.phone || '').trim();
        }
      } catch (_) {
        return '';
      }
      return '';
    }
    return raw;
  };

  const normalizeSupplierRecord = (supplier) => ({
    ...supplier,
    phone: normalizeSupplierContactValue(supplier?.phone),
    alt_phone: normalizeSupplierContactValue(supplier?.alt_phone),
    products_supplied: String(supplier?.products_supplied || '').trim(),
  });

  const handleSearchSubmit = useCallback((value) => {
    setSearchTerm(String(value || ''));
  }, []);

  const buildSupplierProductGroupText = (products = []) => {
    const seen = new Set();
    return (Array.isArray(products) ? products : [])
      .map((product) => String(product?.name || product?.product_name || '').trim())
      .filter(Boolean)
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(', ');
  };

  const buildDistributorGroupKey = (distributor) => {
    const normalizedName = String(distributor?.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (normalizedName) return normalizedName;
    return `distributor:${String(distributor?.id || '')}`;
  };

  const buildDistributorOptionLabel = (distributor, duplicateCount = 1) => {
    const baseName =
      String(distributor?.name || '').trim() ||
      `Distributor ${String(distributor?.id || '').trim()}`;
    const suffixes = [];
    if (duplicateCount > 1 && distributor?.id) {
      suffixes.push(`ID ${distributor.id}`);
    }
    if (
      String(distributor?.status || 'active')
        .trim()
        .toLowerCase() !== 'active'
    ) {
      suffixes.push('Inactive');
    }
    return suffixes.length ? `${baseName} (${suffixes.join(' • ')})` : baseName;
  };

  const hydrateMissingSupplierProductGroups = useCallback(async (supplierRows = []) => {
    const missingSuppliers = (Array.isArray(supplierRows) ? supplierRows : [])
      .filter((supplier) => !String(supplier?.products_supplied || '').trim())
      .filter((supplier) => Number(supplier?.id || 0) > 0);
    if (!missingSuppliers.length) return;

    const derivedGroups = await Promise.all(
      missingSuppliers.map(async (supplier) => {
        try {
          const boardProducts = await suppliersApi.getProducts(supplier.id);
          return {
            supplierId: String(supplier.id),
            derivedGroup: buildSupplierProductGroupText(boardProducts),
          };
        } catch (_) {
          return {
            supplierId: String(supplier.id),
            derivedGroup: '',
          };
        }
      })
    );

    const derivedGroupBySupplierId = new Map(
      derivedGroups
        .filter((entry) => String(entry?.derivedGroup || '').trim())
        .map((entry) => [String(entry.supplierId), String(entry.derivedGroup).trim()])
    );
    if (!derivedGroupBySupplierId.size) return;

    setSuppliers((current) => {
      let changed = false;
      const next = (Array.isArray(current) ? current : []).map((supplier) => {
        const supplierId = String(supplier?.id || '');
        if (!supplierId || String(supplier?.products_supplied || '').trim()) {
          return supplier;
        }
        const derivedGroup = derivedGroupBySupplierId.get(supplierId);
        if (!derivedGroup) return supplier;
        changed = true;
        return {
          ...supplier,
          products_supplied: derivedGroup,
        };
      });
      return changed ? next : current;
    });
  }, []);

  const fetchDistributors = useCallback(async () => {
    try {
      setLoading(true);
      const data = await distributorsApi.getAll();
      setDistributors(data || []);
    } catch (err) {
      setError('Failed to load distributors');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await suppliersApi.getAll();
      const normalizedSuppliers = Array.isArray(data) ? data.map(normalizeSupplierRecord) : [];
      setSuppliers(normalizedSuppliers);
      void hydrateMissingSupplierProductGroups(normalizedSuppliers);
    } catch (err) {
      setError('Failed to load suppliers');
    }
  }, [hydrateMissingSupplierProductGroups]);

  useEffect(() => {
    void fetchDistributors();
    void fetchSuppliers();
  }, [fetchDistributors, fetchSuppliers]);

  useEffect(() => {
    if (!suppliers.length) return;
    void hydrateMissingSupplierProductGroups(suppliers);
  }, [hydrateMissingSupplierProductGroups, suppliers]);

  useEffect(() => {
    const handleRefresh = () => {
      void fetchDistributors();
      void fetchSuppliers();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };

    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchDistributors, fetchSuppliers]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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
        contacts: JSON.stringify({
          phone: formData.phone ? normalizeIndianPhone(formData.phone) : '',
          email: formData.email,
        }),
        address: formData.address.trim(),
        order_cutoff_time: formData.order_cutoff_time,
        preferred_whatsapp_time: formData.preferred_whatsapp_time,
        payment_terms: formData.payment_terms,
        payment_cycle_type: formData.payment_cycle_type,
        payment_due_days: formData.payment_due_days,
        credit_limit: hasCreditLimit ? Number(creditLimitResult.value) : '',
        inactive_reason: formData.inactive_reason.trim(),
        auto_suggest_items: formData.auto_suggest_items,
        auto_reminders_enabled: formData.auto_reminders_enabled,
        status: formData.status,
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
      phone: contacts.phone || '',
      email: contacts.email || '',
      address: distributor.address || '',
      order_cutoff_time: distributor.order_cutoff_time || '',
      preferred_whatsapp_time: distributor.preferred_whatsapp_time || '',
      payment_terms: distributor.payment_terms || 'Net 30',
      payment_cycle_type: distributor.payment_cycle_type || 'net',
      payment_due_days: distributor.payment_due_days ? String(distributor.payment_due_days) : '30',
      credit_limit: distributor.credit_limit ? String(distributor.credit_limit) : '',
      inactive_reason: distributor.inactive_reason || '',
      auto_suggest_items: distributor.auto_suggest_items !== false,
      auto_reminders_enabled: distributor.auto_reminders_enabled !== false,
      status: distributor.status || 'active',
    });
    setEditingDistributor(distributor);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      order_cutoff_time: '',
      preferred_whatsapp_time: '',
      payment_terms: 'Net 30',
      payment_cycle_type: 'net',
      payment_due_days: '30',
      credit_limit: '',
      inactive_reason: '',
      auto_suggest_items: true,
      auto_reminders_enabled: true,
      status: 'active',
    });
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingDistributor(null);
    resetForm();
  };

  const resetSupplierForm = () => {
    setSupplierFormData({
      distributor_id: '',
      name: '',
      phone: '',
      alt_phone: '',
      products_supplied: '',
      schedule_type: 'irregular',
      schedule_day: '',
      is_active: true,
      is_primary: false,
    });
  };

  const handleSupplierChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSupplierFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddSupplier = (distributor) => {
    handleCloseDistributorManager();
    handleCloseDeleteConfirm();
    resetSupplierForm();
    setSupplierFormData((prev) => ({
      ...prev,
      distributor_id: String(distributor?.id || ''),
      phone: parseContacts(distributor?.contacts).phone || '',
    }));
    setEditingSupplier(null);
    setShowSupplierForm(true);
  };

  const handleEditSupplier = (supplier) => {
    setSupplierFormData({
      distributor_id: String(supplier?.distributor_id || ''),
      name: supplier?.name || '',
      phone: normalizeSupplierContactValue(supplier?.phone),
      alt_phone: normalizeSupplierContactValue(supplier?.alt_phone),
      products_supplied: String(supplier?.products_supplied || '').trim(),
      schedule_type: supplier?.schedule_type || 'irregular',
      schedule_day: supplier?.schedule_day || '',
      is_active: supplier?.is_active !== false,
      is_primary: supplier?.is_primary === true,
    });
    setEditingSupplier(supplier);
    setShowSupplierForm(true);
  };

  const handleOpenDistributorManager = (card) => {
    setManagingDistributorCard(card || null);
  };

  const handleCloseDistributorManager = () => {
    setManagingDistributorCard(null);
  };

  const handleOpenSupplierManager = (supplier) => {
    setManagingSupplier(supplier || null);
  };

  const handleCloseSupplierManager = () => {
    setManagingSupplier(null);
  };

  const handleEditDistributorRecord = (distributor) => {
    handleCloseDistributorManager();
    handleEdit(distributor);
  };

  const handleEditManagedSupplier = (supplier) => {
    handleCloseSupplierManager();
    handleEditSupplier(supplier);
  };

  const handleCloseSupplierForm = () => {
    setShowSupplierForm(false);
    setEditingSupplier(null);
    resetSupplierForm();
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const distributorId = String(supplierFormData.distributor_id || '').trim();
      const supplierName = String(supplierFormData.name || '').trim();
      const productsSupplied = String(supplierFormData.products_supplied || '').trim();
      if (!distributorId) {
        setError('Select a distributor for this supplier.');
        return;
      }
      if (!supplierName) {
        setError('Supplier name is required.');
        return;
      }
      if (
        supplierFormData.schedule_type === 'weekly' &&
        !String(supplierFormData.schedule_day || '').trim()
      ) {
        setError('Select a weekly schedule day.');
        return;
      }
      if (supplierFormData.phone && !isValidIndianPhone(supplierFormData.phone)) {
        setError(PHONE_POLICY_MESSAGE);
        return;
      }
      const scheduleType = supplierFormData.schedule_type || 'irregular';
      const payload = {
        distributor_id: distributorId,
        name: supplierName,
        phone: supplierFormData.phone ? normalizeIndianPhone(supplierFormData.phone) : '',
        alt_phone: supplierFormData.alt_phone
          ? normalizeIndianPhone(supplierFormData.alt_phone)
          : '',
        products_supplied: productsSupplied,
        schedule_type: scheduleType,
        schedule_day: scheduleType === 'weekly' ? supplierFormData.schedule_day : null,
        is_active: supplierFormData.is_active,
        is_primary: supplierFormData.is_primary,
      };
      if (editingSupplier) {
        await suppliersApi.update(editingSupplier.id, payload);
      } else {
        await suppliersApi.create(payload);
      }

      await fetchSuppliers();
      handleCloseSupplierForm();
    } catch (err) {
      setError(err.message || 'Failed to save supplier');
    }
  };

  const handleToggleDistributorStatus = async (distributor) => {
    const distributorId = Number(distributor?.id || 0);
    if (!distributorId) return;
    const actionKey = `distributor-status:${distributorId}`;
    const nextStatus =
      String(distributor?.status || 'active').toLowerCase() === 'inactive' ? 'active' : 'inactive';
    setError('');
    setPendingActionKey(actionKey);
    try {
      await distributorsApi.update(distributorId, {
        status: nextStatus,
        inactive_reason:
          nextStatus === 'inactive'
            ? distributor?.inactive_reason || 'Archived from distributor management'
            : '',
      });
      await fetchDistributors();
      handleCloseDistributorManager();
    } catch (err) {
      setError(err.message || 'Failed to update distributor status');
    } finally {
      setPendingActionKey('');
    }
  };

  const handleToggleSupplierStatus = async (supplier) => {
    const supplierId = Number(supplier?.id || 0);
    if (!supplierId) return;
    const actionKey = `supplier-status:${supplierId}`;
    setError('');
    setPendingActionKey(actionKey);
    try {
      await suppliersApi.update(supplierId, {
        is_active: supplier?.is_active === false,
      });
      await fetchSuppliers();
      handleCloseSupplierManager();
    } catch (err) {
      setError(err.message || 'Failed to update supplier status');
    } finally {
      setPendingActionKey('');
    }
  };

  const handleRequestDeleteDistributor = (distributor, supplierCount = 0) => {
    const distributorId = Number(distributor?.id || 0);
    if (!distributorId) return;
    setDeleteConfirmText('');
    setDeleteConfirmTarget({
      kind: 'distributor',
      id: distributorId,
      label: String(distributor?.name || '').trim(),
      title: `Delete distributor record ${distributorId}`,
      description:
        supplierCount > 0
          ? `This record still has ${supplierCount} supplier${supplierCount === 1 ? '' : 's'}. Delete is expected to be blocked until those suppliers are moved or archived.`
          : 'This permanently removes the distributor record. Delete is also blocked if purchase-order history exists.',
    });
  };

  const handleRequestDeleteSupplier = (supplier) => {
    const supplierId = Number(supplier?.id || 0);
    if (!supplierId) return;
    setDeleteConfirmText('');
    setDeleteConfirmTarget({
      kind: 'supplier',
      id: supplierId,
      label: String(supplier?.name || '').trim(),
      title: `Delete supplier ${String(supplier?.name || '').trim() || supplierId}`,
      description: supplier?.is_primary
        ? 'Primary suppliers cannot be deleted until another supplier becomes primary.'
        : 'This permanently removes the supplier record. Delete is blocked when purchase history or learned supplier-product history exists.',
    });
  };

  const handleCloseDeleteConfirm = () => {
    setDeleteConfirmTarget(null);
    setDeleteConfirmText('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const expectedLabel = String(deleteConfirmTarget.label || '').trim();
    if (String(deleteConfirmText || '').trim() !== expectedLabel) {
      setError(`Type "${expectedLabel}" exactly to confirm delete.`);
      return;
    }
    const actionKey = `${deleteConfirmTarget.kind}-delete:${deleteConfirmTarget.id}`;
    setError('');
    setPendingActionKey(actionKey);
    try {
      if (deleteConfirmTarget.kind === 'distributor') {
        await distributorsApi.delete(deleteConfirmTarget.id);
        await fetchDistributors();
        await fetchSuppliers();
        handleCloseDistributorManager();
      } else {
        await suppliersApi.delete(deleteConfirmTarget.id);
        await fetchSuppliers();
        handleCloseSupplierManager();
      }
      handleCloseDeleteConfirm();
    } catch (err) {
      setError(err.message || `Failed to delete ${deleteConfirmTarget.kind}`);
    } finally {
      setPendingActionKey('');
    }
  };

  const distributorCards = useMemo(() => {
    const distributorById = new Map(
      distributors.map((distributor) => [String(distributor?.id || ''), distributor])
    );
    const groups = new Map();

    distributors.forEach((distributor) => {
      const key = buildDistributorGroupKey(distributor);
      const existing = groups.get(key);
      if (existing) {
        existing.distributors.push(distributor);
        return;
      }
      groups.set(key, {
        key,
        distributors: [distributor],
        suppliers: [],
      });
    });

    suppliers.forEach((supplier) => {
      const distributor = distributorById.get(String(supplier?.distributor_id || ''));
      if (!distributor) return;
      const key = buildDistributorGroupKey(distributor);
      const group = groups.get(key);
      if (!group) return;
      group.suppliers.push(supplier);
    });

    const supplierBuckets = new Map();
    suppliers.forEach((supplier) => {
      const distributorId = String(supplier?.distributor_id || '');
      if (!distributorId) return;
      if (!supplierBuckets.has(distributorId)) supplierBuckets.set(distributorId, []);
      supplierBuckets.get(distributorId).push(supplier);
    });

    return [...groups.values()]
      .map((group) => {
        const orderedDistributors = [...group.distributors].sort(
          (a, b) => Number(a?.id || 0) - Number(b?.id || 0)
        );
        const orderedSuppliers = [...group.suppliers].sort((a, b) => {
          const primaryDiff = Number(Boolean(b?.is_primary)) - Number(Boolean(a?.is_primary));
          if (primaryDiff !== 0) return primaryDiff;
          return String(a?.name || '').localeCompare(String(b?.name || ''));
        });
        const representativeDistributor = orderedDistributors[0] || null;
        const records = orderedDistributors.map((entry) => ({
          ...entry,
          supplier_count: Number((supplierBuckets.get(String(entry?.id || '')) || []).length),
        }));
        return {
          key: group.key,
          distributor: representativeDistributor,
          suppliers: orderedSuppliers,
          supplierCount: orderedSuppliers.length,
          hasDuplicateRecords: orderedDistributors.length > 1,
          distributorCount: orderedDistributors.length,
          distributorIds: orderedDistributors
            .map((entry) => Number(entry?.id || 0))
            .filter(Boolean),
          records,
        };
      })
      .sort((a, b) =>
        String(a?.distributor?.name || '').localeCompare(String(b?.distributor?.name || ''))
      );
  }, [distributors, suppliers]);

  const supplierDistributorName = useMemo(() => {
    const distributorId = String(supplierFormData?.distributor_id || '').trim();
    if (!distributorId) return '';
    const distributor = distributors.find((entry) => String(entry?.id || '') === distributorId);
    return distributor?.name || '';
  }, [distributors, supplierFormData?.distributor_id]);

  const supplierDistributorOptions = useMemo(() => {
    const duplicateCounts = new Map();
    distributors.forEach((distributor) => {
      const key = buildDistributorGroupKey(distributor);
      duplicateCounts.set(key, Number(duplicateCounts.get(key) || 0) + 1);
    });
    return [...distributors]
      .sort((a, b) => {
        const nameDiff = String(a?.name || '').localeCompare(String(b?.name || ''));
        if (nameDiff !== 0) return nameDiff;
        return Number(a?.id || 0) - Number(b?.id || 0);
      })
      .map((distributor) => ({
        value: String(distributor?.id || ''),
        label: buildDistributorOptionLabel(
          distributor,
          Number(duplicateCounts.get(buildDistributorGroupKey(distributor)) || 0)
        ),
      }));
  }, [distributors]);

  const canEditSupplierDistributor = !editingSupplier || editingSupplier?.is_primary !== true;

  const filteredDistributorCards = distributorCards.filter((card) => {
    const term = searchTerm.toLowerCase();
    const distributorName = String(card?.distributor?.name || '').toLowerCase();
    const supplierLabels = (Array.isArray(card?.suppliers) ? card.suppliers : [])
      .map((supplier) =>
        String(supplier?.name || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
    const supplierProductGroups = (Array.isArray(card?.suppliers) ? card.suppliers : [])
      .map((supplier) =>
        String(supplier?.products_supplied || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
    return (
      distributorName.includes(term) ||
      supplierLabels.some((name) => name.includes(term)) ||
      supplierProductGroups.some((group) => group.includes(term))
    );
  });

  const getStatusBadge = (status) => {
    return status === 'active' ? (
      <span className="status-badge active">Active</span>
    ) : (
      <span className="status-badge inactive">Inactive</span>
    );
  };

  return (
    <DistributorManagementView
      loading={loading}
      error={error}
      searchTerm={searchTerm}
      onSearchChange={(value) => setSearchTerm(value)}
      onSearchSubmit={handleSearchSubmit}
      distributorCards={filteredDistributorCards}
      parseContacts={parseContacts}
      getStatusBadge={getStatusBadge}
      onAddDistributor={() => setShowForm(true)}
      onManageDistributor={handleOpenDistributorManager}
      onAddSupplier={handleAddSupplier}
      onManageSupplier={handleOpenSupplierManager}
      showForm={showForm}
      onCloseForm={handleClose}
      showSupplierForm={showSupplierForm}
      onCloseSupplierForm={handleCloseSupplierForm}
      formData={formData}
      onFormChange={handleChange}
      onFormSubmit={handleSubmit}
      supplierFormData={supplierFormData}
      onSupplierFormChange={handleSupplierChange}
      onSupplierFormSubmit={handleSupplierSubmit}
      supplierDistributorName={supplierDistributorName}
      supplierDistributorOptions={supplierDistributorOptions}
      canEditSupplierDistributor={canEditSupplierDistributor}
      editingDistributor={editingDistributor}
      editingSupplier={editingSupplier}
      managingDistributorCard={managingDistributorCard}
      onCloseDistributorManager={handleCloseDistributorManager}
      onEditDistributorRecord={handleEditDistributorRecord}
      onToggleDistributorStatus={handleToggleDistributorStatus}
      onRequestDeleteDistributor={handleRequestDeleteDistributor}
      managingSupplier={managingSupplier}
      onCloseSupplierManager={handleCloseSupplierManager}
      onEditManagedSupplier={handleEditManagedSupplier}
      onToggleSupplierStatus={handleToggleSupplierStatus}
      onRequestDeleteSupplier={handleRequestDeleteSupplier}
      deleteConfirmTarget={deleteConfirmTarget}
      deleteConfirmText={deleteConfirmText}
      onDeleteConfirmTextChange={setDeleteConfirmText}
      onCloseDeleteConfirm={handleCloseDeleteConfirm}
      onConfirmDelete={handleConfirmDelete}
      pendingActionKey={pendingActionKey}
    />
  );
}

export default DistributorManagement;
