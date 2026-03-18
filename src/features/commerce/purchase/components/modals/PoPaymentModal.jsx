import { X } from 'lucide-react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import CalculatedAmountInput from '../../../../../shared/components/CalculatedAmountInput';

const PoPaymentModal = ({
  isMobile,
  showPoPaymentModal,
  paymentOrder,
  closePoPaymentModal,
  handlePoPaymentSubmit,
  poPaymentSubmitting,
  poPaymentFormData,
  setPoPaymentFormData,
  formatCurrency,
  getPoBalanceDue,
}) => {
  if (!showPoPaymentModal || !paymentOrder) return null;

  const currentBalance = getPoBalanceDue(paymentOrder);
  const currentBalanceValue = currentBalance > 0 ? currentBalance.toFixed(2) : '0.00';
  const currentBalanceLabel = formatCurrency(currentBalance);

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closePoPaymentModal}
        title="Add PO Payment"
        className="purchase-payment-sheet"
        actions={(
          <>
            <button type="button" className="cancel-btn" onClick={closePoPaymentModal} disabled={poPaymentSubmitting}>
              Cancel
            </button>
            <button type="submit" form="po-payment-form" className="submit-btn" disabled={poPaymentSubmitting}>
              {poPaymentSubmitting ? 'Saving...' : 'Save Payment'}
            </button>
          </>
        )}
      >
        <form id="po-payment-form" onSubmit={handlePoPaymentSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-payment-mobile-po-number">PO Number</label>
              <input id="po-payment-mobile-po-number" type="text" value={paymentOrder.po_number || '-'} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-payment-mobile-current-balance">Current Balance</label>
              <input id="po-payment-mobile-current-balance" type="text" value={currentBalanceLabel} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-payment-mobile-amount">Amount *</label>
              <CalculatedAmountInput
                id="po-payment-mobile-amount"
                name="amount"
                max={currentBalanceValue}
                value={poPaymentFormData.amount}
                onValueChange={(nextValue) => setPoPaymentFormData((prev) => ({ ...prev, amount: nextValue }))}
                placeholder="Enter amount or expression like (5+7)*100/35+56-25"
                required
                autoComplete="off"
              />
              <small>Max payable now: {currentBalanceLabel}</small>
            </div>
            <div className="form-group">
              <label htmlFor="po-payment-mobile-payment-mode">Payment Mode</label>
              <select
                id="po-payment-mobile-payment-mode"
                name="payment_mode"
                value={poPaymentFormData.payment_mode}
                onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
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
              <label htmlFor="po-payment-mobile-date">Date</label>
              <input
                id="po-payment-mobile-date"
                name="transaction_date"
                type="date"
                value={poPaymentFormData.transaction_date}
                onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="po-payment-mobile-reference">Reference</label>
              <input
                id="po-payment-mobile-reference"
                name="reference"
                type="text"
                value={poPaymentFormData.reference}
                onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Bank ref / UPI ref"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="po-payment-mobile-notes">Notes</label>
            <textarea
              id="po-payment-mobile-notes"
              name="notes"
              rows="2"
              value={poPaymentFormData.notes}
              onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional note"
            />
          </div>
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <div className="modal-overlay" onClick={closePoPaymentModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add PO Payment</h2>
          <button className="close-btn" onClick={closePoPaymentModal}>
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handlePoPaymentSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-payment-desktop-po-number">PO Number</label>
              <input id="po-payment-desktop-po-number" type="text" value={paymentOrder.po_number || '-'} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-payment-desktop-current-balance">Current Balance</label>
              <input id="po-payment-desktop-current-balance" type="text" value={currentBalanceLabel} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-payment-desktop-amount">Amount *</label>
              <CalculatedAmountInput
                id="po-payment-desktop-amount"
                name="amount"
                max={currentBalanceValue}
                value={poPaymentFormData.amount}
                onValueChange={(nextValue) => setPoPaymentFormData((prev) => ({ ...prev, amount: nextValue }))}
                placeholder="Enter amount or expression like (5+7)*100/35+56-25"
                required
                autoComplete="off"
              />
              <small>Max payable now: {currentBalanceLabel}</small>
            </div>
            <div className="form-group">
              <label htmlFor="po-payment-desktop-payment-mode">Payment Mode</label>
              <select
                id="po-payment-desktop-payment-mode"
                name="payment_mode"
                value={poPaymentFormData.payment_mode}
                onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
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
              <label htmlFor="po-payment-desktop-date">Date</label>
              <input
                id="po-payment-desktop-date"
                name="transaction_date"
                type="date"
                value={poPaymentFormData.transaction_date}
                onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="po-payment-desktop-reference">Reference</label>
              <input
                id="po-payment-desktop-reference"
                name="reference"
                type="text"
                value={poPaymentFormData.reference}
                onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Bank ref / UPI ref"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="po-payment-desktop-notes">Notes</label>
            <textarea
              id="po-payment-desktop-notes"
              name="notes"
              rows="2"
              value={poPaymentFormData.notes}
              onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional note"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closePoPaymentModal} disabled={poPaymentSubmitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={poPaymentSubmitting}>
              {poPaymentSubmitting ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PoPaymentModal;

