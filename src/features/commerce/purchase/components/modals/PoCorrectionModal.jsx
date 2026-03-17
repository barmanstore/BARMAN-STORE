import { X } from 'lucide-react';
import MobileBottomSheet from '../../../../../components/mobile/MobileBottomSheet';

const PoCorrectionModal = ({
  isMobile,
  showPoCorrectionForm,
  selectedCorrectionOrder,
  closePoCorrectionForm,
  poCorrectionSubmitting,
  handlePoCorrectionSubmit,
  poCorrectionFormData,
  setPoCorrectionFormData,
  poCorrectionContext,
  formatCurrency,
  getDistributorName,
}) => {
  if (!showPoCorrectionForm || !selectedCorrectionOrder) return null;

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closePoCorrectionForm}
        title="Correct PO Ledger Impact"
        className="purchase-correction-sheet"
        actions={(
          <>
            <button type="button" className="cancel-btn" onClick={closePoCorrectionForm} disabled={poCorrectionSubmitting}>
              Cancel
            </button>
            <button type="submit" form="purchase-correction-form" className="submit-btn" disabled={poCorrectionSubmitting}>
              {poCorrectionSubmitting ? 'Posting...' : 'Post Correction'}
            </button>
          </>
        )}
      >
        <form id="purchase-correction-form" onSubmit={handlePoCorrectionSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-mobile-po-number">PO Number</label>
              <input id="po-correction-mobile-po-number" type="text" value={selectedCorrectionOrder.po_number || '-'} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-mobile-distributor">Distributor</label>
              <input id="po-correction-mobile-distributor" type="text" value={selectedCorrectionOrder.distributor_name || getDistributorName(selectedCorrectionOrder)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-mobile-expected-impact">Expected PO Impact</label>
              <input id="po-correction-mobile-expected-impact" type="text" value={formatCurrency(poCorrectionContext.expectedAmount)} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-mobile-current-impact">Current Ledger Impact</label>
              <input id="po-correction-mobile-current-impact" type="text" value={formatCurrency(poCorrectionContext.currentImpact)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-mobile-delta">Adjustment Needed (Delta)</label>
              <input id="po-correction-mobile-delta" type="text" value={formatCurrency(poCorrectionContext.delta)} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-mobile-linked-entries">Linked Entries</label>
              <input id="po-correction-mobile-linked-entries" type="text" value={String(poCorrectionContext.linkedEntries)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-mobile-type">Correction Type *</label>
              <select
                id="po-correction-mobile-type"
                name="type"
                value={poCorrectionFormData.type}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="payment">Payment (Reduce due)</option>
                <option value="credit">Credit (Increase due)</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-mobile-amount">Amount *</label>
              <input
                id="po-correction-mobile-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                value={poCorrectionFormData.amount}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, amount: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-mobile-mode">Mode</label>
              <select
                id="po-correction-mobile-mode"
                name="payment_mode"
                value={poCorrectionFormData.payment_mode}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-mobile-date">Date</label>
              <input
                id="po-correction-mobile-date"
                name="transaction_date"
                type="date"
                value={poCorrectionFormData.transaction_date}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-mobile-reference">Reference</label>
              <input
                id="po-correction-mobile-reference"
                name="reference"
                type="text"
                value={poCorrectionFormData.reference}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="PO number or correction reference"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="po-correction-mobile-reason">Correction Reason *</label>
            <textarea
              id="po-correction-mobile-reason"
              name="reason"
              rows="3"
              value={poCorrectionFormData.reason}
              onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Explain why this correction is needed"
              required
            />
          </div>
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <div className="modal-overlay" onClick={closePoCorrectionForm}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Correct PO Ledger Impact</h2>
          <button className="close-btn" onClick={closePoCorrectionForm}>
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handlePoCorrectionSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-desktop-po-number">PO Number</label>
              <input id="po-correction-desktop-po-number" type="text" value={selectedCorrectionOrder.po_number || '-'} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-desktop-distributor">Distributor</label>
              <input id="po-correction-desktop-distributor" type="text" value={selectedCorrectionOrder.distributor_name || getDistributorName(selectedCorrectionOrder)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-desktop-expected-impact">Expected PO Impact</label>
              <input id="po-correction-desktop-expected-impact" type="text" value={formatCurrency(poCorrectionContext.expectedAmount)} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-desktop-current-impact">Current Ledger Impact</label>
              <input id="po-correction-desktop-current-impact" type="text" value={formatCurrency(poCorrectionContext.currentImpact)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-desktop-delta">Adjustment Needed (Delta)</label>
              <input id="po-correction-desktop-delta" type="text" value={formatCurrency(poCorrectionContext.delta)} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-desktop-linked-entries">Linked Entries</label>
              <input id="po-correction-desktop-linked-entries" type="text" value={String(poCorrectionContext.linkedEntries)} readOnly />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-desktop-type">Correction Type *</label>
              <select
                id="po-correction-desktop-type"
                name="type"
                value={poCorrectionFormData.type}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="payment">Payment (Reduce due)</option>
                <option value="credit">Credit (Increase due)</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-desktop-amount">Amount *</label>
              <input
                id="po-correction-desktop-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                value={poCorrectionFormData.amount}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, amount: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-desktop-mode">Mode</label>
              <select
                id="po-correction-desktop-mode"
                name="payment_mode"
                value={poCorrectionFormData.payment_mode}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="po-correction-desktop-date">Date</label>
              <input
                id="po-correction-desktop-date"
                name="transaction_date"
                type="date"
                value={poCorrectionFormData.transaction_date}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="po-correction-desktop-reference">Reference</label>
              <input
                id="po-correction-desktop-reference"
                name="reference"
                type="text"
                value={poCorrectionFormData.reference}
                onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="PO number or correction reference"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="po-correction-desktop-reason">Correction Reason *</label>
            <textarea
              id="po-correction-desktop-reason"
              name="reason"
              rows="3"
              value={poCorrectionFormData.reason}
              onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Explain why this correction is needed"
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closePoCorrectionForm} disabled={poCorrectionSubmitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={poCorrectionSubmitting}>
              {poCorrectionSubmitting ? 'Posting...' : 'Post Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PoCorrectionModal;
