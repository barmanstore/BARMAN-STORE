import { Plus, Trash2 } from 'lucide-react';

const ProductFormBatchSection = ({
  loading,
  batchProducts,
  onAddToBatch,
  onClearBatch,
  onRemoveBatchItem,
}) => (
  <div className="form-section batch-section">
    <h3 className="section-title">Batch Add Products</h3>
    <p className="batch-help">
      Fill product details and click <strong>Add To Batch</strong>. You can submit all queued products at once.
    </p>
    <div className="batch-actions">
      <button type="button" className="submit-btn batch-add-btn" onClick={onAddToBatch} disabled={loading}>
        <Plus size={16} /> Add To Batch
      </button>
    </div>
    {batchProducts.length > 0 && (
      <div className="batch-summary-bar">
        <span>{batchProducts.length} product(s) queued for one-click save</span>
        <button type="button" className="batch-clear-btn" onClick={onClearBatch}>
          Clear Queue
        </button>
      </div>
    )}
    {batchProducts.length > 0 && (
      <div className="batch-list">
        {batchProducts.map((item, index) => (
          <div key={`${item.name}-${index}`} className="batch-item">
            <div className="batch-item-info">
              <strong>{item.name}</strong>
              <span>{item.category} | Rs {Number(item.price || 0).toFixed(2)} | Stock: {item.stock}</span>
            </div>
            <button
              type="button"
              className="batch-item-remove"
              onClick={() => onRemoveBatchItem(index)}
              title="Remove"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default ProductFormBatchSection;
