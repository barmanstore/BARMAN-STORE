import React, { useState, useEffect, useRef } from 'react';
import { Download, Trash2, Search } from 'lucide-react';
import { billingApi } from '../../../shared/services/api';
import { hasCapability } from '../../../shared/auth/capabilities';
import { sendWhatsAppSmart } from '../../../shared/utils/whatsapp';
import {
  buildBillShareTextForBill,
  buildBillSmsText,
  downloadBillPdf,
  printBillInvoice,
} from './utils/billsViewerHelpers';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import BackofficeToolbar from '../../../shared/components/backoffice/BackofficeToolbar';
import './BillsViewer.css';

const BillsViewer = ({ user }) => {
  const pageSize = 25;
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedBillLoading, setSelectedBillLoading] = useState(false);
  const [selectedBillError, setSelectedBillError] = useState('');
  const [actionFeedback, setActionFeedback] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const feedbackTimerRef = useRef(null);
  const canDeleteBills = hasCapability(user, 'delete_bills');

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void fetchBills({ nextPage: page, nextQuery: searchTerm });
      },
      searchTerm ? 180 : 0
    );
    return () => window.clearTimeout(timer);
  }, [page, searchTerm]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const pushFeedback = (text, type = 'success') => {
    setActionFeedback({ text, type });
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setActionFeedback(null);
    }, 5000);
  };

  const fetchBills = async ({ nextPage = page, nextQuery = searchTerm } = {}) => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingApi.getAll({
        paginated: 1,
        page: nextPage,
        limit: pageSize,
        q: String(nextQuery || '').trim(),
      });
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const totalCount = Number(data?.total || items.length || 0);
      setBills(items);
      setTotal(totalCount);
      if (nextPage > 1 && items.length === 0 && totalCount > 0) {
        setPage(nextPage - 1);
      }
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
    setDeleteCandidate(null);
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

  const requestDeleteBill = (billId) => {
    if (!canDeleteBills) {
      pushFeedback('You do not have permission to delete bills.', 'error');
      return;
    }
    const candidate = bills.find((bill) => bill.id === billId) || selectedBill || null;
    setDeleteCandidate(candidate);
  };

  const confirmDeleteBill = async () => {
    if (!deleteCandidate?.id || deleteSubmitting) return;
    try {
      setDeleteSubmitting(true);
      await billingApi.delete(deleteCandidate.id);
      setSelectedBill(null);
      setDeleteCandidate(null);
      const shouldMoveBack = bills.length === 1 && page > 1;
      if (shouldMoveBack) {
        setPage(page - 1);
      } else {
        void fetchBills({ nextPage: page, nextQuery: searchTerm });
      }
      pushFeedback('Bill deleted successfully.', 'success');
    } catch (err) {
      console.error('Error deleting bill:', err);
      pushFeedback('Failed to delete bill. Please try again.', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const cancelDeleteBill = () => {
    setDeleteCandidate(null);
  };

  const handlePrint = (bill) =>
    printBillInvoice(bill, {
      onError: (message) => pushFeedback(message || 'Unable to open the print view.', 'error'),
    });

  const handleCopyShare = async (bill) => {
    const text = buildBillShareTextForBill(bill);
    try {
      await navigator.clipboard.writeText(text);
      pushFeedback('Bill text copied.', 'success');
    } catch (err) {
      pushFeedback('Failed to copy bill text.', 'error');
    }
  };

  const handleCopySms = async (bill) => {
    const text = buildBillSmsText(bill);
    try {
      await navigator.clipboard.writeText(text);
      pushFeedback('SMS text copied.', 'success');
    } catch (err) {
      pushFeedback('Failed to copy SMS text.', 'error');
    }
  };

  const handleSendWhatsApp = async (bill) => {
    const result = await sendWhatsAppSmart({
      phone: bill?.customer_phone,
      text: buildBillShareTextForBill(bill),
    });
    if (result.status === 'blocked_no_phone') {
      pushFeedback(
        'Customer phone is missing or invalid. Please update phone and try again.',
        'error'
      );
      return;
    }
    if (result.status === 'opened_with_copy') {
      pushFeedback('Copied message. WhatsApp opened; paste and send to share.', 'success');
      return;
    }
    if (result.status === 'opened_without_copy') {
      pushFeedback('WhatsApp opened. Please paste the message manually.', 'success');
    }
  };

  const filteredBills = bills;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading) return <div className="bills-viewer-loading">Loading bills...</div>;

  return (
    <div className="bills-viewer">
      <BackofficePageHeader
        className="bills-viewer-header"
        title="Bills History"
        subtitle="View and manage all created bills"
      />

      {actionFeedback?.text ? (
        <div className={`bills-viewer-feedback ${actionFeedback.type || ''}`} role="status">
          <span>{actionFeedback.text}</span>
          <button type="button" onClick={() => setActionFeedback(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error && (
        <div className="bills-viewer-error">
          {error}
          <button
            onClick={() => {
              void fetchBills({ nextPage: page, nextQuery: searchTerm });
            }}
          >
            Retry
          </button>
        </div>
      )}

      <BackofficeToolbar className="bills-viewer-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            id="bill-search"
            name="bill-search"
            placeholder="Search by bill number, customer name, or email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <button
          className="refresh-btn"
          onClick={() => {
            void fetchBills({ nextPage: page, nextQuery: searchTerm });
          }}
        >
          Refresh
        </button>
      </BackofficeToolbar>
      <div className="admin-pagination bills-pagination">
        <span className="admin-pagination-label">
          Page {page} of {totalPages} | {total} bills
        </span>
        <div className="admin-pagination-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </button>
        </div>
      </div>

      {filteredBills.length === 0 ? (
        <div className="bills-viewer-empty">
          <p>No bills found</p>
        </div>
      ) : (
        <div className="bills-viewer-content">
          <div className="bills-list">
            {filteredBills.map((bill) => (
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
                  <p>
                    <strong>{bill.customer_name}</strong>
                  </p>
                  <p className="bill-date">{new Date(bill.created_at).toLocaleDateString()}</p>
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
                  {canDeleteBills ? (
                    <button
                      className="action-btn delete-btn"
                      onClick={() => requestDeleteBill(selectedBill.id)}
                      title="Delete bill"
                    >
                      <Trash2 size={18} /> Delete
                    </button>
                  ) : null}
                </div>
              </div>

              {deleteCandidate?.id === selectedBill?.id ? (
                <div className="bill-delete-confirm" role="alert">
                  <p>Delete bill {deleteCandidate.bill_number}? This action cannot be undone.</p>
                  <div className="bill-delete-actions">
                    <button
                      type="button"
                      className="action-btn delete-btn"
                      onClick={confirmDeleteBill}
                      disabled={deleteSubmitting}
                    >
                      {deleteSubmitting ? 'Deleting...' : 'Delete Bill'}
                    </button>
                    <button
                      type="button"
                      className="action-btn cancel-btn"
                      onClick={cancelDeleteBill}
                      disabled={deleteSubmitting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedBillLoading ? (
                <div className="loading-indicator">Loading bill details...</div>
              ) : null}
              {selectedBillError ? (
                <div className="bills-viewer-error">{selectedBillError}</div>
              ) : null}

              <div className="bill-details-section">
                <h3>Customer Information</h3>
                <div className="detail-row">
                  <span className="detail-label">Name:</span>
                  <span>{selectedBill.customer_name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email:</span>
                  <span>{selectedBill.customer_email}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone:</span>
                  <span>{selectedBill.customer_phone}</span>
                </div>
                {selectedBill.customer_address && (
                  <div className="detail-row">
                    <span className="detail-label">Address:</span>
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
                          <td>
                            <div>{item.product_name}</div>
                            {String(item.offer_label || '').trim() ? (
                              <small>{item.offer_label}</small>
                            ) : null}
                          </td>
                          <td>{item.qty}</td>
                          <td>{item.unit}</td>
                          <td>?{item.mrp}</td>
                          <td>
                            <div>?{item.discount}</div>
                            {Number(item.offer_discount || 0) > 0 ? (
                              <small>Offer ?{item.offer_discount}</small>
                            ) : null}
                            {Number(item.manual_discount || 0) > 0 ? (
                              <small>Manual ?{item.manual_discount}</small>
                            ) : null}
                          </td>
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
