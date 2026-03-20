import { formatCurrency } from '../../../../shared/utils/formatters';

const PurchaseOrderEntryControlPanel = ({
  items,
  resolvedActiveItemIndex,
  orderTotals,
  draftDiagnostics,
  orderFullMode,
  orderFormData,
  setOrderFormData,
}) => {
  const hasAdvancedNotes = Boolean(
    String(orderFormData?.notes || '').trim()
    || String(orderFormData?.strict_due_note || '').trim()
  );
  const passiveRateWarningCount = Math.max(
    0,
    Number(draftDiagnostics.rateWarningCount || 0)
      - Number(draftDiagnostics.rateConfirmationCount || 0)
      - Number(draftDiagnostics.rateAcknowledgedCount || 0)
  );
  const passiveNotices = [
    draftDiagnostics.hasDuplicateErrors
      ? { tone: 'danger', text: draftDiagnostics.blockingMessage }
      : null,
    draftDiagnostics.hasRateConfirmationErrors && !draftDiagnostics.hasDuplicateErrors
      ? { tone: 'danger', text: `${draftDiagnostics.rateConfirmationCount} row(s) have unusual rate changes. Confirm them before saving.` }
      : null,
    draftDiagnostics.hasDiscountErrors && !draftDiagnostics.hasDuplicateErrors
      ? { tone: 'danger', text: draftDiagnostics.blockingMessage }
      : null,
    draftDiagnostics.rateAcknowledgedCount > 0
      ? { tone: 'good', text: `${draftDiagnostics.rateAcknowledgedCount} row(s) include confirmed unusual rate changes.` }
      : null,
    draftDiagnostics.hasDiscountConfirmationErrors
      ? { tone: 'danger', text: `${draftDiagnostics.discountConfirmationCount} row(s) have unusual discount values. Confirm them before saving.` }
      : null,
    draftDiagnostics.discountAcknowledgedCount > 0
      ? { tone: 'good', text: `${draftDiagnostics.discountAcknowledgedCount} row(s) include confirmed unusual discounts.` }
      : null,
    passiveRateWarningCount > 0
      ? { tone: 'bad', text: `${passiveRateWarningCount} row(s) differ from the latest reference rate.` }
      : null,
  ].filter(Boolean);

  return (
    <div className="po-party-card">
      <h4>Entry Controls</h4>
      <div className="po-entry-stats" aria-label="Purchase order entry stats">
        <div className="po-entry-stat-chip">
          <span>Rows</span>
          <strong>{items.length}</strong>
        </div>
        <div className="po-entry-stat-chip">
          <span>Active Row</span>
          <strong>{items.length ? resolvedActiveItemIndex + 1 : 0}</strong>
        </div>
        <div className="po-entry-stat-chip total">
          <span>Grand Total</span>
          <strong>{formatCurrency(orderTotals.totalAmount)}</strong>
        </div>
      </div>
      {passiveNotices.length ? (
        <div className="po-entry-status-row" aria-live="polite">
          {passiveNotices.map((notice) => (
            <span key={notice.text} className={`po-pos-status-chip ${notice.tone}`}>
              {notice.text}
            </span>
          ))}
        </div>
      ) : null}
      {orderFullMode ? (
        <div className="po-entry-advanced-fields">
          <div className="form-group">
            <label htmlFor="po-entry-strict-due-date">Strict Due Date</label>
            <input
              id="po-entry-strict-due-date"
              name="strict_due_date"
              type="date"
              value={orderFormData.strict_due_date || ''}
              onChange={(event) => setOrderFormData((prev) => ({ ...prev, strict_due_date: event.target.value }))}
            />
          </div>

          <details className="po-entry-advanced-toggle" open={hasAdvancedNotes}>
            <summary>More controls</summary>
            <div className="po-entry-advanced-toggle-body">
              <div className="form-group">
                <label htmlFor="po-entry-notes">Notes</label>
                <textarea
                  id="po-entry-notes"
                  name="notes"
                  rows="2"
                  value={orderFormData.notes || ''}
                  onChange={(event) => setOrderFormData((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="po-entry-strict-due-note">Strict Due Note</label>
                <textarea
                  id="po-entry-strict-due-note"
                  name="strict_due_note"
                  rows="2"
                  value={orderFormData.strict_due_note || ''}
                  onChange={(event) => setOrderFormData((prev) => ({ ...prev, strict_due_note: event.target.value }))}
                  placeholder="Optional hard deadline reason"
                />
              </div>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
};

export default PurchaseOrderEntryControlPanel;
