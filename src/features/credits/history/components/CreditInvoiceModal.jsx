import { Printer, X } from 'lucide-react';
import SignedCurrency from '../../../../shared/components/SignedCurrency';

const CreditInvoiceModal = ({
  showInvoiceModal,
  selectedTransaction,
  setShowInvoiceModal,
  formatTransactionDate,
  customer,
  getTypeLabel,
  printInvoice,
}) => {
  if (!showInvoiceModal || !selectedTransaction) return null;

  return (
    <div className="modal-overlay invoice-modal-overlay" onClick={() => setShowInvoiceModal(false)}>
      <div className="invoice-template fade-in-up" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="invoice-close-btn"
          onClick={() => setShowInvoiceModal(false)}
          aria-label="Close invoice"
        >
          <X size={20} />
        </button>
        <div className="invoice-header">
          <h1>INVOICE</h1>
          <div className="company-details">
            <h3>Barman Store</h3>
            <p>Quality Groceries & Everyday Essentials</p>
            <p>Email: info@barmanstore.com</p>
          </div>
        </div>

        <div className="invoice-details">
          <div className="invoice-info">
            <p><strong>Invoice #:</strong> {selectedTransaction.invoice_number}</p>
            <p><strong>Date:</strong> {formatTransactionDate(selectedTransaction, { long: true })}</p>
          </div>
          <div className="customer-info">
            <h4>Bill To:</h4>
            <p><strong>{customer?.name}</strong></p>
            <p>{customer?.email || 'No email'}</p>
            <p>{customer?.phone || 'No phone'}</p>
            {customer?.address && <p>{customer.address}</p>}
          </div>
        </div>

        <table className="invoice-items">
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{selectedTransaction.description}</td>
              <td>{getTypeLabel(selectedTransaction.type)}</td>
              <td><SignedCurrency amount={parseFloat(selectedTransaction.amount)} /></td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-summary">
          <div className="summary-row">
            <span>Previous Balance:</span>
            <span><SignedCurrency amount={parseFloat(selectedTransaction.balance) + parseFloat(selectedTransaction.amount)} /></span>
          </div>
          <div className="summary-row">
            <span>Amount:</span>
            <span><SignedCurrency amount={parseFloat(selectedTransaction.amount)} /></span>
          </div>
          <div className="summary-row total">
            <span>Current Balance:</span>
            <span><SignedCurrency amount={parseFloat(selectedTransaction.balance)} /></span>
          </div>
        </div>

        {selectedTransaction.reference && (
          <div className="invoice-footer">
            <p><strong>Reference:</strong> {selectedTransaction.reference}</p>
          </div>
        )}

        <div className="invoice-actions no-print">
          <button className="admin-btn" onClick={printInvoice}>
            <Printer size={16} /> Print Invoice
          </button>
          <button className="admin-btn secondary" onClick={() => setShowInvoiceModal(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditInvoiceModal;
