import { formatCurrency } from '../../../../shared/utils/formatters';

const PurchaseOrderSummaryPanel = ({
  orderFullMode,
  orderTotals,
}) => (
  <div className="order-summary">
    {orderFullMode ? (
      <>
        <div className="summary-row"><span>Total Taxable Value</span><strong>{formatCurrency(orderTotals.taxableValue)}</strong></div>
        <div className="summary-row"><span>Total Tax</span><strong>{formatCurrency(orderTotals.taxAmount)}</strong></div>
      </>
    ) : null}
    <div className="summary-row grand-total"><span>PO Grand Total</span><strong>{formatCurrency(orderTotals.totalAmount)}</strong></div>
  </div>
);

export default PurchaseOrderSummaryPanel;
