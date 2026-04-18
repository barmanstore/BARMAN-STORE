import { CalendarDays } from 'lucide-react';
import { useRef } from 'react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import WindowModal from '../../../../../shared/components/window/WindowModal';
import { formatDate } from '../../../../../shared/utils/formatters';

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
  const paymentDateInputRef = useRef(null);

  if (!showProcessModal || !processingOrder) return null;

  const poTotal = Math.max(0, getOrderDisplayTotal(processingOrder));
  const poNumber =
    String(processingOrder.po_number || processingOrder.invoice_number || '-').trim() || '-';
  const distributorName =
    processingOrder.distributor_name || getDistributorName(processingOrder) || '-';
  const paymentSplit = String(processFormData.payment_split || 'part')
    .trim()
    .toLowerCase();
  const isDelivered = Boolean(processFormData.delivered);
  const paidAmountRaw = String(processFormData.paid_amount || '').trim();
  const paidAmountNumber =
    paidAmountRaw === ''
      ? 0
      : Math.min(Math.max(0, Number.parseFloat(paidAmountRaw) || 0), poTotal);
  const remainingBalance = Math.max(0, poTotal - paidAmountNumber);
  const isFullPayment = paymentSplit === 'full' || paidAmountNumber >= poTotal;

  const updateProcessField = (field, value) => {
    setProcessFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePaidAmountChange = (e) => {
    const rawValue = e.target.value;
    const sanitizedValue = rawValue.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    if (sanitizedValue === '') {
      setProcessFormData((prev) => ({
        ...prev,
        paid_amount: '',
        payment_split: 'part',
      }));
      return;
    }

    const nextAmount = Math.min(Math.max(0, Number.parseFloat(sanitizedValue) || 0), poTotal);
    setProcessFormData((prev) => ({
      ...prev,
      paid_amount: sanitizedValue,
      payment_split: poTotal > 0 && nextAmount >= poTotal ? 'full' : 'part',
    }));
  };

  const handlePaidAmountBlur = () => {
    setProcessFormData((prev) => {
      const nextAmount = String(prev.paid_amount || '').trim();
      if (nextAmount === '') {
        return prev;
      }
      const parsedAmount = Math.min(Math.max(0, Number.parseFloat(nextAmount) || 0), poTotal);
      return {
        ...prev,
        paid_amount: parsedAmount.toFixed(2),
        payment_split: poTotal > 0 && parsedAmount >= poTotal ? 'full' : 'part',
      };
    });
  };

  const handlePaymentSplitChange = (nextSplit) => {
    setProcessFormData((prev) => {
      const nextState = { ...prev, payment_split: nextSplit };
      if (nextSplit === 'full') {
        nextState.paid_amount = poTotal.toFixed(2);
      } else if (
        poTotal > 0 &&
        Math.max(0, Number.parseFloat(prev.paid_amount || 0) || 0) >= poTotal
      ) {
        nextState.paid_amount = '';
      }
      return nextState;
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
      <div className="purchase-process-info-row" aria-label="Purchase order info">
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
          <strong className="purchase-process-info-value">{formatCurrency(poTotal)}</strong>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor={`${prefix}-bill-number`}>Bill No</label>
        <input
          id={`${prefix}-bill-number`}
          name="bill_number"
          type="text"
          value={processFormData.bill_number}
          onChange={(e) => updateProcessField('bill_number', e.target.value)}
          placeholder="Enter bill no"
        />
      </div>
      <div className="form-group">
        <label>Payment</label>
        <div className="purchase-process-split-toggle" role="group" aria-label="Payment split">
          <button
            type="button"
            className={`purchase-process-split-btn${isFullPayment ? ' active' : ''}`}
            aria-pressed={isFullPayment}
            onClick={() => handlePaymentSplitChange('full')}
          >
            Full paid
          </button>
          <button
            type="button"
            className={`purchase-process-split-btn${!isFullPayment ? ' active' : ''}`}
            aria-pressed={!isFullPayment}
            onClick={() => handlePaymentSplitChange('part')}
          >
            Part paid
          </button>
        </div>
      </div>
      <div className="form-group">
        <label className="purchase-process-delivered-toggle">
          <input
            type="checkbox"
            checked={isDelivered}
            onChange={(event) => updateProcessField('delivered', event.target.checked)}
          />
          <span>Mark as delivered</span>
        </label>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-paid-amount`}>Paid Amount</label>
          <input
            id={`${prefix}-paid-amount`}
            name="paid_amount"
            type="text"
            inputMode="decimal"
            value={processFormData.paid_amount}
            onChange={handlePaidAmountChange}
            onBlur={handlePaidAmountBlur}
            placeholder="0.00"
          />
          <div className="purchase-process-balance-note" aria-live="polite">
            <span>Remaining balance</span>
            <strong>{formatCurrency(remainingBalance)}</strong>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={`${prefix}-payment-mode`}>Payment Mode</label>
          <select
            id={`${prefix}-payment-mode`}
            name="payment_mode"
            value={processFormData.payment_mode}
            onChange={(e) => updateProcessField('payment_mode', e.target.value)}
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
              <label htmlFor={`${prefix}-payment-reference`}>Payment Reference</label>
              <input
                id={`${prefix}-payment-reference`}
                name="payment_reference"
                type="text"
                value={processFormData.payment_reference}
                onChange={(e) => updateProcessField('payment_reference', e.target.value)}
                placeholder="Optional reference"
              />
            </div>
            <div className="form-group">
              <div className="purchase-process-date-label">
                <label htmlFor={`${prefix}-payment-date`}>Payment Date</label>
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
                {formatDate(processFormData.payment_date)}
              </div>
              <input
                ref={paymentDateInputRef}
                id={`${prefix}-payment-date`}
                name="payment_date"
                type="date"
                className="purchase-process-hidden-date-input"
                value={processFormData.payment_date}
                onChange={(e) => updateProcessField('payment_date', e.target.value)}
                tabIndex={-1}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor={`${prefix}-payment-notes`}>Notes</label>
            <textarea
              id={`${prefix}-payment-notes`}
              name="payment_notes"
              rows="2"
              value={processFormData.payment_notes}
              onChange={(e) => updateProcessField('payment_notes', e.target.value)}
              placeholder="Optional payment note"
            />
          </div>
        </div>
      </details>
    </>
  );

  const actionRow = (
    <div className="modal-actions purchase-process-actions">
      <button
        type="button"
        className="cancel-btn"
        onClick={closeProcessModal}
        disabled={processSubmitting}
      >
        Cancel
      </button>
      <button type="submit" className="submit-btn" disabled={processSubmitting}>
        {processSubmitting ? 'Confirming...' : 'Confirm PO'}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closeProcessModal}
        title="Confirm Purchase Order"
        className="purchase-process-sheet"
        dismissible={!processSubmitting}
        actions={
          <>
            <button
              type="button"
              className="cancel-btn"
              onClick={closeProcessModal}
              disabled={processSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="purchase-process-form"
              className="submit-btn"
              disabled={processSubmitting}
            >
              {processSubmitting ? 'Confirming...' : 'Confirm PO'}
            </button>
          </>
        }
      >
        <form id="purchase-process-form" onSubmit={handleProcessSubmit}>
          {renderCoreFields('process-mobile')}
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
      dialogClassName="purchase-modal-frame purchase-process-frame"
      headerClassName="purchase-modal-header"
      closeButtonClassName="purchase-modal-close-btn"
      initialSize={{ width: 640, height: 460 }}
    >
      <form onSubmit={handleProcessSubmit}>
        {renderCoreFields('process-desktop')}
        {actionRow}
      </form>
    </WindowModal>
  );
};

export default ProcessOrderModal;
