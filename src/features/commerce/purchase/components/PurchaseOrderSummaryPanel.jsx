import { formatCurrency, formatCurrencyRounded } from '../../../../shared/utils/formatters';

const PurchaseOrderSummaryPanel = ({
  orderFullMode,
  orderTotals,
  itemCount = 0,
  quantityTotal = 0,
}) => {
  const hasTaxDetails =
    orderFullMode &&
    (Number(orderTotals.taxableValue || 0) > 0 || Number(orderTotals.taxAmount || 0) > 0);

  return (
    <div className="order-summary">
      <div className="order-summary-stats">
        <div className="summary-chip">
          <span>Items</span>
          <strong>{itemCount}</strong>
        </div>
        <div className="summary-chip">
          <span>Qty</span>
          <strong>{quantityTotal}</strong>
        </div>
        <div className="summary-row grand-total">
          <span>Total</span>
          <strong>{formatCurrencyRounded(orderTotals.totalAmount)}</strong>
        </div>
      </div>
      {hasTaxDetails ? (
        <details className="order-summary-more">
          <summary>Tax details</summary>
          <div className="order-summary-more-body">
            <div className="summary-row">
              <span>Taxable</span>
              <strong>{formatCurrency(orderTotals.taxableValue)}</strong>
            </div>
            <div className="summary-row">
              <span>Tax</span>
              <strong>{formatCurrency(orderTotals.taxAmount)}</strong>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
};

export default PurchaseOrderSummaryPanel;
