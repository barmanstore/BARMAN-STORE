import React, { memo } from 'react';
import { CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import { formatCurrency } from '../../../../shared/utils/formatters';

const BillingPaymentPanel = ({
  isSubmitting,
  activeLineItemsCount,
  totalBill,
  paidClamped,
  paidAmount,
  setPaidAmount,
  creditAmount,
  paidAmountWarning,
  selectedPaymentMethod,
  effectivePaymentMethod,
  setSelectedPaymentMethod,
  createBillConfirmationOpen,
  clearBillConfirmationOpen,
  handleSelectCashPayment,
  handleSelectUpiPayment,
  handleSelectCreditPayment,
  onClear,
  onCancelCreateBill,
  onCancelClearBill,
  onCreateBill,
  lastShareText,
  onSendBill,
  customerName,
}) => (
  <section className="billing-pos-panel billing-payment-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Payment</p>
        <h2>Checkout</h2>
        <p className="billing-panel-copy">Keep checkout compact.</p>
      </div>
      <span className="billing-panel-badge neutral">{effectivePaymentMethod}</span>
    </div>

    <div className="billing-payment-quick-actions" role="group" aria-label="Quick payment actions">
      <button
        type="button"
        className={`billing-quick-pay-btn${creditAmount <= 0 && effectivePaymentMethod === 'cash' ? ' active' : ''}`}
        onClick={handleSelectCashPayment}
      >
        <Wallet size={16} />
        Cash
      </button>
      <button
        type="button"
        className={`billing-quick-pay-btn${creditAmount <= 0 && effectivePaymentMethod === 'upi' ? ' active' : ''}`}
        onClick={handleSelectUpiPayment}
      >
        <Smartphone size={16} />
        UPI
      </button>
      <button
        type="button"
        className={`billing-quick-pay-btn${creditAmount > 0 ? ' active' : ''}`}
        onClick={handleSelectCreditPayment}
      >
        <CreditCard size={16} />
        Credit
      </button>
    </div>

    <div className="billing-payment-totals">
      <div>
        <span>Total</span>
        <strong>{formatCurrency(totalBill)}</strong>
      </div>
      <div>
        <span>Paid</span>
        <strong>{formatCurrency(paidClamped)}</strong>
      </div>
      <div className={creditAmount > 0 ? 'due' : 'settled'}>
        <span>Due</span>
        <strong>{formatCurrency(creditAmount)}</strong>
      </div>
    </div>

    <label className="billing-entry-field" htmlFor="paidAmount">
      <span>Paid</span>
      <CalculatedAmountInput
        id="paidAmount"
        name="paid_amount"
        min={0}
        max={totalBill}
        value={paidAmount}
        onValueChange={setPaidAmount}
        inputClassName={`form-input${paidAmountWarning ? ' billing-paid-input-invalid' : ''}`}
        placeholder="Enter amount or math expression"
      />
    </label>

    {paidAmountWarning ? (
      <div className="billing-entry-warning critical">
        <strong>Payment:</strong> {paidAmountWarning}
      </div>
    ) : null}

    <div className="billing-entry-search-state">
      Set <strong>0</strong> or tap <strong>Credit</strong> for full due. Saved customer required.
    </div>

    {createBillConfirmationOpen ? (
      <div className="billing-final-confirmation" role="status" aria-live="polite">
        <strong>Confirm bill</strong>
        <span>
          {activeLineItemsCount} item(s) | {customerName || 'Walk-in'} | {formatCurrency(totalBill)} total | {formatCurrency(creditAmount)} due
        </span>
        <small>Save bill and update stock and due.</small>
      </div>
    ) : null}

    {clearBillConfirmationOpen ? (
      <div className="billing-final-confirmation billing-final-confirmation-clear" role="status" aria-live="polite">
        <strong>Clear bill?</strong>
        <span>Removes current items, payment, and customer.</span>
        <small>Press Clear again.</small>
      </div>
    ) : null}

    {creditAmount <= 0 ? (
      <div className="billing-entry-field" role="group" aria-label="Payment method">
        <span>Method</span>
        <div className="billing-method-row">
          <button
            type="button"
            className={`billing-method-chip${selectedPaymentMethod === 'cash' ? ' active' : ''}`}
            onClick={() => setSelectedPaymentMethod('cash')}
          >
            <Wallet size={15} />
            Cash
          </button>
          <button
            type="button"
            className={`billing-method-chip${selectedPaymentMethod === 'upi' ? ' active' : ''}`}
            onClick={() => setSelectedPaymentMethod('upi')}
          >
            <Smartphone size={15} />
            UPI
          </button>
          <button
            type="button"
            className={`billing-method-chip${selectedPaymentMethod === 'card' ? ' active' : ''}`}
            onClick={() => setSelectedPaymentMethod('card')}
          >
            <CreditCard size={15} />
            Card
          </button>
          <button
            type="button"
            className={`billing-method-chip${selectedPaymentMethod === 'bank' ? ' active' : ''}`}
            onClick={() => setSelectedPaymentMethod('bank')}
          >
            <Landmark size={15} />
            Bank
          </button>
        </div>
      </div>
    ) : null}

    <div className="billing-entry-actions">
      <button
        type="button"
        className="billing-secondary-btn"
        onClick={onClear}
      >
        {clearBillConfirmationOpen ? 'Confirm Clear' : 'Clear'}
      </button>
      {clearBillConfirmationOpen ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onCancelClearBill}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      ) : null}
      <button
        type="button"
        className="billing-primary-btn"
        onClick={onCreateBill}
        disabled={isSubmitting || totalBill <= 0}
      >
        {createBillConfirmationOpen ? 'Confirm Save' : 'Save Bill'}
      </button>
      {createBillConfirmationOpen ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onCancelCreateBill}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      ) : null}
      <button
        type="button"
        className="billing-secondary-btn billing-send-whatsapp-btn"
        onClick={onSendBill}
        disabled={!lastShareText || isSubmitting}
      >
        <Smartphone size={16} />
        WhatsApp
      </button>
    </div>
  </section>
);

export default memo(BillingPaymentPanel);
