import { UOM_OPTIONS } from '../../utils/productFormOptions';

const ProductFormInventorySection = ({
  formData,
  errors,
  onChange,
  isQuickMode,
  visibleAdvancedFields,
}) => (
  <div className="form-section">
    <h3 className="section-title">Inventory</h3>

    <div className="form-row">
      <div className="form-group">
        <label htmlFor="stock">Stock Quantity *</label>
        <input
          type="text"
          inputMode="numeric"
          id="stock"
          name="stock"
          value={formData.stock}
          onChange={onChange}
          placeholder="0"
          className={`input-field ${errors.stock ? 'error' : ''}`}
        />
        {errors.stock && <span className="field-error">{errors.stock}</span>}
        <small className="field-help">
          Defaults to `0` per variant (e.g., `0,0,0`) and can be edited.
        </small>
      </div>

      {isQuickMode ? (
        <div className="form-group">
          <label htmlFor="uom">Unit</label>
          <select
            id="uom"
            name="uom"
            value={formData.uom}
            onChange={onChange}
            className="input-field"
          >
            {UOM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="form-group">
          <label htmlFor="base_unit">Base Unit</label>
          <select
            id="base_unit"
            name="base_unit"
            value={formData.base_unit}
            onChange={onChange}
            className="input-field"
          >
            {UOM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <small className="field-help">Primary unit for inventory</small>
        </div>
      )}
    </div>

    {!isQuickMode && (
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="uom">Selling UOM</label>
          <select
            id="uom"
            name="uom"
            value={formData.uom}
            onChange={onChange}
            className="input-field"
          >
            {UOM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="expiry_date">Expiry Date</label>
          <input
            type="date"
            id="expiry_date"
            name="expiry_date"
            value={formData.expiry_date}
            onChange={onChange}
            className="input-field"
          />
        </div>
      </div>
    )}

    {visibleAdvancedFields && (
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="uom_type">UOM Type</label>
          <select
            id="uom_type"
            name="uom_type"
            value={formData.uom_type}
            onChange={onChange}
            className="input-field"
          >
            <option value="selling">Selling Only</option>
            <option value="purchasing">Purchasing Only</option>
            <option value="both">Both Selling & Purchasing</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="conversion_factor">Conversion Factor</label>
          <input
            type="number"
            id="conversion_factor"
            name="conversion_factor"
            value={formData.conversion_factor}
            onChange={onChange}
            placeholder="1"
            step="0.0001"
            min="0"
            className={`input-field ${errors.conversion_factor ? 'error' : ''}`}
          />
          {errors.conversion_factor && (
            <span className="field-error">{errors.conversion_factor}</span>
          )}
          <small className="field-help">
            Selling units per base unit (e.g., 1000 when selling g and base is kg)
          </small>
        </div>
      </div>
    )}
  </div>
);

export default ProductFormInventorySection;
