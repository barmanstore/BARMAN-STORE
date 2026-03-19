import { X } from 'lucide-react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import WindowModal from '../../../../../shared/components/window/WindowModal';

const ProcessOrderModal = ({
  isMobile,
  showProcessModal,
  processingOrder,
  closeProcessModal,
  handleProcessSubmit,
  processSubmitting,
  processFormData,
  setProcessFormData,
  getDistributorName,
  getOrderDisplayTotal,
  formatCurrency,
}) => {
  if (!showProcessModal || !processingOrder) return null;

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closeProcessModal}
        title="Confirm Purchase Order"
        className="purchase-process-sheet"
        dismissible={!processSubmitting}
        actions={(
          <>
            <button type="button" className="cancel-btn" onClick={closeProcessModal} disabled={processSubmitting}>
              Cancel
            </button>
            <button type="submit" form="purchase-process-form" className="submit-btn" disabled={processSubmitting}>
              {processSubmitting ? 'Confirming...' : 'Confirm PO'}
            </button>
          </>
        )}
      >
        <form id="purchase-process-form" onSubmit={handleProcessSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-mobile-po-number">PO Number</label>
              <input id="process-mobile-po-number" name="po_number" type="text" value={processingOrder.po_number || '-'} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="process-mobile-distributor">Distributor</label>
              <input id="process-mobile-distributor" name="distributor_name" type="text" value={processingOrder.distributor_name || getDistributorName(processingOrder)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-mobile-total-amount">Total Amount</label>
              <input id="process-mobile-total-amount" name="total_amount" type="text" value={formatCurrency(getOrderDisplayTotal(processingOrder))} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="process-mobile-bill-number">Bill No *</label>
              <input
                id="process-mobile-bill-number"
                name="bill_number"
                type="text"
                value={processFormData.bill_number}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, bill_number: e.target.value }))}
                placeholder="Enter bill number"
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-mobile-paid-amount">Initial Paid Amount</label>
              <input
                id="process-mobile-paid-amount"
                name="paid_amount"
                type="number"
                step="0.01"
                min="0"
                value={processFormData.paid_amount}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, paid_amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label htmlFor="process-mobile-payment-mode">Payment Mode</label>
              <select
                id="process-mobile-payment-mode"
                name="payment_mode"
                value={processFormData.payment_mode}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-mobile-payment-date">Payment Date</label>
              <input
                id="process-mobile-payment-date"
                name="payment_date"
                type="date"
                value={processFormData.payment_date}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="process-mobile-payment-reference">Payment Reference</label>
              <input
                id="process-mobile-payment-reference"
                name="payment_reference"
                type="text"
                value={processFormData.payment_reference}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_reference: e.target.value }))}
                placeholder="Bank ref / UPI ref"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="process-mobile-payment-notes">Notes</label>
            <textarea
              id="process-mobile-payment-notes"
              name="payment_notes"
              rows="2"
              value={processFormData.payment_notes}
              onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_notes: e.target.value }))}
              placeholder="Optional payment note"
            />
          </div>
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open
      title="Confirm Purchase Order"
      onClose={closeProcessModal}
      dismissible={!processSubmitting}
      themeClassName="purchase-management"
      dialogClassName="modal-content"
      headerClassName="modal-header"
      closeButtonClassName="close-btn"
      initialSize={{ width: 760, height: 560 }}
    >
      <form onSubmit={handleProcessSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-desktop-po-number">PO Number</label>
              <input id="process-desktop-po-number" name="po_number" type="text" value={processingOrder.po_number || '-'} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="process-desktop-distributor">Distributor</label>
              <input id="process-desktop-distributor" name="distributor_name" type="text" value={processingOrder.distributor_name || getDistributorName(processingOrder)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-desktop-total-amount">Total Amount</label>
              <input id="process-desktop-total-amount" name="total_amount" type="text" value={formatCurrency(getOrderDisplayTotal(processingOrder))} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="process-desktop-bill-number">Bill No *</label>
              <input
                id="process-desktop-bill-number"
                name="bill_number"
                type="text"
                value={processFormData.bill_number}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, bill_number: e.target.value }))}
                placeholder="Enter bill number"
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-desktop-paid-amount">Initial Paid Amount</label>
              <input
                id="process-desktop-paid-amount"
                name="paid_amount"
                type="number"
                step="0.01"
                min="0"
                value={processFormData.paid_amount}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, paid_amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label htmlFor="process-desktop-payment-mode">Payment Mode</label>
              <select
                id="process-desktop-payment-mode"
                name="payment_mode"
                value={processFormData.payment_mode}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="process-desktop-payment-date">Payment Date</label>
              <input
                id="process-desktop-payment-date"
                name="payment_date"
                type="date"
                value={processFormData.payment_date}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="process-desktop-payment-reference">Payment Reference</label>
              <input
                id="process-desktop-payment-reference"
                name="payment_reference"
                type="text"
                value={processFormData.payment_reference}
                onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_reference: e.target.value }))}
                placeholder="Bank ref / UPI ref"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="process-desktop-payment-notes">Notes</label>
            <textarea
              id="process-desktop-payment-notes"
              name="payment_notes"
              rows="2"
              value={processFormData.payment_notes}
              onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_notes: e.target.value }))}
              placeholder="Optional payment note"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closeProcessModal} disabled={processSubmitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={processSubmitting}>
              {processSubmitting ? 'Confirming...' : 'Confirm PO'}
            </button>
          </div>
      </form>
    </WindowModal>
  );
};

export default ProcessOrderModal;

