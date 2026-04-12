import { useMemo, useState } from 'react';
import { Check, Clock, Sparkles, Wallet } from 'lucide-react';
import { canAddPaymentToPo } from '../../../utils/orders';
import { sortPurchaseAnalyticsEntries } from '../../../utils/purchaseAnalyticsSort';

const PurchasePaymentsPanel = ({
  operationsSummary,
  onOpenPayable,
  onOpenProcessModal,
  formatCurrency,
  toNumber,
}) => {
  const [predictionSort, setPredictionSort] = useState('balance_desc');
  const predictedEntries = useMemo(
    () => sortPurchaseAnalyticsEntries(operationsSummary.predicted_payments_today || [], predictionSort),
    [operationsSummary.predicted_payments_today, predictionSort]
  );

  const renderSort = (value, onChange) => (
    <select name="purchase_section_sort" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Sort section">
      <option value="balance_desc">Highest balance</option>
      <option value="overdue_desc">Most overdue</option>
      <option value="date_asc">Earliest date</option>
      <option value="ledger_desc">Highest ledger</option>
      <option value="name_asc">Name A-Z</option>
    </select>
  );

  return (
    <div className="purchase-sector-grid">
      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Wallet size={16} />
          <span>Payables</span>
        </div>
        {(operationsSummary.payables || []).length ? (
          (operationsSummary.payables || []).slice(0, 4).map((entry) => {
            const paymentEligible = canAddPaymentToPo(entry);
            const isConfirmAction = !paymentEligible;
            const actionLabel = paymentEligible ? 'Pay' : 'Confirm';
            const ActionIcon = paymentEligible ? Wallet : Check;
            const handleAction = paymentEligible
              ? () => onOpenPayable(entry.order_id)
              : () => {
                  if (typeof onOpenProcessModal !== 'function') return;
                  onOpenProcessModal({
                    id: entry.order_id,
                    po_number: entry.po_number,
                    bill_number: entry.bill_number,
                    invoice_number: entry.invoice_number,
                    distributor_name: entry.distributor_name,
                    supplier_name: entry.supplier_name,
                  });
                };

            return (
              <div key={`payable-${entry.order_id}`} className="purchase-ops-item">
                <div>
                  <strong>{entry.distributor_name}</strong>
                  <p>{entry.po_number} | {formatCurrency(toNumber(entry.balance_due))}</p>
                  <small>
                    Due: {entry.payment_due_date}{entry.overdue_days ? ` | ${entry.overdue_days} day overdue` : ''}
                  </small>
                  <small>
                    Strict: {entry.strict_due_date || '-'} | Inferred: {entry.inferred_due_date || '-'}
                  </small>
                </div>
                <button
                  type="button"
                  className="admin-btn secondary small"
                  onClick={handleAction}
                  disabled={isConfirmAction && typeof onOpenProcessModal !== 'function'}
                >
                  <ActionIcon size={14} />
                  {actionLabel}
                </button>
              </div>
            );
          })
        ) : (
          <div className="purchase-ops-empty">No payable items due right now.</div>
        )}
      </section>

      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Sparkles size={16} />
          <span>Predicted Payments</span>
        </div>
        {renderSort(predictionSort, setPredictionSort)}
        {predictedEntries.length ? (
          predictedEntries.slice(0, 6).map((entry) => (
            <div key={`prediction-${entry.order_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>{entry.po_number} | {formatCurrency(toNumber(entry.balance_due))}</p>
                <small>Configured: {entry.payment_due_date} | Inferred: {entry.inferred_due_date || '-'}</small>
                <small>{entry.prediction_reason === 'overdue' ? 'Overdue' : 'Likely payment today'}</small>
              </div>
              <button type="button" className="admin-btn secondary small" onClick={() => onOpenPayable(entry.order_id)}>
                Open
              </button>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No payment prediction is available for today.</div>
        )}
      </section>

      <section className="purchase-ops-panel">
        <div className="purchase-ops-panel-title">
          <Clock size={16} />
          <span>Next Payments</span>
        </div>
        {(operationsSummary.predicted_payments_next || []).length ? (
          (operationsSummary.predicted_payments_next || []).slice(0, 6).map((entry) => (
            <div key={`next-payment-${entry.distributor_id}`} className="purchase-ops-item">
              <div>
                <strong>{entry.distributor_name}</strong>
                <p>Due: {entry.next_payment_due_date} | {formatCurrency(toNumber(entry.predicted_payment_amount))}</p>
                <small>
                  Source: {entry.next_payment_due_source === 'open_payable' ? 'Open payable' : (entry.next_payment_due_source === 'history_inferred' ? 'History inferred' : 'Unknown')}
                </small>
                <small>Outstanding: {formatCurrency(toNumber(entry.outstanding_amount))}</small>
              </div>
            </div>
          ))
        ) : (
          <div className="purchase-ops-empty">No future payment predictions available.</div>
        )}
      </section>
    </div>
  );
};

export default PurchasePaymentsPanel;
