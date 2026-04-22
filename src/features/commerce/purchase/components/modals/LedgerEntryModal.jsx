import { CalendarDays } from 'lucide-react';
import { useRef } from 'react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';
import CalculatedAmountInput from '../../../../../shared/components/CalculatedAmountInput';
import WindowModal from '../../../../../shared/components/window/WindowModal';
import { formatDate } from '../../../../../shared/utils/formatters';

const LedgerEntryModal = ({
  isMobile,
  showLedgerForm,
  closeLedgerForm,
  ledgerSubmitting,
  handleLedgerSubmit,
  ledgerFormData,
  setLedgerFormData,
  distributors,
}) => {
  const transactionDateInputRef = useRef(null);

  if (!showLedgerForm) return null;

  const selectedDistributor = distributors.find(
    (d) => String(d.id) === String(ledgerFormData.distributor_id || '')
  );
  const distributorLabel = selectedDistributor?.name || '-';
  const typeLabel =
    ledgerFormData.type === 'credit' ? 'Credit (Increase due)' : 'Payment (Reduce due)';
  const paymentModeLabel = String(ledgerFormData.payment_mode || '').trim() || 'Cash';

  const updateLedgerField = (field, value) => {
    setLedgerFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openTransactionDatePicker = () => {
    const input = transactionDateInputRef.current;
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
      <div className="purchase-process-info-row" aria-label="Distributor payment info">
        <div className="purchase-process-info-item">
          <span className="purchase-process-info-label">Distributor</span>
          <strong className="purchase-process-info-value">{distributorLabel}</strong>
        </div>
        <div className="purchase-process-info-item">
          <span className="purchase-process-info-label">Type</span>
          <strong className="purchase-process-info-value">{typeLabel}</strong>
        </div>
        <div className="purchase-process-info-item purchase-process-info-item--total">
          <span className="purchase-process-info-label">Mode</span>
          <strong className="purchase-process-info-value">{paymentModeLabel}</strong>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-distributor`}>Distributor *</label>
          <select
            id={`${prefix}-distributor`}
            name="distributor_id"
            value={ledgerFormData.distributor_id}
            onChange={(e) => updateLedgerField('distributor_id', e.target.value)}
            required
          >
            <option value="">Select distributor</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={`${prefix}-type`}>Type *</label>
          <select
            id={`${prefix}-type`}
            name="type"
            value={ledgerFormData.type}
            onChange={(e) => updateLedgerField('type', e.target.value)}
          >
            <option value="payment">Payment (Reduce due)</option>
            <option value="credit">Credit (Increase due)</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-amount`}>Amount *</label>
          <CalculatedAmountInput
            id={`${prefix}-amount`}
            name="amount"
            value={ledgerFormData.amount}
            onValueChange={(nextValue) => updateLedgerField('amount', nextValue)}
            placeholder="Enter amount or expression like (5+7)*100/35+56-25"
            required
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${prefix}-payment-mode`}>Payment Mode</label>
          <select
            id={`${prefix}-payment-mode`}
            name="payment_mode"
            value={ledgerFormData.payment_mode}
            onChange={(e) => updateLedgerField('payment_mode', e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="credit">Credit</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <div className="purchase-process-date-label">
            <label htmlFor={`${prefix}-transaction-date`}>Transaction Date</label>
            <button
              type="button"
              className="purchase-process-date-btn"
              onClick={openTransactionDatePicker}
              aria-label="Open transaction date picker"
            >
              <CalendarDays size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="purchase-process-date-value">
            {formatDate(ledgerFormData.transaction_date)}
          </div>
          <input
            ref={transactionDateInputRef}
            id={`${prefix}-transaction-date`}
            name="transaction_date"
            type="date"
            className="purchase-process-hidden-date-input"
            value={ledgerFormData.transaction_date}
            onChange={(e) => updateLedgerField('transaction_date', e.target.value)}
            tabIndex={-1}
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${prefix}-reference`}>Reference</label>
          <input
            id={`${prefix}-reference`}
            name="reference"
            type="text"
            value={ledgerFormData.reference}
            onChange={(e) => updateLedgerField('reference', e.target.value)}
            placeholder="Invoice / PO / Bank ref"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={`${prefix}-description`}>Description</label>
        <textarea
          id={`${prefix}-description`}
          name="description"
          rows="2"
          value={ledgerFormData.description}
          onChange={(e) => updateLedgerField('description', e.target.value)}
          placeholder="Optional notes"
        />
      </div>
    </>
  );

  const actionRow = (
    <div className="modal-actions purchase-process-actions">
      <button
        type="button"
        className="cancel-btn"
        onClick={closeLedgerForm}
        disabled={ledgerSubmitting}
      >
        Cancel
      </button>
      <button type="submit" className="submit-btn" disabled={ledgerSubmitting}>
        {ledgerSubmitting ? 'Saving...' : 'Save Entry'}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closeLedgerForm}
        title="Add Distributor Payment / Credit"
        className="purchase-ledger-sheet purchase-process-sheet"
        dismissible={!ledgerSubmitting}
        actions={
          <>
            <button
              type="button"
              className="cancel-btn"
              onClick={closeLedgerForm}
              disabled={ledgerSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="purchase-ledger-form"
              className="submit-btn"
              disabled={ledgerSubmitting}
            >
              {ledgerSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </>
        }
      >
        <form id="purchase-ledger-form" onSubmit={handleLedgerSubmit}>
          {renderCoreFields('ledger-mobile')}
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <WindowModal
      open
      title="Add Distributor Payment / Credit"
      onClose={closeLedgerForm}
      dismissible={!ledgerSubmitting}
      themeClassName="purchase-management"
      dialogClassName="purchase-modal-frame purchase-process-frame"
      headerClassName="purchase-modal-header"
      closeButtonClassName="purchase-modal-close-btn"
      initialSize={{ width: 720, height: 560 }}
    >
      <form onSubmit={handleLedgerSubmit}>
        {renderCoreFields('ledger-desktop')}
        {actionRow}
      </form>
    </WindowModal>
  );
};

export default LedgerEntryModal;
