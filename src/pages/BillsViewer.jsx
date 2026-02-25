import React, { useState, useEffect } from 'react';
import { Download, Trash2, Search } from 'lucide-react';
import { billingApi } from '../services/api';
import { sendWhatsAppSmart } from '../utils/whatsapp';
import { printHtmlDocument, escapeHtml } from '../utils/printService';
import { createPdfDoc, addAutoTable, addPdfFooterWithPagination, savePdf, safeFileName } from '../utils/pdfService';
import { buildBillShareText } from '../utils/messageTemplates';
import company from '../config/company';
import * as info from './info';
import './BillsViewer.css';

const BillsViewer = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

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

  const downloadBillPDF = (bill) => {
    const doc = createPdfDoc();
    const primaryColor = [41, 128, 185];
    const secondaryColor = [52, 73, 94];
    const rows = (Array.isArray(bill.items) ? bill.items : []).map((item) => [
      String(item.product_name || item.name || '-'),
      Number(item.qty || item.quantity || 0),
      String(item.unit || '-'),
      { content: `Rs ${Number(item.mrp || 0).toFixed(2)}`, styles: { halign: 'right' } },
      { content: `Rs ${Number(item.discount || 0).toFixed(2)}`, styles: { halign: 'right' } },
      { content: `Rs ${Number(item.amount || 0).toFixed(2)}`, styles: { halign: 'right' } },
    ]);

    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(company.name || 'BARMAN STORE', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${company.address || ''} | ${company.phone || ''}`, 105, 24, { align: 'center' });
    doc.text(`GST: ${company.gstNumber || '-'}`, 105, 31, { align: 'center' });

    doc.setTextColor(...secondaryColor);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill Invoice', 105, 50, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Bill #: ${bill.bill_number || '-'}`, 14, 60);
    doc.text(`Date: ${new Date(bill.created_at || Date.now()).toLocaleString()}`, 14, 66);
    doc.text(`Customer: ${bill.customer_name || '-'}`, 14, 72);
    if (bill.customer_phone) doc.text(`Phone: ${bill.customer_phone}`, 14, 78);
    if (bill.customer_email) doc.text(`Email: ${bill.customer_email}`, 14, 84);
    if (bill.customer_address) doc.text(`Address: ${bill.customer_address}`, 14, 90);

    addAutoTable(doc, {
      startY: 96,
      head: [['Product', 'Qty', 'Unit', 'MRP', 'Discount', 'Amount']],
      body: rows,
      theme: 'striped',
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 14, halign: 'right' },
        2: { cellWidth: 16 },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc.lastAutoTable?.finalY || 96) + 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: Rs ${Number(bill.subtotal || 0).toFixed(2)}`, 130, finalY);
    doc.text(`Discount: Rs ${Number(bill.discount_amount || 0).toFixed(2)}`, 130, finalY + 7);
    doc.text(`Total: Rs ${Number(bill.total_amount || 0).toFixed(2)}`, 130, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Payment: ${bill.payment_method || '-'}`, 14, finalY + 7);
    doc.text(`Status: ${bill.payment_status || '-'}`, 14, finalY + 14);

    addPdfFooterWithPagination(doc, (pdf, i, pageCount) => {
      pdf.setFontSize(8);
      pdf.setTextColor(140, 140, 140);
      pdf.text(
        `Generated on ${new Date().toLocaleString('en-IN')} | Page ${i} of ${pageCount}`,
        105,
        pdf.internal.pageSize.height - 10,
        { align: 'center' }
      );
    });

    savePdf(doc, `${safeFileName(bill.bill_number || 'Bill')}_Invoice`);
  };

  const buildShareText = (bill) => buildBillShareText({
    companyTitle: info.TITLE || 'BARMAN STORE',
    billNumber: bill?.bill_number,
    createdAt: bill?.created_at,
    customerName: bill?.customer_name,
    customerPhone: bill?.customer_phone,
    customerEmail: bill?.customer_email,
    customerAddress: bill?.customer_address,
    items: bill?.items || [],
    totalAmount: bill?.total_amount,
    paidAmount: bill?.paid_amount,
    creditAmount: bill?.credit_amount,
    paymentStatus: bill?.payment_status,
    onlineStoreUrl: info.ONLINE_STORE_URL,
    thankYouLine: 'Thank you for shopping with us.'
  });

  const buildSmsText = (bill) => {
    const text = `BILL ${bill.bill_number || ''} Total Rs ${Number(bill.total_amount || 0)} Paid Rs ${Number(bill.paid_amount || 0)} Credit Rs ${Number(bill.credit_amount || 0)}. ${company.name}`;
    return text.length > 160 ? text.slice(0, 157) + '...' : text;
  };

  const buildInvoiceHtml = (bill) => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    const rows = items.map((it) => {
      const name = escapeHtml(it.product_name || it.name || 'Item');
      const qty = Number(it.qty || it.quantity || 0);
      const unit = escapeHtml(it.unit || '');
      const mrp = Number(it.mrp || 0);
      const discount = Number(it.discount || 0);
      const amount = Number(it.amount || 0);
      return `
        <tr>
          <td>${name}</td>
          <td>${qty}${unit ? ' ' + unit : ''}</td>
          <td>Rs ${mrp.toFixed(2)}</td>
          <td>Rs ${discount.toFixed(2)}</td>
          <td>Rs ${amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="invoice">
        <div class="invoice-header">
          <div class="invoice-brand">
            ${company.logoPath ? `<img src="${company.logoPath}" alt="Logo" />` : ''}
            <div>
              <div class="company-name">${escapeHtml(company.name)}</div>
              <div class="company-meta">GST: ${escapeHtml(company.gstNumber)}</div>
              <div class="company-meta">${escapeHtml(company.address)}</div>
              <div class="company-meta">${escapeHtml(company.phone)} | ${escapeHtml(company.email)}</div>
            </div>
          </div>
          <div class="invoice-info">
            <div><strong>Bill #</strong> ${escapeHtml(bill.bill_number || '')}</div>
            <div><strong>Date</strong> ${new Date(bill.created_at || Date.now()).toLocaleString()}</div>
            <div><strong>Status</strong> ${escapeHtml(bill.payment_status || '')}</div>
          </div>
        </div>

        <div class="invoice-section">
          <div><strong>Customer</strong></div>
          <div>${escapeHtml(bill.customer_name || '')}</div>
          ${bill.customer_phone ? `<div>${escapeHtml(bill.customer_phone)}</div>` : ''}
          ${bill.customer_email ? `<div>${escapeHtml(bill.customer_email)}</div>` : ''}
          ${bill.customer_address ? `<div>${escapeHtml(bill.customer_address)}</div>` : ''}
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>MRP</th>
              <th>Discount</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No items</td></tr>'}
          </tbody>
        </table>

        <div class="invoice-summary">
          <div><span>Subtotal</span><span>Rs ${Number(bill.subtotal || 0).toFixed(2)}</span></div>
          <div><span>Discount</span><span>Rs ${Number(bill.discount_amount || 0).toFixed(2)}</span></div>
          <div><span>Total</span><span>Rs ${Number(bill.total_amount || 0).toFixed(2)}</span></div>
          <div><span>Paid</span><span>Rs ${Number(bill.paid_amount || 0).toFixed(2)}</span></div>
          <div><span>Credit</span><span>Rs ${Number(bill.credit_amount || 0).toFixed(2)}</span></div>
        </div>

        <div class="invoice-footer">
          <div>Thank you for your business.</div>
        </div>
      </div>
    `;
  };

  const handlePrint = (bill) => {
    const html = buildInvoiceHtml(bill);
    printHtmlDocument({
      title: `Bill ${bill.bill_number || ''}`,
      bodyHtml: html,
      cssText: `
        .invoice { max-width: 800px; margin: 0 auto; }
        .invoice-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
        .invoice-brand { display: flex; gap: 12px; align-items: center; }
        .invoice-brand img { width: 60px; height: 60px; object-fit: contain; }
        .company-name { font-size: 18px; font-weight: 700; }
        .company-meta { font-size: 12px; color: #444; }
        .invoice-info { text-align: right; font-size: 12px; }
        .invoice-section { margin: 12px 0 16px; font-size: 12px; }
        .invoice-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .invoice-table th, .invoice-table td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        .invoice-summary { margin-top: 12px; display: grid; gap: 6px; font-size: 12px; }
        .invoice-summary div { display: flex; justify-content: space-between; }
        .invoice-footer { margin-top: 16px; font-size: 12px; text-align: center; color: #444; }
      `,
      onError: (message) => alert(message),
    });
  };

  const handleCopyShare = async (bill) => {
    const text = buildShareText(bill);
    try {
      await navigator.clipboard.writeText(text);
      alert('Bill text copied.');
    } catch (err) {
      alert('Failed to copy bill text.');
    }
  };

  const handleCopySms = async (bill) => {
    const text = buildSmsText(bill);
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
      text: buildShareText(bill),
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
      <div className="bills-viewer-header">
        <h1>Bills History</h1>
        <p>View and manage all created bills</p>
      </div>

      {error && (
        <div className="bills-viewer-error">
          {error}
          <button onClick={fetchBills}>Retry</button>
        </div>
      )}

      <div className="bills-viewer-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by bill number, customer name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="refresh-btn" onClick={fetchBills}>
          Refresh
        </button>
      </div>

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
                onClick={() => setSelectedBill(bill)}
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
                    onClick={() => downloadBillPDF(selectedBill)}
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

