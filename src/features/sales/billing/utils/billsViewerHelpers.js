import { printHtmlDocument, escapeHtml } from '../../../../shared/utils/printService';
import {
  createPdfDoc,
  addAutoTable,
  addPdfFooterWithPagination,
  savePdf,
  safeFileName
} from '../../../../shared/utils/pdfService';
import { buildBillShareText } from '../../../../shared/utils/messageTemplates';
import company from '../../../../config/company';
import * as info from '../../../../shared/info';

export const downloadBillPdf = (bill) => {
  const doc = createPdfDoc();
  const primaryColor = [41, 128, 185];
  const secondaryColor = [52, 73, 94];
  const rows = (Array.isArray(bill.items) ? bill.items : []).map((item) => [
    String(item.product_name || item.name || '-'),
    Number(item.qty || item.quantity || 0),
    String(item.unit || '-'),
    { content: `Rs ${Number(item.mrp || 0).toFixed(2)}`, styles: { halign: 'right' } },
    { content: `Rs ${Number(item.discount || 0).toFixed(2)}`, styles: { halign: 'right' } },
    { content: `Rs ${Number(item.amount || 0).toFixed(2)}`, styles: { halign: 'right' } }
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
      5: { cellWidth: 28, halign: 'right' }
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

export const buildBillShareTextForBill = (bill) => buildBillShareText({
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
  thankYouLine: '???? ???? ???? ???? ???? ????????'
});

export const buildBillSmsText = (bill) => {
  const text = `BILL ${bill.bill_number || ''} Total Rs ${Number(bill.total_amount || 0)} Paid Rs ${Number(bill.paid_amount || 0)} Credit Rs ${Number(bill.credit_amount || 0)}. ${company.name}`;
  return text.length > 160 ? text.slice(0, 157) + '...' : text;
};

export const buildBillInvoiceHtml = (bill) => {
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

export const printBillInvoice = (bill) => {
  const html = buildBillInvoiceHtml(bill);
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
    onError: (message) => alert(message)
  });
};

