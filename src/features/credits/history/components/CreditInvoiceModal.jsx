import { Printer } from 'lucide-react';
import WindowModal from '../../../../shared/components/window/WindowModal';
import { formatCurrency } from '../../../../shared/utils/formatters';
import {
  getCreditBalanceMeta,
  getCreditEntryDescription,
  getCreditEntrySourceLabel,
  getCreditEntryTypeLabel,
  getCreditPreviousBalance,
} from '../utils/creditLedgerPresentation';

const CreditInvoiceModal = ({
  showInvoiceModal,
  selectedTransaction,
  setShowInvoiceModal,
  formatTransactionDate,
  customer,
  printInvoice,
}) => {
  if (!showInvoiceModal || !selectedTransaction) return null;

  const sourceLabel = getCreditEntrySourceLabel(selectedTransaction);
  const entryTypeLabel = getCreditEntryTypeLabel(selectedTransaction);
  const description = getCreditEntryDescription(selectedTransaction);
  const previousBalance = getCreditPreviousBalance(selectedTransaction);
  const currentBalance = Number(selectedTransaction.balance || 0);
  const balanceMeta = getCreditBalanceMeta(currentBalance);

  return (
    <WindowModal
      open
      title={`${entryTypeLabel} ${sourceLabel !== '-' ? sourceLabel : `#${selectedTransaction.id}`}`.trim()}
      onClose={() => setShowInvoiceModal(false)}
      dialogClassName="credit-history-invoice-frame fade-in-up"
      headerClassName="credit-history-modal-header"
      contentClassName="credit-history-invoice-body"
      closeButtonClassName="credit-history-modal-close-btn"
      themeClassName="credit-history-page"
      initialSize={{ width: 920, height: 820 }}
    >
      <div className="invoice-header">
        <h1>LEDGER ENTRY</h1>
        <div className="company-details">
          <h3>Barman Store</h3>
          <p>Customer credit ledger record</p>
          <p>Reference: {sourceLabel}</p>
        </div>
      </div>

      <div className="invoice-details">
        <div className="invoice-info">
          <p><strong>Entry #:</strong> {selectedTransaction.id}</p>
          <p><strong>Date:</strong> {formatTransactionDate(selectedTransaction, { long: true })}</p>
          <p><strong>Type:</strong> {entryTypeLabel}</p>
        </div>
        <div className="customer-info">
          <h4>Customer</h4>
          <p><strong>{customer?.name}</strong></p>
          <p>{customer?.email || 'No email'}</p>
          <p>{customer?.phone || 'No phone'}</p>
          {customer?.address && <p>{customer.address}</p>}
        </div>
      </div>

      <table className="invoice-items">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Description</th>
            <th>Movement</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{sourceLabel}</td>
            <td>{description}</td>
            <td>{formatCurrency(Number(selectedTransaction.amount || 0))}</td>
          </tr>
        </tbody>
      </table>

      <div className="invoice-summary">
        <div className="summary-row">
          <span>Previous Balance:</span>
          <span>{formatCurrency(Math.abs(previousBalance))}</span>
        </div>
        <div className="summary-row">
          <span>Movement:</span>
          <span>{formatCurrency(Number(selectedTransaction.amount || 0))}</span>
        </div>
        <div className="summary-row total">
          <span>{balanceMeta.label} Balance:</span>
          <span>{formatCurrency(Math.abs(currentBalance))}</span>
        </div>
      </div>

      <div className="invoice-actions no-print">
        <button className="admin-btn" onClick={printInvoice}>
          <Printer size={16} /> Print Entry
        </button>
        <button className="admin-btn secondary" onClick={() => setShowInvoiceModal(false)}>
          Close
        </button>
      </div>
    </WindowModal>
  );
};

export default CreditInvoiceModal;
