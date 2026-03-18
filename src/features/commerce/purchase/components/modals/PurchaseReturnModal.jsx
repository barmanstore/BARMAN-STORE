import { Plus, X } from 'lucide-react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';

const PurchaseReturnModal = ({
  isMobile,
  showReturnForm,
  closeReturnForm,
  returnSubmitting,
  handleReturnSubmit,
  returnFormData,
  setReturnFormData,
  handleReturnItemAdd,
  handleReturnItemChange,
  handleReturnItemRemove,
  distributors,
  products,
  findProductForItem,
  getAllowedPurchaseUnitsForProduct,
  resolvePurchaseUnitForProduct,
  toBaseQtyForProduct,
  toNumber,
  getProductUomProfile,
  formatCurrency,
}) => {
  if (!showReturnForm) return null;

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closeReturnForm}
        title="Create Purchase Return / Exchange"
        className="purchase-return-sheet"
        actions={(
          <>
            <button type="button" className="cancel-btn" onClick={closeReturnForm} disabled={returnSubmitting}>
              Cancel
            </button>
            <button type="submit" form="purchase-return-form" className="submit-btn" disabled={returnSubmitting}>
              {returnSubmitting ? 'Saving...' : 'Create Return'}
            </button>
          </>
        )}
      >
        <form id="purchase-return-form" onSubmit={handleReturnSubmit}>
          <div className="form-section">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="return-mobile-distributor">Distributor *</label>
                <select
                  id="return-mobile-distributor"
                  name="distributor_id"
                  value={returnFormData.distributor_id}
                  onChange={e => setReturnFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                  required
                >
                  <option value="">Select distributor</option>
                  {distributors.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="return-mobile-reference-po">Reference PO</label>
                <input
                  id="return-mobile-reference-po"
                  name="reference_po"
                  type="text"
                  value={returnFormData.reference_po}
                  onChange={e => setReturnFormData(prev => ({ ...prev, reference_po: e.target.value }))}
                  placeholder="Original PO number"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="return-mobile-return-type">Return Type</label>
                <select
                  id="return-mobile-return-type"
                  name="return_type"
                  value={returnFormData.return_type}
                  onChange={e => setReturnFormData(prev => ({ ...prev, return_type: e.target.value }))}
                >
                  <option value="return">Return</option>
                  <option value="exchange">Exchange</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="return-mobile-reason">Reason</label>
                <input
                  id="return-mobile-reason"
                  name="reason"
                  type="text"
                  value={returnFormData.reason}
                  onChange={e => setReturnFormData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Reason for return/exchange"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Return Items</h3>
              <button type="button" className="add-item-btn" onClick={handleReturnItemAdd}>
                <Plus size={16} /> Add Item
              </button>
            </div>
            <div className="items-list">
              {returnFormData.items.map((item, index) => {
                const selectedProduct = findProductForItem(products, item);
                const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                const selectedUom = resolvePurchaseUnitForProduct(
                  selectedProduct,
                  item.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
                );
                const quantityInBase = toBaseQtyForProduct(item.quantity, selectedUom, selectedProduct);
                const lineTotal = quantityInBase * Math.max(0, toNumber(item.unit_price));
                const baseUnitLabel = getProductUomProfile(selectedProduct).baseUnit;
                return (
                  <div key={index} className="item-row">
                    <div className="item-field product">
                      <label htmlFor={`return-mobile-product-${index}`}>Product</label>
                      <select
                        id={`return-mobile-product-${index}`}
                        name={`return_items_${index}_product_id`}
                        value={item.product_id}
                        onChange={e => handleReturnItemChange(index, 'product_id', e.target.value)}
                      >
                        <option value="">Select product</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                    </div>
                    <div className="item-field qty">
                      <label htmlFor={`return-mobile-qty-${index}`}>Qty</label>
                      <input
                        id={`return-mobile-qty-${index}`}
                        name={`return_items_${index}_quantity`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => handleReturnItemChange(index, 'quantity', parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="item-field uom">
                      <label htmlFor={`return-mobile-uom-${index}`}>UOM</label>
                      <select
                        id={`return-mobile-uom-${index}`}
                        name={`return_items_${index}_uom`}
                        value={selectedUom}
                        onChange={e => handleReturnItemChange(index, 'uom', e.target.value)}
                      >
                        {uomOptions.map((uomOption) => (
                          <option key={`return-item-${index}-uom-${uomOption}`} value={uomOption}>
                            {uomOption}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="item-field price">
                      <label htmlFor={`return-mobile-unit-price-${index}`}>{`Unit Price (per ${baseUnitLabel})`}</label>
                      <input
                        id={`return-mobile-unit-price-${index}`}
                        name={`return_items_${index}_unit_price`}
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={e => handleReturnItemChange(index, 'unit_price', parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="item-field total">
                      <span className="field-label">Total</span>
                      <span>{formatCurrency(lineTotal)}</span>
                    </div>
                    <button type="button" className="remove-item-btn" onClick={() => handleReturnItemRemove(index)}>
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <div className="modal-overlay" onClick={closeReturnForm}>
      <div className="modal-content large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Purchase Return / Exchange</h2>
          <button className="close-btn" onClick={closeReturnForm} disabled={returnSubmitting}>
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleReturnSubmit}>
          <div className="form-section">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="return-desktop-distributor">Distributor *</label>
                <select
                  id="return-desktop-distributor"
                  name="distributor_id"
                  value={returnFormData.distributor_id}
                  onChange={e => setReturnFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                  required
                >
                  <option value="">Select distributor</option>
                  {distributors.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="return-desktop-reference-po">Reference PO</label>
                <input
                  id="return-desktop-reference-po"
                  name="reference_po"
                  type="text"
                  value={returnFormData.reference_po}
                  onChange={e => setReturnFormData(prev => ({ ...prev, reference_po: e.target.value }))}
                  placeholder="Original PO number"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="return-desktop-return-type">Return Type</label>
                <select
                  id="return-desktop-return-type"
                  name="return_type"
                  value={returnFormData.return_type}
                  onChange={e => setReturnFormData(prev => ({ ...prev, return_type: e.target.value }))}
                >
                  <option value="return">Return</option>
                  <option value="exchange">Exchange</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="return-desktop-reason">Reason</label>
                <input
                  id="return-desktop-reason"
                  name="reason"
                  type="text"
                  value={returnFormData.reason}
                  onChange={e => setReturnFormData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Reason for return/exchange"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Return Items</h3>
              <button type="button" className="add-item-btn" onClick={handleReturnItemAdd}>
                <Plus size={16} /> Add Item
              </button>
            </div>
            <div className="items-list">
              {returnFormData.items.map((item, index) => {
                const selectedProduct = findProductForItem(products, item);
                const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                const selectedUom = resolvePurchaseUnitForProduct(
                  selectedProduct,
                  item.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
                );
                const quantityInBase = toBaseQtyForProduct(item.quantity, selectedUom, selectedProduct);
                const lineTotal = quantityInBase * Math.max(0, toNumber(item.unit_price));
                const baseUnitLabel = getProductUomProfile(selectedProduct).baseUnit;
                return (
                  <div key={index} className="item-row">
                    <div className="item-field product">
                      <label htmlFor={`return-desktop-product-${index}`}>Product</label>
                      <select
                        id={`return-desktop-product-${index}`}
                        name={`return_items_${index}_product_id`}
                        value={item.product_id}
                        onChange={e => handleReturnItemChange(index, 'product_id', e.target.value)}
                      >
                        <option value="">Select product</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                    </div>
                    <div className="item-field qty">
                      <label htmlFor={`return-desktop-qty-${index}`}>Qty</label>
                      <input
                        id={`return-desktop-qty-${index}`}
                        name={`return_items_${index}_quantity`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => handleReturnItemChange(index, 'quantity', parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="item-field uom">
                      <label htmlFor={`return-desktop-uom-${index}`}>UOM</label>
                      <select
                        id={`return-desktop-uom-${index}`}
                        name={`return_items_${index}_uom`}
                        value={selectedUom}
                        onChange={e => handleReturnItemChange(index, 'uom', e.target.value)}
                      >
                        {uomOptions.map((uomOption) => (
                          <option key={`return-item-${index}-uom-${uomOption}`} value={uomOption}>
                            {uomOption}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="item-field price">
                      <label htmlFor={`return-desktop-unit-price-${index}`}>{`Unit Price (per ${baseUnitLabel})`}</label>
                      <input
                        id={`return-desktop-unit-price-${index}`}
                        name={`return_items_${index}_unit_price`}
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={e => handleReturnItemChange(index, 'unit_price', parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="item-field total">
                      <span className="field-label">Total</span>
                      <span>{formatCurrency(lineTotal)}</span>
                    </div>
                    <button type="button" className="remove-item-btn" onClick={() => handleReturnItemRemove(index)}>
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closeReturnForm} disabled={returnSubmitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={returnSubmitting}>
              {returnSubmitting ? 'Saving...' : 'Create Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseReturnModal;

