import { X } from 'lucide-react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import WindowModal from '../../../../../shared/components/window/WindowModal';

const ReceiveInventoryModal = ({
  isMobile,
  showReceiveModal,
  selectedOrder,
  setShowReceiveModal,
  receiveSubmitting,
  handleReceiveSubmit,
  receiveData,
  setReceiveData,
  handleReceiveQtyStep,
  handleReceiveItemChange,
  formatCurrency,
  toNumber,
}) => {
  if (!showReceiveModal || !selectedOrder) return null;

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={() => setShowReceiveModal(false)}
        title={`Receive Inventory - ${selectedOrder.po_number}`}
        className="purchase-receive-sheet"
        dismissible={!receiveSubmitting}
        actions={(
          <>
            <button type="button" className="cancel-btn" onClick={() => setShowReceiveModal(false)} disabled={receiveSubmitting}>
              Cancel
            </button>
            <button type="submit" form="receive-inventory-form" className="submit-btn" disabled={receiveSubmitting}>
              {receiveSubmitting ? 'Saving...' : 'Confirm Receipt'}
            </button>
          </>
        )}
      >
        <form id="receive-inventory-form" onSubmit={handleReceiveSubmit} className="mobile-receive-form">
          <div className="form-section">
            <div className="form-group">
              <label htmlFor="receive-mobile-invoice-number">Invoice Number</label>
              <input
                id="receive-mobile-invoice-number"
                name="invoice_number"
                type="text"
                value={receiveData.invoice_number}
                onChange={e => setReceiveData(prev => ({ ...prev, invoice_number: e.target.value }))}
                placeholder="Enter invoice number"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Received Items</h3>
            <div className="mobile-receive-list">
              {receiveData.items.map((item, index) => (
                <div key={index} className="mobile-receive-item">
                  <div className="mobile-receive-row">
                    <strong>{item.product_name}</strong>
                    <span>Ordered: {item.ordered_quantity}</span>
                  </div>
                  <div className="mobile-receive-stepper">
                    <button
                      type="button"
                      className="mobile-stepper-btn"
                      onClick={() => handleReceiveQtyStep(index, -1)}
                      aria-label="Decrease received quantity"
                    >
                      -
                    </button>
                    <input
                      id={`receive-mobile-qty-${index}`}
                      name={`received_quantity_${index}`}
                      type="number"
                      min="0"
                      max={item.ordered_quantity}
                      value={item.received_quantity}
                      onChange={e => handleReceiveItemChange(index, 'received_quantity', Math.max(0, Math.min(toNumber(item.ordered_quantity), toNumber(e.target.value))))}
                    />
                    <button
                      type="button"
                      className="mobile-stepper-btn"
                      onClick={() => handleReceiveQtyStep(index, 1)}
                      aria-label="Increase received quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="mobile-receive-row">
                    <label htmlFor={`receive-mobile-unit-cost-${index}`}>Unit Cost</label>
                    <input
                      id={`receive-mobile-unit-cost-${index}`}
                      name={`unit_cost_${index}`}
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => handleReceiveItemChange(index, 'unit_price', toNumber(e.target.value))}
                    />
                  </div>
                  <div className="mobile-receive-row value">
                    <span>Value</span>
                    <strong>{formatCurrency(toNumber(item.received_quantity) * toNumber(item.unit_price))}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open
      title={`Receive Inventory - ${selectedOrder.po_number}`}
      onClose={() => setShowReceiveModal(false)}
      dismissible={!receiveSubmitting}
      themeClassName="purchase-management"
      dialogClassName="modal-content large"
      headerClassName="modal-header"
      closeButtonClassName="close-btn"
      initialSize={{ width: 980, height: 760 }}
      minWidth={700}
      minHeight={420}
    >
      <form id="receive-inventory-form" onSubmit={handleReceiveSubmit}>
          <div className="form-section">
            <div className="form-group">
              <label htmlFor="receive-desktop-invoice-number">Invoice Number</label>
              <input
                id="receive-desktop-invoice-number"
                name="invoice_number"
                type="text"
                value={receiveData.invoice_number}
                onChange={e => setReceiveData(prev => ({ ...prev, invoice_number: e.target.value }))}
                placeholder="Enter invoice number"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Received Items</h3>
            <div className="items-list">
              {receiveData.items.map((item, index) => (
                <div key={index} className="item-row">
                  <div className="item-field product">
                    <span className="field-label">Product</span>
                    <span>{item.product_name}</span>
                  </div>
                  <div className="item-field qty">
                    <span className="field-label">Ordered</span>
                    <span>{item.ordered_quantity}</span>
                  </div>
                  <div className="item-field qty">
                    <label htmlFor={`receive-desktop-qty-${index}`}>Received</label>
                    <input
                      id={`receive-desktop-qty-${index}`}
                      name={`received_quantity_${index}`}
                      type="number"
                      min="0"
                      max={item.ordered_quantity}
                      value={item.received_quantity}
                      onChange={e => handleReceiveItemChange(index, 'received_quantity', toNumber(e.target.value))}
                    />
                  </div>
                  <div className="item-field price">
                    <label htmlFor={`receive-desktop-unit-cost-${index}`}>Unit Cost</label>
                    <input
                      id={`receive-desktop-unit-cost-${index}`}
                      name={`unit_cost_${index}`}
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => handleReceiveItemChange(index, 'unit_price', toNumber(e.target.value))}
                    />
                  </div>
                  <div className="item-field total">
                    <span className="field-label">Value</span>
                    <span>{formatCurrency(toNumber(item.received_quantity) * toNumber(item.unit_price))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={() => setShowReceiveModal(false)} disabled={receiveSubmitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={receiveSubmitting}>
              {receiveSubmitting ? 'Saving...' : 'Confirm Receipt'}
            </button>
          </div>
      </form>
    </WindowModal>
  );
};

export default ReceiveInventoryModal;

