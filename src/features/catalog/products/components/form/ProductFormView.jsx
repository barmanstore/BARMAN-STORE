import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import WindowModal from '../../../../../shared/components/window/WindowModal';
import ProductFormActions from './ProductFormActions';
import ProductFormBasicSection from './ProductFormBasicSection';
import ProductFormBatchSection from './ProductFormBatchSection';
import ProductFormImageSection from './ProductFormImageSection';
import ProductFormInventorySection from './ProductFormInventorySection';
import ProductFormPricingSection from './ProductFormPricingSection';
import ProductFormSkuSection from './ProductFormSkuSection';

const ProductFormView = ({
  isMobile,
  formHeading,
  isQuickMode,
  isEditing,
  error,
  formData,
  errors,
  categories,
  loading,
  showAdvancedFields,
  setShowAdvancedFields,
  visibleAdvancedFields,
  batchProducts,
  onClose,
  onSubmit,
  onChange,
  onSuggestDescription,
  onAddToBatch,
  onClearBatch,
  onRemoveBatchItem,
  onImageChange,
}) => {
  const formContent = (
    <>
      {error && <div className="error-message">{error}</div>}

      <form onSubmit={onSubmit} className={`product-form${isQuickMode ? ' compact-product-form' : ''}`}>
        {!isEditing && !isQuickMode && (
          <ProductFormBatchSection
            loading={loading}
            batchProducts={batchProducts}
            onAddToBatch={onAddToBatch}
            onClearBatch={onClearBatch}
            onRemoveBatchItem={onRemoveBatchItem}
          />
        )}

        {!isQuickMode && (
          <div className="advanced-fields-toggle">
            <button
              type="button"
              className="advanced-toggle-btn"
              onClick={() => setShowAdvancedFields((prev) => !prev)}
            >
              {showAdvancedFields ? 'Hide advanced fields' : 'Show advanced fields'}
            </button>
            <small className="field-help">Advanced: UOM conversion, SKU and barcode.</small>
          </div>
        )}

        <ProductFormBasicSection
          isQuickMode={isQuickMode}
          formData={formData}
          errors={errors}
          categories={categories}
          onChange={onChange}
          onSuggestDescription={onSuggestDescription}
        />

        {!isQuickMode && (
          <ProductFormPricingSection
            formData={formData}
            errors={errors}
            onChange={onChange}
            isQuickMode={isQuickMode}
          />
        )}

        {!isQuickMode && (
          <ProductFormInventorySection
            formData={formData}
            errors={errors}
            onChange={onChange}
            isQuickMode={isQuickMode}
            visibleAdvancedFields={visibleAdvancedFields}
          />
        )}

        {visibleAdvancedFields && (
          <ProductFormSkuSection
            formData={formData}
            onChange={onChange}
            isEditing={isEditing}
          />
        )}

        {!isQuickMode && (
          <ProductFormImageSection
            formData={formData}
            loading={loading}
            onImageChange={onImageChange}
          />
        )}

        <ProductFormActions
          loading={loading}
          isEditing={isEditing}
          isQuickMode={isQuickMode}
          batchCount={batchProducts.length}
          onClose={onClose}
        />
      </form>
    </>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        title={formHeading}
        onClose={onClose}
        dismissible={!loading}
        className={`product-form-sheet${isQuickMode ? ' product-form-sheet-compact' : ''}`}
      >
        {formContent}
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open
      title={formHeading}
      onClose={onClose}
      dismissible={!loading}
      dialogClassName={`product-form-container fade-in-up${isQuickMode ? ' compact' : ''}`}
      headerClassName="product-form-header"
      closeButtonClassName="close-btn"
      initialSize={{ width: isQuickMode ? 560 : 860, height: 760 }}
    >
      {formContent}
    </WindowModal>
  );
};

export default ProductFormView;

