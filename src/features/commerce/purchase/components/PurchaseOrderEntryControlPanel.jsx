const PurchaseOrderEntryControlPanel = ({
  heading = 'Update Before Final Submit',
  description = 'Add delivery date and note here before the final submit.',
  draftDiagnostics,
  orderFullMode,
  orderFormData,
  setOrderFormData,
}) => {
  const hasReviewDetails = Boolean(
    String(orderFormData?.expected_delivery || '').trim()
    || String(orderFormData?.strict_due_date || '').trim()
    || String(orderFormData?.notes || '').trim()
    || String(orderFormData?.strict_due_note || '').trim()
  );
  const reviewNotices = [
    draftDiagnostics.hasDuplicateErrors
      ? { tone: 'danger', text: 'Fix duplicates' }
      : null,
    draftDiagnostics.hasDiscountErrors
      ? { tone: 'danger', text: `${Math.max(1, Number(draftDiagnostics.discountBlockingRows?.length || 0))} discount fix` }
      : null,
    draftDiagnostics.hasRateConfirmationErrors
      ? { tone: 'danger', text: `${draftDiagnostics.rateConfirmationCount} rate confirm` }
      : null,
    draftDiagnostics.hasDiscountConfirmationErrors
      ? { tone: 'danger', text: `${draftDiagnostics.discountConfirmationCount} discount confirm` }
      : null,
    draftDiagnostics.rateWarningCount > 0 && !draftDiagnostics.hasRateConfirmationErrors
      ? { tone: 'bad', text: `${draftDiagnostics.rateWarningCount} rate drift` }
      : null,
  ].filter(Boolean).slice(0, 3);
  const filledFieldCount = [
    String(orderFormData?.expected_delivery || '').trim(),
    String(orderFormData?.strict_due_date || '').trim(),
    String(orderFormData?.notes || '').trim(),
    String(orderFormData?.strict_due_note || '').trim(),
  ].filter(Boolean).length;

  return (
    <section className="po-review-edit-panel">
      <div className="po-review-edit-head">
        <div>
          <h4>{heading}</h4>
          {description ? <p>{description}</p> : null}
        </div>
        <span className={`po-review-edit-badge${hasReviewDetails ? ' active' : ''}`}>
          {hasReviewDetails ? `${filledFieldCount} added` : 'Optional'}
        </span>
      </div>
      {reviewNotices.length ? (
        <div className="po-entry-status-row" aria-live="polite">
          {reviewNotices.map((notice) => (
            <span key={notice.text} className={`po-pos-status-chip ${notice.tone}`}>
              {notice.text}
            </span>
          ))}
        </div>
      ) : null}
      <div className="po-review-edit-grid">
        <div className="form-group">
          <label htmlFor="po-entry-expected-delivery">Delivery Date</label>
          <input
            id="po-entry-expected-delivery"
            name="expected_delivery"
            type="date"
            value={orderFormData.expected_delivery || ''}
            onChange={(event) => setOrderFormData((prev) => ({ ...prev, expected_delivery: event.target.value }))}
          />
        </div>
        <div className="form-group po-review-edit-note">
          <label htmlFor="po-entry-notes">Note</label>
          <textarea
            id="po-entry-notes"
            name="notes"
            rows="2"
            value={orderFormData.notes || ''}
            onChange={(event) => setOrderFormData((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Optional supplier note"
          />
        </div>
        {orderFullMode ? (
          <>
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
            <div className="form-group po-review-edit-note">
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
          </>
        ) : null}
      </div>
    </section>
  );
};

export default PurchaseOrderEntryControlPanel;
