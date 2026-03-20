import React, { memo } from 'react';
import { formatCurrency } from '../../../../shared/utils/formatters';

const BillingSummary = ({
  activeLineItemsCount,
  subtotalAmount,
  totalDiscount,
  totalBill,
  paidClamped,
  creditAmount,
  paymentStatusLabel,
}) => (
  <section className="billing-pos-panel billing-summary-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Bill Summary</p>
        <h2>Running Totals</h2>
        <p className="billing-panel-copy">Totals update instantly as each item is added or edited.</p>
      </div>
      <span className={`billing-panel-badge${creditAmount > 0 ? ' pending' : ''}`}>
        {paymentStatusLabel}
      </span>
    </div>

    <div className="billing-summary-stack">
      <div className="billing-summary-row">
        <span>Items</span>
        <strong>{activeLineItemsCount}</strong>
      </div>
      <div className="billing-summary-row">
        <span>Subtotal</span>
        <strong>{formatCurrency(subtotalAmount)}</strong>
      </div>
      <div className="billing-summary-row">
        <span>Total Discount</span>
        <strong>{formatCurrency(totalDiscount)}</strong>
      </div>
      <div className="billing-summary-row emphasis">
        <span>Final Total</span>
        <strong>{formatCurrency(totalBill)}</strong>
      </div>
      <div className="billing-summary-row">
        <span>Paid</span>
        <strong>{formatCurrency(paidClamped)}</strong>
      </div>
      <div className={`billing-summary-row ${creditAmount > 0 ? 'due' : 'settled'}`}>
        <span>Due</span>
        <strong>{formatCurrency(creditAmount)}</strong>
      </div>
    </div>
  </section>
);

export default memo(BillingSummary);
