import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import WindowModal from '../../../../shared/components/window/WindowModal';

const CreditAddTransactionModal = ({
  showAddModal,
  closeAddModal,
  addingTransaction,
  handleAddTransaction,
  newTransaction,
  setNewTransaction,
  handleClearAttachment,
  fileInputRef,
  handleFileUpload,
  uploading,
  addModalTitle,
  addModalActionLabel,
}) => {
  if (!showAddModal) return null;

  return (
    <WindowModal
      open
      title={addModalTitle}
      onClose={closeAddModal}
      dismissible={!addingTransaction}
      dialogClassName="credit-history-modal-frame fade-in-up"
      headerClassName="credit-history-modal-header"
      contentClassName="credit-history-modal-body"
      closeButtonClassName="credit-history-modal-close-btn"
      themeClassName="credit-history-page"
      initialSize={{ width: 520, height: 620 }}
    >
      <form onSubmit={handleAddTransaction}>
        <div className="form-group">
          <label>Amount (Rs)</label>
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
            onChange={(event) => setNewTransaction({ ...newTransaction, transactionDate: event.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>Note *</label>
          <input
            id="credit-tx-description"
            name="description"
            type="text"
            value={newTransaction.description}
            onChange={(event) => setNewTransaction({ ...newTransaction, description: event.target.value })}
            placeholder={`Add a short note for this ${addModalActionLabel.toLowerCase()}`}
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
            onChange={(event) => setNewTransaction({ ...newTransaction, reference: event.target.value })}
            placeholder="Bill number, receipt number, or note"
          />
        </div>

        <div className="form-group">
          <label>File Upload</label>
          <input
            ref={fileInputRef}
            id="credit-tx-attachment"
            name="attachment"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileUpload}
            disabled={addingTransaction || uploading}
          />
          {newTransaction.attachmentName ? (
            <div className="credit-ledger-note">
              <span>{newTransaction.attachmentName}</span>
              <button
                type="button"
                className="admin-btn"
                onClick={handleClearAttachment}
                disabled={addingTransaction || uploading}
              >
                Remove File
              </button>
            </div>
          ) : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={closeAddModal} disabled={addingTransaction}>
            Cancel
          </button>
          <button type="submit" className="submit-btn" disabled={addingTransaction || uploading}>
            {addingTransaction ? 'Saving...' : uploading ? 'Preparing File...' : `Save ${addModalActionLabel}`}
          </button>
        </div>
      </form>
    </WindowModal>
  );
};

export default CreditAddTransactionModal;
