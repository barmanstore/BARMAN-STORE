import { UOM_OPTIONS } from '../../utils/productFormOptions';

const ProductFormBasicSection = ({
  isQuickMode,
  formData,
  errors,
  categories,
  onChange,
  onSuggestDescription,
}) => {
  const uomValue = String(formData.uom || '').trim() || 'pcs';

  return (
    <div className="form-section">
      {!isQuickMode ? <h3 className="section-title">Basic Information</h3> : null}

    {!isQuickMode ? (
      <div className="form-group">
        <label htmlFor="name">Product Name *</label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={onChange}
          placeholder="Enter product name"
          className={`input-field ${errors.name ? 'error' : ''}`}
        />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>
    ) : (
      <div className="compact-product-grid">
        <div className="form-group compact-span-2">
          <label htmlFor="name">Product Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={onChange}
            placeholder="Enter product name"
            className={`input-field ${errors.name ? 'error' : ''}`}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>
        <div className="form-group compact-span-2">
          <label htmlFor="category">Category *</label>
          <input
            type="text"
            id="category"
            name="category"
            list="product-form-category-list"
            value={formData.category}
            onChange={onChange}
            placeholder="Groceries -> Dairy"
            className={`input-field ${errors.category ? 'error' : ''}`}
          />
          <datalist id="product-form-category-list">
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name} />
            ))}
          </datalist>
          {errors.category && <span className="field-error">{errors.category}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="brand">Brand</label>
          <input
            type="text"
            id="brand"
            name="brand"
            value={formData.brand}
            onChange={onChange}
            placeholder="Optional brand"
            className="input-field"
          />
        </div>

        <div className="form-group">
          <label htmlFor="price">Price *</label>
          <input
            type="text"
            inputMode="decimal"
            id="price"
            name="price"
            value={formData.price}
            onChange={onChange}
            placeholder="0.00"
            className={`input-field ${errors.price ? 'error' : ''}`}
          />
          {errors.price && <span className="field-error">{errors.price}</span>}
        </div>

        <div className="form-group compact-span-2">
          <label htmlFor="uom">UOM *</label>
          <input
            id="uom"
            name="uom"
            type="text"
            list="product-form-uom-list"
            value={uomValue || 'pcs'}
            onChange={onChange}
            className="input-field"
          />
          <datalist id="product-form-uom-list">
            {UOM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </datalist>
        </div>

        <div className="form-group compact-span-2">
          <label htmlFor="purchase_pack_size">Purchase Pack Size</label>
          <input
            type="number"
            id="purchase_pack_size"
            name="purchase_pack_size"
            min="0"
            step="1"
            value={formData.purchase_pack_size}
            onChange={onChange}
            placeholder="e.g., 12"
            className={`input-field ${errors.purchase_pack_size ? 'error' : ''}`}
          />
          {errors.purchase_pack_size && <span className="field-error">{errors.purchase_pack_size}</span>}
        </div>
      </div>
    )}

    {!isQuickMode && (
      <div className="form-group">
        <div className="description-header">
          <label htmlFor="description">Description *</label>
          <button type="button" className="suggest-description-btn" onClick={onSuggestDescription}>
            Suggest
          </button>
        </div>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={onChange}
          placeholder="Enter product description"
          rows="3"
          className={`input-field ${errors.description ? 'error' : ''}`}
        />
        <small className="field-help">Description is auto-suggested from product name. You can edit it anytime.</small>
        {errors.description && <span className="field-error">{errors.description}</span>}
      </div>
    )}

    {!isQuickMode && (
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="brand">Brand</label>
          <input
            type="text"
            id="brand"
            name="brand"
            value={formData.brand}
            onChange={onChange}
            placeholder="e.g., Nescafe, Parle"
            className="input-field"
          />
          <small className="field-help">Optional format: Parent {'->'} Child. Example: Dove {'->'} Baby Care.</small>
        </div>

        <div className="form-group">
          <label htmlFor="content">Content/Size</label>
          <input
            type="text"
            id="content"
            name="content"
            value={formData.content}
            onChange={onChange}
            placeholder="e.g., 250g, 1L, 500ml"
            className="input-field"
          />
          <small className="field-help">Multiple variants: use comma values, e.g. `250g,500g,1kg`.</small>
        </div>
      </div>
    )}

    {!isQuickMode && (
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="purchase_pack_size">Purchase Pack Size</label>
          <input
            type="number"
            id="purchase_pack_size"
            name="purchase_pack_size"
            min="0"
            step="1"
            value={formData.purchase_pack_size}
            onChange={onChange}
            placeholder="e.g., 12"
            className={`input-field ${errors.purchase_pack_size ? 'error' : ''}`}
          />
          <small className="field-help">Used for PO quantity step and SKU (format: P12).</small>
          {errors.purchase_pack_size && <span className="field-error">{errors.purchase_pack_size}</span>}
        </div>
      </div>
    )}

    {!isQuickMode && (
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="color">Color</label>
          <input
            type="text"
            id="color"
            name="color"
            value={formData.color}
            onChange={onChange}
            placeholder="e.g., Brown, White, Red"
            className="input-field"
          />
          <small className="field-help">Optional comma values for variants, e.g. `Red,Blue,Green`.</small>
        </div>

        <div className="form-group">
          <label htmlFor="category">Category *</label>
          <input
            type="text"
            id="category"
            name="category"
            list="product-form-category-list"
            value={formData.category}
            onChange={onChange}
            placeholder="e.g., Baby Products -> Haircare"
            className={`input-field ${errors.category ? 'error' : ''}`}
          />
          <datalist id="product-form-category-list">
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name} />
            ))}
          </datalist>
          <small className="field-help">Use Parent {'->'} Child for sub-category. Example: Baby Products {'->'} Haircare.</small>
          {errors.category && <span className="field-error">{errors.category}</span>}
        </div>
      </div>
    )}
    </div>
  );
};

export default ProductFormBasicSection;
