import { X } from 'lucide-react';
import MobileBottomSheet from '../../../../../components/mobile/MobileBottomSheet';

const LedgerEntryModal = ({
  isMobile,
  showLedgerForm,
  closeLedgerForm,
  ledgerSubmitting,
  handleLedgerSubmit,
  ledgerFormData,
  setLedgerFormData,
  distributors,
}) => {
  if (!showLedgerForm) return null;

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        onClose={closeLedgerForm}
        title="Add Distributor Payment / Credit"
        className="purchase-ledger-sheet"
        actions={(
          <>
            <button type="button" className="cancel-btn" onClick={closeLedgerForm} disabled={ledgerSubmitting}>
              Cancel
            </button>
            <button type="submit" form="purchase-ledger-form" className="submit-btn" disabled={ledgerSubmitting}>
              {ledgerSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </>
        )}
      >
        <form id="purchase-ledger-form" onSubmit={handleLedgerSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ledger-mobile-distributor">Distributor *</label>
              <select
                id="ledger-mobile-distributor"
                name="distributor_id"
                value={ledgerFormData.distributor_id}
                onChange={e => setLedgerFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                required
              >
                <option value="">Select distributor</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ledger-mobile-type">Type *</label>
              <select
                id="ledger-mobile-type"
                name="type"
                value={ledgerFormData.type}
                onChange={e => setLedgerFormData(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="payment">Payment (Reduce due)</option>
                <option value="credit">Credit (Increase due)</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ledger-mobile-amount">Amount *</label>
              <input
                id="ledger-mobile-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={ledgerFormData.amount}
                onChange={e => setLedgerFormData(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="Enter amount"
                required
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label htmlFor="ledger-mobile-payment-mode">Payment Mode</label>
              <select
                id="ledger-mobile-payment-mode"
                name="payment_mode"
                value={ledgerFormData.payment_mode}
                onChange={e => setLedgerFormData(prev => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ledger-mobile-transaction-date">Transaction Date</label>
              <input
                id="ledger-mobile-transaction-date"
                name="transaction_date"
                type="date"
                value={ledgerFormData.transaction_date}
                onChange={e => setLedgerFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="ledger-mobile-reference">Reference</label>
              <input
                id="ledger-mobile-reference"
                name="reference"
                type="text"
                value={ledgerFormData.reference}
                onChange={e => setLedgerFormData(prev => ({ ...prev, reference: e.target.value }))}
                placeholder="Invoice / PO / Bank ref"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="ledger-mobile-description">Description</label>
            <textarea
              id="ledger-mobile-description"
              name="description"
              rows="2"
              value={ledgerFormData.description}
              onChange={e => setLedgerFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </form>
      </MobileBottomSheet>
    );
  }

  return (
    <div className="modal-overlay" onClick={closeLedgerForm}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Distributor Payment / Credit</h2>
          <button className="close-btn" onClick={closeLedgerForm} disabled={ledgerSubmitting}>
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleLedgerSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ledger-desktop-distributor">Distributor *</label>
              <select
                id="ledger-desktop-distributor"
                name="distributor_id"
                value={ledgerFormData.distributor_id}
                onChange={e => setLedgerFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                required
              >
                <option value="">Select distributor</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ledger-desktop-type">Type *</label>
              <select
                id="ledger-desktop-type"
                name="type"
                value={ledgerFormData.type}
                onChange={e => setLedgerFormData(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="payment">Payment (Reduce due)</option>
                <option value="credit">Credit (Increase due)</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ledger-desktop-amount">Amount *</label>
              <input
                id="ledger-desktop-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={ledgerFormData.amount}
                onChange={e => setLedgerFormData(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="Enter amount"
                required
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label htmlFor="ledger-desktop-payment-mode">Payment Mode</label>
              <select
                id="ledger-desktop-payment-mode"
                name="payment_mode"
                value={ledgerFormData.payment_mode}
                onChange={e => setLedgerFormData(prev => ({ ...prev, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ledger-desktop-transaction-date">Transaction Date</label>
              <input
                id="ledger-desktop-transaction-date"
                name="transaction_date"
                type="date"
                value={ledgerFormData.transaction_date}
                onChange={e => setLedgerFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="ledger-desktop-reference">Reference</label>
              <input
                id="ledger-desktop-reference"
                name="reference"
                type="text"
                value={ledgerFormData.reference}
                onChange={e => setLedgerFormData(prev => ({ ...prev, reference: e.target.value }))}
                placeholder="Invoice / PO / Bank ref"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="ledger-desktop-description">Description</label>
            <textarea
              id="ledger-desktop-description"
              name="description"
              rows="2"
              value={ledgerFormData.description}
              onChange={e => setLedgerFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closeLedgerForm} disabled={ledgerSubmitting}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={ledgerSubmitting}>
              {ledgerSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LedgerEntryModal;
