import { Package, QrCode } from 'lucide-react';

const ProductFormSkuSection = ({
  formData,
  onChange,
  isEditing,
}) => (
  <div className="form-section">
    <h3 className="section-title">SKU & Barcode</h3>

    <div className="form-row">
      <div className="form-group">
        <label htmlFor="sku">
          <Package size={16} /> SKU (Auto-generated)
        </label>
        <input
          type="text"
          id="sku"
          name="sku"
          value={formData.sku}
          onChange={onChange}
          placeholder="Auto-generated SKU"
          className="input-field"
          readOnly={!isEditing}
        />
        <small className="field-help">Format: Name[:4] + Brand[:4] + Content[:2] + Price[:4]. For multi-variant, comma SKUs are supported.</small>
      </div>

      <div className="form-group">
        <label htmlFor="barcode">
          <QrCode size={16} /> Barcode
        </label>
        <input
          type="text"
          id="barcode"
          name="barcode"
          value={formData.barcode}
          onChange={onChange}
          placeholder="Enter barcode (numeric)"
          className="input-field"
        />
      </div>
    </div>
  </div>
);

export default ProductFormSkuSection;
