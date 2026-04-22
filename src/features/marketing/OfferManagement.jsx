import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Gift, Plus, Sparkles, Target, X } from 'lucide-react';
import { categoriesApi, offersApi } from '../../shared/services/api';
import BackofficePageHeader from '../../shared/components/backoffice/BackofficePageHeader';
import OfferField from './components/OfferField';
import OfferLibraryTable from './components/OfferLibraryTable';
import OfferPreviewPanel from './components/OfferPreviewPanel';
import OfferProductSelector from './components/OfferProductSelector';
import {
  OFFER_TYPE_META,
  TABLE_FILTERS,
  SCHEDULE_MODES,
  applyScheduleModeToForm,
  buildOfferPreviewText,
  buildScheduleSummary,
  buildScopeSummary,
  buildValueSummary,
  createEmptyForm,
  extractCategoryNames,
  filterOffersByStatus,
  getOfferLifecycleStatus,
  getOfferStrengthMeta,
  getPotentialConflictWarnings,
  getOfferValidationIssues,
  isSimpleScopeType,
  mapOfferToForm,
  normalizeOfferForm,
  normalizeText,
  usesAdvancedProductRules,
  usesMinQuantity,
  usesValueField,
} from './utils/offerManagement';
import './OfferManagement.css';

const SCHEDULE_MODE_META = {
  none: {
    label: 'No Schedule',
    description: 'Offer stays available whenever status is active.',
  },
  date: {
    label: 'All Day',
    description: 'Use date-only boundaries for day-based promotions.',
  },
  datetime: {
    label: 'Specific Time',
    description: 'Use exact start and end timestamps.',
  },
};

function OfferManagement() {
  const [offers, setOffers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tableFilter, setTableFilter] = useState('all');
  const [form, setForm] = useState(() => createEmptyForm());

  const normalizedForm = useMemo(() => normalizeOfferForm(form), [form]);
  const typeMeta = useMemo(
    () => OFFER_TYPE_META[normalizedForm.type] || OFFER_TYPE_META.percentage,
    [normalizedForm.type]
  );
  const validationIssues = useMemo(
    () => getOfferValidationIssues(normalizedForm),
    [normalizedForm]
  );
  const conflictWarnings = useMemo(
    () => getPotentialConflictWarnings(normalizedForm, offers, editingId),
    [editingId, normalizedForm, offers]
  );
  const filteredOffers = useMemo(
    () => filterOffersByStatus(offers, tableFilter),
    [offers, tableFilter]
  );
  const stats = useMemo(
    () =>
      TABLE_FILTERS.reduce((acc, key) => {
        if (key === 'all') {
          acc[key] = offers.length;
          return acc;
        }
        acc[key] = offers.filter((offer) => getOfferLifecycleStatus(offer) === key).length;
        return acc;
      }, {}),
    [offers]
  );
  const previewTitle = useMemo(
    () => normalizedForm.name || 'Untitled Offer',
    [normalizedForm.name]
  );
  const previewText = useMemo(() => buildOfferPreviewText(normalizedForm), [normalizedForm]);
  const previewScope = useMemo(() => buildScopeSummary(normalizedForm), [normalizedForm]);
  const previewValue = useMemo(() => buildValueSummary(normalizedForm), [normalizedForm]);
  const previewSchedule = useMemo(
    () =>
      normalizedForm.schedule_mode === 'none' ? 'Any time' : buildScheduleSummary(normalizedForm),
    [normalizedForm]
  );
  const scheduleMode = normalizedForm.schedule_mode;
  const strengthMeta = useMemo(() => getOfferStrengthMeta(normalizedForm), [normalizedForm]);
  const canSubmit = validationIssues.length === 0 && !submitting;

  const resetForm = useCallback(() => {
    setForm(createEmptyForm());
    setEditingId(null);
    setError('');
  }, []);

  const refreshOffers = useCallback(async () => {
    const rows = await offersApi.getAll();
    setOffers(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadBootstrap = async () => {
      try {
        setLoading(true);
        setError('');
        const [rows, categoryRows] = await Promise.all([
          offersApi.getAll(),
          categoriesApi.getAll({ scope: 'all' }).catch(() => []),
        ]);
        if (!isActive) return;
        setOffers(Array.isArray(rows) ? rows : []);
        setCategories(extractCategoryNames(categoryRows));
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || 'Failed to load offers');
      } finally {
        if (isActive) setLoading(false);
      }
    };

    loadBootstrap();

    return () => {
      isActive = false;
    };
  }, []);

  const handleTextInputChange = useCallback((event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  }, []);

  const handleNumericInputChange = useCallback((event) => {
    const { name, valueAsNumber, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value === '' ? '' : Number.isNaN(valueAsNumber) ? '' : valueAsNumber,
    }));
    setError('');
  }, []);

  const handleTypeChange = useCallback((event) => {
    const nextType = normalizeText(event?.target?.value || '') || 'percentage';
    setForm((prev) => {
      if (nextType === 'bogo') {
        return {
          ...prev,
          type: nextType,
          value: 0,
          min_quantity: 1,
          apply_to_category: '',
          apply_to_product: null,
        };
      }

      if (nextType === 'bundle') {
        return {
          ...prev,
          type: nextType,
          value: Number(prev.value || 0) > 0 ? Number(prev.value) : 10,
          min_quantity: 1,
          apply_to_category: '',
          apply_to_product: null,
        };
      }

      return {
        ...prev,
        type: nextType,
        value: Number(prev.value || 0) > 0 ? Number(prev.value) : 10,
        min_quantity:
          nextType === 'volume'
            ? Math.max(2, Number(prev.min_quantity || 2) || 2)
            : Math.max(1, Number(prev.min_quantity || 1) || 1),
        apply_to_category: String(prev.apply_to_category || '').trim() || 'ALL',
        apply_to_product: prev.apply_to_product ? Number(prev.apply_to_product) : null,
        buy_product_id: null,
        buy_quantity: 1,
        get_product_id: null,
        get_quantity: 1,
      };
    });
    setError('');
  }, []);

  const handleCategoryChange = useCallback((event) => {
    const nextCategory = event.target.value;
    setForm((prev) => ({
      ...prev,
      apply_to_category: nextCategory,
      apply_to_product: nextCategory.trim() ? null : prev.apply_to_product,
    }));
    setError('');
  }, []);

  const handleScopeProductChange = useCallback((nextProductId) => {
    setForm((prev) => ({
      ...prev,
      apply_to_product: nextProductId,
      apply_to_category: nextProductId ? '' : prev.apply_to_category,
    }));
    setError('');
  }, []);

  const handleBuyProductChange = useCallback((nextProductId) => {
    setForm((prev) => ({ ...prev, buy_product_id: nextProductId }));
    setError('');
  }, []);

  const handleGetProductChange = useCallback((nextProductId) => {
    setForm((prev) => ({ ...prev, get_product_id: nextProductId }));
    setError('');
  }, []);

  const handleFirstOrderToggleChange = useCallback((event) => {
    setForm((prev) => ({ ...prev, first_order_only: Boolean(event.target.checked) }));
    setError('');
  }, []);

  const handleStatusToggleChange = useCallback((event) => {
    setForm((prev) => ({ ...prev, status: event.target.checked ? 'active' : 'inactive' }));
    setError('');
  }, []);

  const handleScheduleModeChange = useCallback((nextMode) => {
    setForm((prev) => applyScheduleModeToForm(prev, nextMode));
    setError('');
  }, []);

  const handleStorewideScope = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      apply_to_category: 'ALL',
      apply_to_product: null,
    }));
    setError('');
  }, []);

  const handleClearScope = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      apply_to_category: '',
      apply_to_product: null,
    }));
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (validationIssues.length > 0) {
        setError(validationIssues[0]);
        return;
      }

      setSubmitting(true);
      setError('');

      try {
        if (editingId) {
          await offersApi.update(editingId, normalizedForm);
        } else {
          await offersApi.create(normalizedForm);
        }
        resetForm();
        await refreshOffers();
      } catch (submitError) {
        setError(submitError.message || 'Failed to save offer');
      } finally {
        setSubmitting(false);
      }
    },
    [editingId, normalizedForm, refreshOffers, resetForm, validationIssues]
  );

  const handleEdit = useCallback((offer) => {
    setEditingId(Number(offer?.id || 0) || null);
    setForm(mapOfferToForm(offer));
    setError('');
  }, []);

  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm('Delete this offer? This cannot be undone from the offers screen.')) {
        return;
      }

      try {
        setError('');
        await offersApi.delete(id);
        setOffers((prev) => prev.filter((offer) => Number(offer?.id || 0) !== Number(id || 0)));
        if (Number(editingId || 0) === Number(id || 0)) {
          resetForm();
        }
      } catch (deleteError) {
        setError(deleteError.message || 'Failed to delete offer');
      }
    },
    [editingId, resetForm]
  );

  if (loading) {
    return (
      <div className="billing-content offer-management-page">
        <p>Loading offers...</p>
      </div>
    );
  }

  return (
    <div className="billing-content offer-management-page">
      <BackofficePageHeader
        title="Offer Management"
        subtitle="Create clearer promotions with guided logic, safer validation, and cleaner scheduling."
      />

      {error ? <div className="error-message">{error}</div> : null}

      <div className="offer-management-layout">
        <form onSubmit={handleSubmit} className="offer-editor-card">
          <div className="offer-editor-topbar">
            <div>
              <p className="offer-kicker">Admin Workflow</p>
              <h2>{editingId ? 'Edit Offer' : 'Create Offer'}</h2>
              <p className="offer-intro">{typeMeta.description}</p>
            </div>
            {editingId ? (
              <button type="button" className="billing-secondary-btn" onClick={resetForm}>
                <X size={16} />
                Cancel Edit
              </button>
            ) : null}
          </div>

          <section className="offer-section-card">
            <div className="offer-section-head">
              <div className="offer-section-icon">
                <Sparkles size={16} />
              </div>
              <div>
                <h3>Basic Info</h3>
                <p>Name the offer and define the main promotion type first.</p>
              </div>
            </div>

            <div className="offer-grid">
              <OfferField
                label="Offer Name"
                htmlFor="offer-name"
                hint="Keep it short and easy for staff to recognize later."
                required
              >
                <input
                  className="form-input"
                  id="offer-name"
                  name="name"
                  autoComplete="off"
                  value={form.name}
                  onChange={handleTextInputChange}
                  placeholder="Rangali Bihu Savings"
                  required
                />
              </OfferField>

              <OfferField
                label="Offer Type"
                htmlFor="offer-type"
                hint="The form changes automatically based on the offer type."
                required
              >
                <select
                  className="form-input"
                  id="offer-type"
                  name="type"
                  value={form.type}
                  onChange={handleTypeChange}
                >
                  <option value="percentage">Percentage Discount</option>
                  <option value="fixed">Fixed Discount</option>
                  <option value="volume">Volume Discount</option>
                  <option value="bogo">Buy X Get Y</option>
                  <option value="bundle">Bundle Discount</option>
                </select>
              </OfferField>

              <OfferField
                label="Description"
                htmlFor="offer-description"
                hint="Optional internal note for admins."
                wide
              >
                <textarea
                  className="form-input offer-textarea"
                  id="offer-description"
                  name="description"
                  value={form.description}
                  onChange={handleTextInputChange}
                  placeholder="Visible only inside admin to explain how this offer should be used."
                  rows={3}
                />
              </OfferField>
            </div>
          </section>

          <section className="offer-section-card">
            <div className="offer-section-head">
              <div className="offer-section-icon">
                <Gift size={16} />
              </div>
              <div>
                <h3>Discount Logic</h3>
                <p>Set the value, threshold, and scope for the customer-facing discount.</p>
              </div>
            </div>

            <div className="offer-grid">
              {usesValueField(form.type) ? (
                <OfferField
                  label={typeMeta.valueLabel}
                  htmlFor="offer-value"
                  hint={typeMeta.valueHint}
                  required
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-input"
                    id="offer-value"
                    name="value"
                    value={form.value}
                    onChange={handleNumericInputChange}
                  />
                </OfferField>
              ) : null}

              {usesMinQuantity(form.type) ? (
                <OfferField
                  label="Minimum Quantity"
                  htmlFor="offer-min-qty"
                  hint={typeMeta.minQuantityHint}
                >
                  <input
                    type="number"
                    min={form.type === 'volume' ? '2' : '1'}
                    step="1"
                    className="form-input"
                    id="offer-min-qty"
                    name="min_quantity"
                    value={form.min_quantity}
                    onChange={handleNumericInputChange}
                  />
                </OfferField>
              ) : null}

              {isSimpleScopeType(form.type) ? (
                <>
                  <OfferField
                    label="Apply To Category"
                    htmlFor="offer-apply-category"
                    hint={typeMeta.scopeHint}
                  >
                    <input
                      className="form-input"
                      id="offer-apply-category"
                      name="apply_to_category"
                      list="offer-category-options"
                      placeholder="ALL or category name"
                      value={form.apply_to_category}
                      onChange={handleCategoryChange}
                    />
                    <datalist id="offer-category-options">
                      <option value="ALL">All categories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </datalist>
                  </OfferField>

                  <OfferField
                    label="Apply To Product"
                    htmlFor="offer-apply-product"
                    hint="Search a product when the offer should target one exact SKU."
                  >
                    <OfferProductSelector
                      inputId="offer-apply-product"
                      value={form.apply_to_product}
                      onChange={handleScopeProductChange}
                      placeholder="Search a product to target directly"
                    />
                  </OfferField>

                  <div className="offer-inline-actions offer-field offer-field--wide">
                    <button
                      type="button"
                      className="billing-secondary-btn"
                      onClick={handleStorewideScope}
                    >
                      Storewide
                    </button>
                    <button
                      type="button"
                      className="billing-secondary-btn"
                      onClick={handleClearScope}
                    >
                      Clear Scope
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          {usesAdvancedProductRules(form.type) ? (
            <details className="offer-section-card offer-advanced-card" open>
              <summary className="offer-advanced-summary">
                <div className="offer-section-head">
                  <div className="offer-section-icon">
                    <Gift size={16} />
                  </div>
                  <div>
                    <h3>Advanced Rules</h3>
                    <p>Define the buy-product and reward-product pairing.</p>
                  </div>
                </div>
              </summary>

              <div className="offer-grid offer-advanced-grid">
                <OfferField
                  label="Buy Product"
                  htmlFor="offer-buy-product"
                  hint="Product that must be present in the basket."
                  required
                >
                  <OfferProductSelector
                    inputId="offer-buy-product"
                    value={form.buy_product_id}
                    onChange={handleBuyProductChange}
                    placeholder="Search the trigger product"
                  />
                </OfferField>

                <OfferField
                  label="Buy Quantity"
                  htmlFor="offer-buy-qty"
                  hint="How many buy items are needed to trigger the rule."
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="form-input"
                    id="offer-buy-qty"
                    name="buy_quantity"
                    value={form.buy_quantity}
                    onChange={handleNumericInputChange}
                  />
                </OfferField>

                <OfferField
                  label="Get Product"
                  htmlFor="offer-get-product"
                  hint="Reward product or discounted partner product."
                  required
                >
                  <OfferProductSelector
                    inputId="offer-get-product"
                    value={form.get_product_id}
                    onChange={handleGetProductChange}
                    placeholder="Search the reward product"
                  />
                </OfferField>

                <OfferField
                  label="Get Quantity"
                  htmlFor="offer-get-qty"
                  hint="How many reward units the customer receives."
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="form-input"
                    id="offer-get-qty"
                    name="get_quantity"
                    value={form.get_quantity}
                    onChange={handleNumericInputChange}
                  />
                </OfferField>
              </div>
            </details>
          ) : null}

          <section className="offer-section-card">
            <div className="offer-section-head">
              <div className="offer-section-icon">
                <CalendarClock size={16} />
              </div>
              <div>
                <h3>Schedule</h3>
                <p>
                  Choose one schedule mode so admins never mix all-day dates with exact timestamps.
                </p>
              </div>
            </div>

            <div className="offer-mode-row" role="tablist" aria-label="Offer schedule mode">
              {SCHEDULE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={classNames('offer-mode-chip', {
                    'is-active': scheduleMode === mode,
                  })}
                  onClick={() => handleScheduleModeChange(mode)}
                >
                  <strong>{SCHEDULE_MODE_META[mode].label}</strong>
                  <span>{SCHEDULE_MODE_META[mode].description}</span>
                </button>
              ))}
            </div>

            {scheduleMode === 'date' ? (
              <div className="offer-grid">
                <OfferField
                  label="Start Date"
                  htmlFor="offer-start-date"
                  hint="Optional date boundary for the first active day."
                >
                  <input
                    type="date"
                    className="form-input"
                    id="offer-start-date"
                    name="start_date"
                    value={form.start_date}
                    onChange={handleTextInputChange}
                  />
                </OfferField>

                <OfferField
                  label="End Date"
                  htmlFor="offer-end-date"
                  hint="Optional final active day."
                >
                  <input
                    type="date"
                    className="form-input"
                    id="offer-end-date"
                    name="end_date"
                    value={form.end_date}
                    onChange={handleTextInputChange}
                  />
                </OfferField>
              </div>
            ) : null}

            {scheduleMode === 'datetime' ? (
              <div className="offer-grid">
                <OfferField
                  label="Start Time"
                  htmlFor="offer-start-at"
                  hint="Optional exact start timestamp."
                >
                  <input
                    type="datetime-local"
                    className="form-input"
                    id="offer-start-at"
                    name="start_at"
                    value={form.start_at}
                    onChange={handleTextInputChange}
                  />
                </OfferField>

                <OfferField
                  label="End Time"
                  htmlFor="offer-end-at"
                  hint="Optional exact end timestamp."
                >
                  <input
                    type="datetime-local"
                    className="form-input"
                    id="offer-end-at"
                    name="end_at"
                    value={form.end_at}
                    onChange={handleTextInputChange}
                  />
                </OfferField>
              </div>
            ) : null}
          </section>

          <section className="offer-section-card">
            <div className="offer-section-head">
              <div className="offer-section-icon">
                <Target size={16} />
              </div>
              <div>
                <h3>Targeting</h3>
                <p>Control who sees the offer and whether it is currently active.</p>
              </div>
            </div>

            <div className="offer-toggle-grid">
              <label className="offer-toggle-card" htmlFor="offer-first-order-only">
                <div>
                  <strong>First Order Only</strong>
                  <span>Restrict this offer to first-time customers.</span>
                </div>
                <span className="offer-switch">
                  <input
                    id="offer-first-order-only"
                    name="first_order_only"
                    type="checkbox"
                    checked={Boolean(form.first_order_only)}
                    onChange={handleFirstOrderToggleChange}
                  />
                  <span className="offer-switch-slider" aria-hidden="true" />
                </span>
              </label>

              <label className="offer-toggle-card" htmlFor="offer-status-toggle">
                <div>
                  <strong>Status</strong>
                  <span>
                    {form.status === 'active'
                      ? 'Offer is live or will go live by schedule.'
                      : 'Offer stays disabled until you turn it on.'}
                  </span>
                </div>
                <span className="offer-switch">
                  <input
                    id="offer-status-toggle"
                    name="status_toggle"
                    type="checkbox"
                    checked={form.status === 'active'}
                    onChange={handleStatusToggleChange}
                  />
                  <span className="offer-switch-slider" aria-hidden="true" />
                </span>
              </label>
            </div>
          </section>

          <div className="offer-submit-row">
            <button type="submit" className="add-btn" disabled={!canSubmit}>
              <Plus size={16} />
              {submitting ? 'Saving...' : editingId ? 'Update Offer' : 'Add Offer'}
            </button>
            {!canSubmit ? (
              <span className="offer-submit-note">
                Resolve the validation items in the preview panel before saving.
              </span>
            ) : null}
          </div>
        </form>

        <OfferPreviewPanel
          previewTitle={previewTitle}
          previewText={previewText}
          previewScope={previewScope}
          previewValue={previewValue}
          previewSchedule={previewSchedule}
          strengthMeta={strengthMeta}
          validationIssues={validationIssues}
          conflictWarnings={conflictWarnings}
        />
      </div>

      <OfferLibraryTable
        filteredOffers={filteredOffers}
        stats={stats}
        tableFilter={tableFilter}
        tableFilters={TABLE_FILTERS}
        onFilterChange={setTableFilter}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default OfferManagement;
