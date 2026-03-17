const ProductFormPricingSection = ({
  formData,
  errors,
  onChange,
  isQuickMode,
}) => (
  <div className="form-section">
    <h3 className="section-title">{isQuickMode ? 'Rates & Stock' : 'Pricing'}</h3>

    <div className="form-row">
      <div className="form-group">
        <label htmlFor="price">Selling Price (₹) *</label>
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
        <small className="field-help">For multiple variants use comma values, e.g. `5,10,50`. Content/Size and Stock auto-fill from this and stay editable.</small>
      </div>

      <div className="form-group">
        <label htmlFor="mrp">MRP (₹)</label>
        <input
          type="text"
          inputMode="decimal"
          id="mrp"
          name="mrp"
          value={formData.mrp}
          onChange={onChange}
          placeholder="0.00"
          className="input-field"
        />
        <small className="field-help">Optional comma values. If blank, each variant uses selling price as MRP.</small>
      </div>
    </div>

    {!isQuickMode && (
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="defaultDiscount">Discount</label>
          <input
            type="number"
            id="defaultDiscount"
            name="defaultDiscount"
            value={formData.defaultDiscount}
            onChange={onChange}
            placeholder="0"
            step="0.01"
            min="0"
            className="input-field"
          />
        </div>

        <div className="form-group">
          <label htmlFor="discountType">Discount Type</label>
          <select
            id="discountType"
            name="discountType"
            value={formData.discountType}
            onChange={onChange}
            className="input-field"
          >
            <option value="fixed">Fixed (₹)</option>
            <option value="percentage">Percentage (%)</option>
          </select>
        </div>
      </div>
    )}
  </div>
);

export default ProductFormPricingSection;
