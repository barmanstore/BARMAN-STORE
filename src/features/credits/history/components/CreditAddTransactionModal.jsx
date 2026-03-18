import { FileText, Upload } from 'lucide-react';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';

const CreditAddTransactionModal = ({
  showAddModal,
  closeAddModal,
  addingTransaction,
  handleAddTransaction,
  newTransaction,
  setNewTransaction,
  fileInputRef,
  handleFileUpload,
  uploading,
  addModalTitle,
  addModalActionLabel,
}) => {
  if (!showAddModal) return null;

  return (
    <div className="modal-overlay" onClick={closeAddModal}>
      <div className="modal-content fade-in-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{addModalTitle}</h2>
          <button className="close-btn" onClick={closeAddModal} disabled={addingTransaction}>x</button>
        </div>
        <form onSubmit={handleAddTransaction}>
          <div className="form-group">
            <label>Transaction Type</label>
            <select
              id="credit-tx-type"
              name="transaction_type"
              value={newTransaction.type}
              onChange={(e) => setNewTransaction({ ...newTransaction, type: e.target.value })}
            >
              <option value="given">Credit (customer will give)</option>
              <option value="payment">Payment (customer paid)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Amount (₹)</label>
            <CalculatedAmountInput
              id="credit-tx-amount"
              name="amount"
              value={newTransaction.amount}
              onValueChange={(nextValue) => setNewTransaction({ ...newTransaction, amount: nextValue })}
              placeholder="Enter amount or expression like (5+7)*100/35+56-25"
              required
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              id="credit-tx-date"
              name="transaction_date"
              type="date"
              value={newTransaction.transactionDate}
              onChange={(e) => setNewTransaction({ ...newTransaction, transactionDate: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Description *</label>
            <input
              id="credit-tx-description"
              name="description"
              type="text"
              value={newTransaction.description}
              onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
              placeholder="Enter description"
              required
            />
          </div>
          <div className="form-group">
            <label>Reference</label>
            <input
              id="credit-tx-reference"
              name="reference"
              type="text"
              value={newTransaction.reference}
              onChange={(e) => setNewTransaction({ ...newTransaction, reference: e.target.value })}
              placeholder="Reference number (optional)"
            />
          </div>
          <div className="form-group">
            <label>Upload Invoice/Bill</label>
            <div className="file-upload-area">
              <input
                id="credit-tx-invoice-file"
                name="invoice_file"
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*,.pdf"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="upload-btn"
                onClick={() => fileInputRef.current.click()}
                disabled={uploading || addingTransaction}
              >
                <Upload size={16} />
                {uploading ? 'Uploading...' : 'Choose File'}
              </button>
              {newTransaction.imagePath && (
                <span className="uploaded-file">
                  <FileText size={14} /> Invoice uploaded
                </span>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closeAddModal} disabled={addingTransaction}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={addingTransaction}>
              {addingTransaction ? 'Saving...' : `Save ${addModalActionLabel}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreditAddTransactionModal;
