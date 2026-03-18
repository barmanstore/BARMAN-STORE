import React, { useState, useEffect } from 'react';
import { Download, Trash2, Search } from 'lucide-react';
import { billingApi } from '../../../shared/services/api';
import { sendWhatsAppSmart } from '../../../shared/utils/whatsapp';
import {
  buildBillShareTextForBill,
  buildBillSmsText,
  downloadBillPdf,
  printBillInvoice
} from './utils/billsViewerHelpers';
import AdminPageHeader from '../../admin/components/AdminPageHeader';
import AdminToolbar from '../../admin/components/AdminToolbar';
import './BillsViewer.css';

const BillsViewer = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedBillLoading, setSelectedBillLoading] = useState(false);
  const [selectedBillError, setSelectedBillError] = useState('');

  // Fetch all bills
  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingApi.getAll();
      setBills(data || []);
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError('Failed to load bills. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBill = async (bill) => {
    if (!bill?.id) return;
    setSelectedBill(bill);
    setSelectedBillError('');
    setSelectedBillLoading(true);
    try {
      const detailed = await billingApi.getById(bill.id);
      setSelectedBill(detailed || bill);
    } catch (err) {
      console.error('Error loading bill details:', err);
      setSelectedBillError('Failed to load bill details. Showing summary only.');
    } finally {
      setSelectedBillLoading(false);
    }
  };

  const deleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;

    try {
      const response = await fetch(`/api/bills/${billId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete bill');
      setBills(bills.filter(b => b.id !== billId));
      setSelectedBill(null);
      alert('Bill deleted successfully');
    } catch (err) {
      console.error('Error deleting bill:', err);
      alert('Error deleting bill: ' + err.message);
    }
  };

  const handlePrint = (bill) => printBillInvoice(bill);

  const handleCopyShare = async (bill) => {
    const text = buildBillShareTextForBill(bill);
    try {
      await navigator.clipboard.writeText(text);
      alert('Bill text copied.');
    } catch (err) {
      alert('Failed to copy bill text.');
    }
  };

  const handleCopySms = async (bill) => {
    const text = buildBillSmsText(bill);
    try {
      await navigator.clipboard.writeText(text);
      alert('SMS text copied.');
    } catch (err) {
      alert('Failed to copy SMS text.');
    }
  };

  const handleSendWhatsApp = async (bill) => {
    const result = await sendWhatsAppSmart({
      phone: bill?.customer_phone,
      text: buildBillShareTextForBill(bill),
    });
    if (result.status === 'missing_phone') {
      alert('Customer phone is missing or invalid. Please update phone and try again.');
      return;
    }
    if (result.status === 'fallback_copy') {
      alert('Message was long, copied to clipboard. Paste it in WhatsApp.');
      return;
    }
    if (result.status === 'fallback_no_copy') {
      alert('Message was long. Opened WhatsApp chat, please paste message manually.');
    }
  };

  const filteredBills = bills.filter(bill =>
    bill.bill_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bill.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bill.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="bills-viewer-loading">Loading bills...</div>;

  return (
    <div className="bills-viewer">
      <AdminPageHeader
        className="bills-viewer-header"
        title="Bills History"
        subtitle="View and manage all created bills"
      />

      {error && (
        <div className="bills-viewer-error">
          {error}
          <button onClick={fetchBills}>Retry</button>
        </div>
      )}

      <AdminToolbar className="bills-viewer-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            id="bill-search"
            name="bill-search"
            placeholder="Search by bill number, customer name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="refresh-btn" onClick={fetchBills}>
          Refresh
        </button>
      </AdminToolbar>

      {filteredBills.length === 0 ? (
        <div className="bills-viewer-empty">
          <p>No bills found</p>
        </div>
      ) : (
        <div className="bills-viewer-content">
          <div className="bills-list">
            {filteredBills.map(bill => (
              <div
                key={bill.id}
                className={`bill-card ${selectedBill?.id === bill.id ? 'active' : ''}`}
                onClick={() => handleSelectBill(bill)}
              >
                <div className="bill-card-header">
                  <span className="bill-number">{bill.bill_number}</span>
                  <span className="bill-amount">?{bill.total_amount}</span>
                </div>
                <div className="bill-card-details">
                  <p><strong>{bill.customer_name}</strong></p>
                  <p className="bill-date">
                    {new Date(bill.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="bill-card-status">
                  <span className={`status-badge ${bill.payment_status}`}>
                    {bill.payment_status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {selectedBill && (
            <div className="bill-details">
              <div className="bill-details-header">
                <h2>{selectedBill.bill_number}</h2>
                <div className="bill-details-actions">
                  <button
                    className="action-btn print-btn"
                    onClick={() => handlePrint(selectedBill)}
                    title="Print / Save as PDF"
                  >
                    Print/PDF
                  </button>
                  <button
                    className="action-btn download-btn"
                    onClick={() => downloadBillPdf(selectedBill)}
                    title="Download PDF"
                  >
                    <Download size={18} /> PDF
                  </button>
                  <button
                    className="action-btn share-btn"
                    onClick={() => handleCopyShare(selectedBill)}
                    title="Copy bill text"
                  >
                    Copy
                  </button>
                  <button
                    className="action-btn sms-btn"
                    onClick={() => handleCopySms(selectedBill)}
                    title="Copy SMS text"
                  >
                    SMS
                  </button>
                  <button
                    type="button"
                    className="action-btn whatsapp-btn"
                    onClick={() => handleSendWhatsApp(selectedBill)}
                    title="Share via WhatsApp"
                  >
                    WhatsApp
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => deleteBill(selectedBill.id)}
                    title="Delete bill"
                  >
                    <Trash2 size={18} /> Delete
                  </button>
                </div>
              </div>

              {selectedBillLoading ? <div className="loading-indicator">Loading bill details...</div> : null}
              {selectedBillError ? <div className="bills-viewer-error">{selectedBillError}</div> : null}

              <div className="bill-details-section">
                <h3>Customer Information</h3>
                <div className="detail-row">
                  <label>Name:</label>
                  <span>{selectedBill.customer_name}</span>
                </div>
                <div className="detail-row">
                  <label>Email:</label>
                  <span>{selectedBill.customer_email}</span>
                </div>
                <div className="detail-row">
                  <label>Phone:</label>
                  <span>{selectedBill.customer_phone}</span>
                </div>
                {selectedBill.customer_address && (
                  <div className="detail-row">
                    <label>Address:</label>
                    <span>{selectedBill.customer_address}</span>
                  </div>
                )}
              </div>

              {selectedBill.items && selectedBill.items.length > 0 && (
                <div className="bill-details-section">
                  <h3>Bill Items</h3>
                  <table className="bill-items-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>MRP</th>
                        <th>Discount</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBill.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.product_name}</td>
                          <td>{item.qty}</td>
                          <td>{item.unit}</td>
                          <td>?{item.mrp}</td>
                          <td>?{item.discount}</td>
                          <td>?{item.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bill-details-section">
                <h3>Payment Summary</h3>
                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>?{selectedBill.subtotal}</span>
                </div>
                <div className="summary-row">
                  <span>Discount:</span>
                  <span>?{selectedBill.discount_amount}</span>
                </div>
                <div className="summary-row highlight">
                  <span>Total:</span>
                  <span>?{selectedBill.total_amount}</span>
                </div>
                <div className="summary-row">
                  <span>Paid Amount:</span>
                  <span>?{selectedBill.paid_amount ?? 0}</span>
                </div>
                <div className="summary-row">
                  <span>Credit Amount:</span>
                  <span>?{selectedBill.credit_amount ?? 0}</span>
                </div>
                <div className="summary-row">
                  <span>Payment Method:</span>
                  <span>{selectedBill.payment_method}</span>
                </div>
                <div className="summary-row">
                  <span>Payment Status:</span>
                  <span className={`status-badge ${selectedBill.payment_status}`}>
                    {selectedBill.payment_status}
                  </span>
                </div>
                <div className="summary-row">
                  <span>Created:</span>
                  <span>{new Date(selectedBill.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BillsViewer;



