const ProductFormActions = ({ loading, isEditing, isQuickMode, batchCount, onClose }) => (
  <div className="form-actions">
    <button type="button" className="cancel-btn" onClick={onClose}>
      Cancel
    </button>
    <button type="submit" className="submit-btn" disabled={loading}>
      {loading
        ? 'Saving...'
        : isEditing
          ? 'Update Product'
          : isQuickMode
            ? 'Add Now'
            : `Add Product${batchCount ? ` (${batchCount} queued)` : ''}`}
    </button>
  </div>
);

export default ProductFormActions;
