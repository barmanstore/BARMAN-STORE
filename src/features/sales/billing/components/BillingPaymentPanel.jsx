import React, { memo } from 'react';
import { CreditCard, Landmark, Smartphone, UserPlus, Wallet } from 'lucide-react';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import { formatCurrency } from '../../../../shared/utils/formatters';

const BillingPaymentPanel = ({
  isOrderLinked,
  isSubmitting,
  customer,
  customersList,
  handleCustomerChange,
  handleAddCustomer,
  fulfillmentMode,
  setFulfillmentMode,
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
}) => (
  <section className="billing-pos-panel billing-payment-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Customer & Payment</p>
        <h2>Finish The Bill</h2>
        <p className="billing-panel-copy">Customer is optional. Payment stays fast even without it.</p>
      </div>
      <span className="billing-panel-badge neutral">{effectivePaymentMethod}</span>
    </div>

    <div className="billing-customer-block">
      <label className="billing-entry-field" htmlFor="billing-customer-name">
        <span>Customer (Optional)</span>
        <input
          id="billing-customer-name"
          list="billing-customer-options"
          className="form-input"
          value={customer.name}
          onChange={handleCustomerChange}
          placeholder="Walk-in customer or saved name"
          autoComplete="name"
          readOnly={isOrderLinked}
        />
        <datalist id="billing-customer-options">
          {customersList.map((entry) => (
            <option key={entry.id} value={entry.name} />
          ))}
        </datalist>
      </label>

      {!isOrderLinked ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={handleAddCustomer}
          disabled={isSubmitting}
        >
          <UserPlus size={16} />
          Add Customer
        </button>
      ) : null}

      {(customer.phone || customer.email) ? (
        <div className="billing-customer-meta">
          <div>
            <span>Phone</span>
            <strong>{customer.phone || '-'}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{customer.email || '-'}</strong>
          </div>
        </div>
      ) : null}
    </div>

    {isOrderLinked ? (
      <label className="billing-entry-field" htmlFor="billing-fulfillment-mode">
        <span>Billing Mode</span>
        <select
          id="billing-fulfillment-mode"
          className="form-input"
          value={fulfillmentMode}
          onChange={(event) => setFulfillmentMode(String(event.target.value || 'available_now'))}
        >
          <option value="available_now">Bill available now</option>
          <option value="full_now">Bill full now</option>
        </select>
      </label>
    ) : null}

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
        <span>Total Amount</span>
        <strong>{formatCurrency(totalBill)}</strong>
      </div>
      <div>
        <span>Paid Amount</span>
        <strong>{formatCurrency(paidClamped)}</strong>
      </div>
      <div className={creditAmount > 0 ? 'due' : 'settled'}>
        <span>Due Amount</span>
        <strong>{formatCurrency(creditAmount)}</strong>
      </div>
    </div>

    <label className="billing-entry-field" htmlFor="paidAmount">
      <span>Paid Amount</span>
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
        <strong>Payment warning:</strong> {paidAmountWarning}
      </div>
    ) : null}

    <div className="billing-entry-search-state">
      Set paid amount to <strong>0</strong> or tap <strong>Credit</strong> to create a full-credit bill.
    </div>

    {createBillConfirmationOpen ? (
      <div className="billing-final-confirmation" role="status" aria-live="polite">
        <strong>Confirm Bill Save</strong>
        <span>
          {activeLineItemsCount} item(s) | {customer.name ? customer.name : 'Walk-in'} | {formatCurrency(totalBill)} total | {formatCurrency(creditAmount)} due
        </span>
        <small>On checkout: save bill, update stock for inventory items, update customer credit if due, then reset for the next entry.</small>
      </div>
    ) : null}

    {clearBillConfirmationOpen ? (
      <div className="billing-final-confirmation billing-final-confirmation-clear" role="status" aria-live="polite">
        <strong>Clear Current Bill?</strong>
        <span>This removes all current items, payment entry, and customer selection from the screen.</span>
        <small>Press Clear All again to confirm.</small>
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
        {clearBillConfirmationOpen ? 'Confirm Clear All' : 'Clear Bill'}
      </button>
      {clearBillConfirmationOpen ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onCancelClearBill}
          disabled={isSubmitting}
        >
          Cancel Clear
        </button>
      ) : null}
      <button
        type="button"
        className="billing-primary-btn"
        onClick={onCreateBill}
        disabled={isSubmitting || totalBill <= 0}
      >
        {createBillConfirmationOpen ? 'Confirm Save' : 'Create Bill'}
      </button>
      {createBillConfirmationOpen ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onCancelCreateBill}
          disabled={isSubmitting}
        >
          Cancel Confirm
        </button>
      ) : null}
      <button
        type="button"
        className="billing-secondary-btn billing-send-whatsapp-btn"
        onClick={onSendBill}
        disabled={!lastShareText || isSubmitting}
      >
        <Smartphone size={16} />
        Send WhatsApp
      </button>
    </div>
  </section>
);

export default memo(BillingPaymentPanel);
