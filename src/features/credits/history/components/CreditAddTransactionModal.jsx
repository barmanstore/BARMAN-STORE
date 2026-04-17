import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, FileText, Paperclip } from 'lucide-react';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import { formatCurrency } from '../../../../shared/utils/formatters';
import WindowModal from '../../../../shared/components/window/WindowModal';

const formatIndianDateDisplay = (dateValue) => {
  const normalized = String(dateValue || '').trim();
  if (!normalized) return 'Not set';
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return normalized;
  return `${day}/${month}/${year}`;
};

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
  customer,
  balance,
  balanceSummary,
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Reset details section when the modal opens or transaction type changes.
  useEffect(() => {
    if (showAddModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailsExpanded(false);
    }
  }, [showAddModal, newTransaction.type]);

  if (!showAddModal) return null;

  const entryToneClass = newTransaction.type === 'given' ? 'given' : 'payment';
  const balanceToneClass = String(balanceSummary?.toneClass || 'neutral').trim() || 'neutral';
  const referenceSummary = String(newTransaction.reference || '').trim() || 'Not set';
  const attachmentSummary = String(newTransaction.attachmentName || '').trim() || 'None';
  const customerName = String(customer?.name || '').trim() || 'Customer';
  const balanceHeadline = String(balanceSummary?.headline || 'Current balance').trim() || 'Current balance';
  const balanceAmount = formatCurrency(Math.abs(Number(balance || 0)));

  return (
    <WindowModal
      open
      title={addModalTitle}
      onClose={closeAddModal}
      dismissible={!addingTransaction}
      dialogClassName={`modal-content fade-in-up credit-entry-modal ${entryToneClass}`}
      headerClassName={`modal-header credit-entry-window-header ${entryToneClass}`}
      closeButtonClassName="close-btn"
      themeClassName="credit-history-page"
      initialSize={{ width: 520, height: 620 }}
    >
      <form onSubmit={handleAddTransaction}>
        <div className={`credit-entry-tone balance-${balanceToneClass}`}>
          <span className="credit-entry-tone-customer">{customerName}</span>
          <span className="credit-entry-tone-label">{balanceHeadline}</span>
          <strong className="credit-entry-tone-balance">{balanceAmount}</strong>
        </div>

        <div className="form-group credit-entry-primary credit-entry-amount">
          <label htmlFor="credit-tx-amount">Amount (Rs)</label>
          <CalculatedAmountInput
            id="credit-tx-amount"
            name="amount"
            value={newTransaction.amount}
            onValueChange={(nextValue) => setNewTransaction((current) => ({ ...current, amount: nextValue }))}
            placeholder="Enter amount (Rs)"
            required
            autoFocus
            inputClassName="credit-entry-amount-input"
          />
        </div>

        <div className="form-group credit-entry-primary">
          <label htmlFor="credit-tx-description">Note</label>
          <input
            id="credit-tx-description"
            name="description"
            type="text"
            value={newTransaction.description}
            onChange={(event) => setNewTransaction((current) => ({ ...current, description: event.target.value }))}
            placeholder={newTransaction.type === 'given' ? 'Manual sale' : 'Payment received'}
          />
        </div>

        <div className="credit-entry-details-summary" aria-live="polite">
          <div className="credit-entry-summary-item">
            <CalendarDays size={15} />
            <span>Date: {formatIndianDateDisplay(newTransaction.transactionDate)}</span>
          </div>
          <div className="credit-entry-summary-item">
            <FileText size={15} />
            <span>Reference: {referenceSummary}</span>
          </div>
          <div className="credit-entry-summary-item">
            <Paperclip size={15} />
            <span>Attachment: {attachmentSummary}</span>
          </div>
        </div>

        <button
          type="button"
          className="credit-entry-details-toggle"
          onClick={() => setDetailsExpanded((current) => !current)}
          disabled={addingTransaction || uploading}
          aria-expanded={detailsExpanded ? 'true' : 'false'}
          aria-controls="credit-entry-details-panel"
        >
          {detailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {detailsExpanded ? 'Hide details' : 'Edit details'}
        </button>

        {detailsExpanded ? (
          <div id="credit-entry-details-panel" className="credit-entry-details-panel">
            <div className="form-group">
              <label htmlFor="credit-tx-date">Date</label>
              <input
                id="credit-tx-date"
                name="transaction_date"
                type="date"
                value={newTransaction.transactionDate}
                onChange={(event) => setNewTransaction((current) => ({ ...current, transactionDate: event.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="credit-tx-reference">Reference (optional)</label>
              <input
                id="credit-tx-reference"
                name="reference"
                type="text"
                value={newTransaction.reference}
                onChange={(event) => setNewTransaction((current) => ({ ...current, reference: event.target.value }))}
                placeholder="Bill no / receipt / reason"
              />
            </div>

            <div className="form-group">
              <label htmlFor="credit-tx-attachment">Attachment (optional)</label>
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
          </div>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={closeAddModal} disabled={addingTransaction}>
            Cancel
          </button>
          <button
            type="submit"
            className={`submit-btn ${entryToneClass}`}
            disabled={addingTransaction || uploading}
          >
            {addingTransaction ? 'Saving...' : uploading ? 'Preparing File...' : 'Save'}
          </button>
        </div>
      </form>
    </WindowModal>
  );
};

export default CreditAddTransactionModal;
