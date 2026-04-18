import ImageUrlPicker from '../../../../../shared/components/ImageUrlPicker';
import SafeProductImage from '../../../../../shared/components/product/SafeProductImage';

const ProductFormImageSection = ({ formData, loading, onImageChange }) => (
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
        <SafeProductImage
          src={formData.image}
          alt="Product preview"
          fallbackProduct={{
            name: formData.name,
            brand: formData.brand,
            category: formData.category,
          }}
        />
      </div>
    )}
  </div>
);

export default ProductFormImageSection;
