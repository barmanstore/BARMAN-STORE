import { CalendarDays } from 'lucide-react';
import { useRef } from 'react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import WindowModal from '../../../../../shared/components/window/WindowModal';
import { validateAmountInput } from '../../../../../shared/utils/amountExpression';
import { formatDate } from '../../../../../shared/utils/formatters';

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
  getOrderDisplayTotal,
}) => {
  const paymentDateInputRef = useRef(null);

  if (!showPoPaymentModal || !paymentOrder) return null;

  const currentBalance = Math.max(0, Number(getPoBalanceDue(paymentOrder)) || 0);
  const poTotal = Math.max(0, Number(getOrderDisplayTotal?.(paymentOrder)) || 0);
  const poNumber = String(paymentOrder.po_number || paymentOrder.invoice_number || '-').trim() || '-';
  const distributorName = paymentOrder.distributor_name || paymentOrder.supplier_name || '-';
  const totalLabel = formatCurrency(poTotal);
  const amountRaw = String(poPaymentFormData.amount || '').trim();
  const amountValidation = validateAmountInput(poPaymentFormData.amount, { max: currentBalance });
  const remainingBalance = amountRaw === ''
    ? currentBalance
    : amountValidation.valid
      ? Math.max(0, currentBalance - amountValidation.value)
      : currentBalance;

  const updatePaymentField = (field, value) => {
    setPoPaymentFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAmountChange = (e) => {
    updatePaymentField('amount', e.target.value);
  };

  const handleAmountBlur = () => {
    setPoPaymentFormData((prev) => {
      const nextRaw = String(prev.amount || '').trim();
      if (!nextRaw) return prev;
      const nextValidation = validateAmountInput(nextRaw, { max: currentBalance });
      if (!nextValidation.valid) return prev;
      return {
        ...prev,
        amount: nextValidation.value.toFixed(2),
      };
    });
  };

  const openPaymentDatePicker = () => {
    const input = paymentDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const renderCoreFields = (prefix) => (
    <>
      <div className="purchase-process-info-row" aria-label="Purchase payment info">
        <div className="purchase-process-info-item">
          <span className="purchase-process-info-label">PO #</span>
          <strong className="purchase-process-info-value">{poNumber}</strong>
        </div>
        <div className="purchase-process-info-item">
          <span className="purchase-process-info-label">Distributor</span>
          <strong className="purchase-process-info-value">{distributorName}</strong>
        </div>
        <div className="purchase-process-info-item purchase-process-info-item--total">
          <span className="purchase-process-info-label">Total</span>
          <strong className="purchase-process-info-value">{totalLabel}</strong>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-amount`}>Amount</label>
          <input
            id={`${prefix}-amount`}
            name="amount"
            type="text"
            inputMode="decimal"
            value={poPaymentFormData.amount}
            onChange={handleAmountChange}
            onBlur={handleAmountBlur}
            placeholder="Enter amount"
            autoComplete="off"
          />
          <div className="purchase-process-balance-note" aria-live="polite">
            <span>Remaining balance</span>
            <strong>{amountRaw && !amountValidation.valid ? amountValidation.message : formatCurrency(remainingBalance)}</strong>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={`${prefix}-payment-mode`}>Payment Mode</label>
          <select
            id={`${prefix}-payment-mode`}
            name="payment_mode"
            value={poPaymentFormData.payment_mode}
            onChange={(e) => updatePaymentField('payment_mode', e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
      </div>
      <details className="purchase-process-optional">
        <summary>Optional details</summary>
        <div className="purchase-process-optional-body">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor={`${prefix}-reference`}>Reference</label>
              <input
                id={`${prefix}-reference`}
                name="reference"
                type="text"
                value={poPaymentFormData.reference}
                onChange={(e) => updatePaymentField('reference', e.target.value)}
                placeholder="Bank ref / UPI ref"
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <div className="purchase-process-date-label">
                <label htmlFor={`${prefix}-transaction-date`}>Payment Date</label>
                <button
                  type="button"
                  className="purchase-process-date-btn"
                  onClick={openPaymentDatePicker}
                  aria-label="Open payment date picker"
                >
                  <CalendarDays size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="purchase-process-date-value">
                {formatDate(poPaymentFormData.transaction_date)}
              </div>
              <input
                ref={paymentDateInputRef}
                id={`${prefix}-transaction-date`}
                name="transaction_date"
                type="date"
                className="purchase-process-hidden-date-input"
                value={poPaymentFormData.transaction_date}
                onChange={(e) => updatePaymentField('transaction_date', e.target.value)}
                tabIndex={-1}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor={`${prefix}-notes`}>Notes</label>
            <textarea
              id={`${prefix}-notes`}
              name="notes"
              rows="2"
              value={poPaymentFormData.notes}
              onChange={(e) => updatePaymentField('notes', e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </div>
      </details>
    </>
  );

  const actionRow = (
    <div className="modal-actions purchase-process-actions">
      <button type="button" className="cancel-btn" onClick={closePoPaymentModal} disabled={poPaymentSubmitting}>
        Cancel
      </button>
      <button type="submit" className="submit-btn" disabled={poPaymentSubmitting}>
        {poPaymentSubmitting ? 'Saving...' : 'Save Payment'}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closePoPaymentModal}
        title="Add PO Payment"
        className="purchase-process-sheet"
        dismissible={!poPaymentSubmitting}
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
          {renderCoreFields('po-payment-mobile')}
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open
      title="Add PO Payment"
      onClose={closePoPaymentModal}
      dismissible={!poPaymentSubmitting}
      themeClassName="purchase-management"
      dialogClassName="purchase-modal-frame purchase-process-frame"
      headerClassName="purchase-modal-header"
      closeButtonClassName="purchase-modal-close-btn"
      initialSize={{ width: 720, height: 560 }}
    >
      <form onSubmit={handlePoPaymentSubmit}>
        {renderCoreFields('po-payment-desktop')}
        {actionRow}
      </form>
    </WindowModal>
  );
};

export default PoPaymentModal;
