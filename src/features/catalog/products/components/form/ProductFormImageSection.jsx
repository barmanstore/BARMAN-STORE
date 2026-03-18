import { getProductImageSrc } from '../../../../../shared/utils/productImage';
import ImageUrlPicker from '../../../../../shared/components/ImageUrlPicker';

const ProductFormImageSection = ({
  formData,
  loading,
  onImageChange,
}) => (
  <div className="form-section">
    <h3 className="section-title">Product Image</h3>

    <div className="form-group">
      <label htmlFor="image">Image URL</label>
      <ImageUrlPicker
        value={formData.image}
        disabled={loading}
        productMeta={{
          name: formData.name,
          brand: formData.brand,
          content: formData.content,
          category: formData.category,
        }}
        onChange={onImageChange}
      />
    </div>

    {formData.image && (
      <div className="image-preview">
        <img
          src={getProductImageSrc(formData.image)}
          alt="Product preview"
          onError={(e) => e.target.style.display = 'none'}
        />
      </div>
    )}
  </div>
);

export default ProductFormImageSection;

