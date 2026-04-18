import React, { memo } from 'react';
import BillingCustomerSection from './BillingCustomerSection';
import BillingPaymentPanel from './BillingPaymentPanel';
import BillingSummary from './BillingSummary';

const BillingPaymentSection = ({ customerSectionProps, summaryProps, paymentPanelProps }) => (
  <div className="billing-pos-footer">
    <BillingCustomerSection {...customerSectionProps} />
    <BillingSummary {...summaryProps} />
    <BillingPaymentPanel {...paymentPanelProps} />
  </div>
);

export default memo(BillingPaymentSection);
