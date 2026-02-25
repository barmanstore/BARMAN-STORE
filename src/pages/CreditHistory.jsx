import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, DollarSign, CreditCard, RefreshCw, Printer, Upload, FileText, Eye, Download, MessageCircle, X } from 'lucide-react';
import { creditApi, usersApi } from '../services/api';
import { sendWhatsAppSmart } from '../utils/whatsapp';
import * as info from './info';
import { printHtmlDocument, escapeHtml } from '../utils/printService';
import { createPdfDoc, addAutoTable, addPdfFooterWithPagination, savePdf, safeFileName } from '../utils/pdfService';
import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';
import { buildCreditReportText, buildCreditEntryText, buildCreditTransactionText } from '../utils/messageTemplates';
import './CreditHistory.css';

// Currency format for PDF table and summary values.
const formatPdfCurrency = (amount) => {
  const numeric = Number(amount || 0);
  const abs = Math.abs(numeric);
  const value = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(abs);
  return `${numeric < 0 ? '-' : ''}Rs ${value}`;
};

// Tune this object to adjust PDF column widths and row sizing.
const PDF_TABLE_LAYOUT = {
  marginLeft: 14,
  marginRight: 14,
  fontSize: 9.5,
  cellPadding: 3.2,
  minCellHeight: 8,
  columnWeight: {
    date: 0.11,
    type: 0.09,
    reference: 0.12,
    amount: 0.14,
    balance: 0.16,
    description: 0.38
  }
};

const pad2 = (value) => String(value).padStart(2, '0');

const toLocalDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const getTodayDateInputValue = () => toLocalDateKey(new Date());

const getEffectiveTransactionDateKey = (transaction) => {
  const txDate = String(transaction?.transaction_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(txDate)) return txDate;
  const created = new Date(transaction?.created_at || '');
  return toLocalDateKey(created);
};

const getEffectiveTransactionTimestamp = (transaction) => {
  const txDate = String(transaction?.transaction_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
    return new Date(`${txDate}T00:00:00`).getTime();
  }
  const createdTs = new Date(transaction?.created_at || '').getTime();
  return Number.isFinite(createdTs) ? createdTs : 0;
};

const formatTransactionDate = (transaction, { long = false } = {}) => {
  const key = getEffectiveTransactionDateKey(transaction);
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [year, month, day] = key.split('-').map((v) => Number(v));
    const localDate = new Date(year, month - 1, day);
    if (long) {
      return localDate.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    return localDate.toLocaleDateString('en-IN');
  }
  return '-';
};

const getPdfColumnStyles = (doc) => {
  const pageWidth = typeof doc?.internal?.pageSize?.getWidth === 'function'
    ? doc.internal.pageSize.getWidth()
    : 210;
  const usableWidth = pageWidth - PDF_TABLE_LAYOUT.marginLeft - PDF_TABLE_LAYOUT.marginRight;
  const w = PDF_TABLE_LAYOUT.columnWeight;
  return {
    0: { cellWidth: usableWidth * w.date },
    1: { cellWidth: usableWidth * w.type },
    2: { cellWidth: usableWidth * w.reference },
    3: { cellWidth: usableWidth * w.amount, halign: 'right' },
    4: { cellWidth: usableWidth * w.balance, halign: 'right' },
    5: { cellWidth: usableWidth * w.description, overflow: 'linebreak', valign: 'top' }
  };
};

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function CreditHistory({ user }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = (() => {
    if (user) return user;
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch (_) {
      return null;
    }
  })();
  const isAdminView = authUser?.role === 'admin';
  const effectiveUserId = isAdminView ? userId : (authUser?.id || userId);
  const [creditHistory, setCreditHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: 'given',
    amount: '',
    description: '',
    reference: '',
    transactionDate: getTodayDateInputValue(),
    imagePath: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });
  const fileInputRef = useRef(null);

  // New: report states
  const [fromDate, setFromDate] = useState(getTodayDateInputValue());
  const [toDate, setToDate] = useState(getTodayDateInputValue());
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [entryShareText, setEntryShareText] = useState('');

  useEffect(() => {
    if (!authUser) {
      navigate('/login');
      return;
    }
    if (!isAdminView && userId && Number(userId) !== Number(authUser.id)) {
      navigate('/my-credit');
      return;
    }
    if (!effectiveUserId) return;
    fetchCreditData(effectiveUserId);
  }, [authUser, isAdminView, userId, effectiveUserId, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchCreditData = async (targetUserId = effectiveUserId) => {
    try {
      setLoading(true);
      const [historyData, balanceData, customerData] = await Promise.all([
        creditApi.getHistory(targetUserId),
        creditApi.getBalance(targetUserId),
        usersApi.getById(targetUserId)
      ]);
      setCreditHistory(historyData);
      setBalance(balanceData.balance);
      setCustomer(customerData);
      return {
        history: historyData,
        balance: Number(balanceData?.balance || 0),
        customer: customerData
      };
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        navigate('/login');
        return null;
      }
      setError(err.message || 'Failed to load credit history');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('invoice', file);

    try {
      const response = await fetch('/api/upload/invoice', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        setNewTransaction({ ...newTransaction, imagePath: data.imagePath });
        setSuccess('Invoice uploaded successfully');
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!newTransaction.amount || parseFloat(newTransaction.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!newTransaction.transactionDate) {
      setError('Please select a transaction date');
      return;
    }

    if (!newTransaction.description.trim()) {
      setError('Please enter a description');
      return;
    }

    try {
      const previousBalance = Number(balance || 0);
      const txSnapshot = {
        type: newTransaction.type,
        amount: parseFloat(newTransaction.amount),
        description: String(newTransaction.description || '').trim(),
        reference: String(newTransaction.reference || '').trim(),
        transactionDate: newTransaction.transactionDate || getTodayDateInputValue()
      };
      const result = await creditApi.addTransaction(effectiveUserId, {
        ...newTransaction,
        amount: parseFloat(newTransaction.amount),
        created_by: authUser?.id
      });
      setSuccess('Transaction added successfully');
      setEntryShareText('');
      setNewTransaction({
        type: 'given',
        amount: '',
        description: '',
        reference: '',
        transactionDate: getTodayDateInputValue(),
        imagePath: ''
      });
      setShowAddModal(false);
      const refreshed = await fetchCreditData(effectiveUserId);
      let updatedBalance = Number(refreshed?.balance);
      if (!Number.isFinite(updatedBalance)) {
        const delta = txSnapshot.type === 'payment' ? -txSnapshot.amount : txSnapshot.amount;
        updatedBalance = Number(previousBalance + delta);
      }
      const manualShare = buildManualEntryText({
        companyTitle: info.TITLE || 'BARMAN STORE',
        entryType: txSnapshot.type,
        amount: txSnapshot.amount,
        description: txSnapshot.description,
        reference: txSnapshot.reference,
        entryDate: txSnapshot.transactionDate,
        previousBalance,
        updatedBalance,
        thankYouLine: 'Thank you for your payment and trust.'
      });
      setEntryShareText(manualShare);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setError(err.message || 'Failed to add transaction');
    }
  };

  const handlePrintInvoice = (transaction) => {
    if (isMobile) return;
    setSelectedTransaction(transaction);
    setShowInvoiceModal(true);
  };

  const buildCreditInvoiceHtml = (transaction) => {
    const amount = Number(transaction?.amount || 0);
    const balanceNow = Number(transaction?.balance || 0);
    const previousBalance = transaction?.type === 'payment'
      ? balanceNow + amount
      : balanceNow - amount;

    return `
      <div class="credit-invoice">
        <div class="credit-invoice-header">
          <div>
            <h1>INVOICE</h1>
            <div class="meta">${escapeHtml(info.TITLE || 'BARMAN STORE')}</div>
          </div>
          <div class="meta-right">
            <div><strong>Invoice #:</strong> ${escapeHtml(transaction?.invoice_number || '-')}</div>
            <div><strong>Date:</strong> ${escapeHtml(formatTransactionDate(transaction, { long: true }))}</div>
          </div>
        </div>
        <div class="credit-party">
          <div><strong>Customer:</strong> ${escapeHtml(customer?.name || '-')}</div>
          <div>${escapeHtml(customer?.email || '')}</div>
          <div>${escapeHtml(customer?.phone || '')}</div>
        </div>
        <table class="credit-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(transaction?.description || '-')}</td>
              <td>${escapeHtml(getTypeLabel(transaction?.type || '-'))}</td>
              <td>${escapeHtml(formatCurrency(amount))}</td>
            </tr>
          </tbody>
        </table>
        <div class="credit-summary">
          <div><span>Previous Balance</span><strong>${escapeHtml(formatCurrency(previousBalance))}</strong></div>
          <div><span>Amount</span><strong>${escapeHtml(formatCurrency(amount))}</strong></div>
          <div class="total"><span>Current Balance</span><strong>${escapeHtml(formatCurrency(balanceNow))}</strong></div>
        </div>
        ${transaction?.reference ? `<div class="credit-reference"><strong>Reference:</strong> ${escapeHtml(transaction.reference)}</div>` : ''}
      </div>
    `;
  };

  const printInvoice = () => {
    if (!selectedTransaction) return;
    printHtmlDocument({
      title: `Invoice ${selectedTransaction?.invoice_number || ''}`,
      bodyHtml: buildCreditInvoiceHtml(selectedTransaction),
      cssText: `
        .credit-invoice { max-width: 760px; margin: 0 auto; }
        .credit-invoice-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
        .credit-invoice-header h1 { margin: 0 0 4px; font-size: 24px; }
        .meta { color: #555; font-size: 12px; }
        .meta-right { text-align: right; font-size: 12px; line-height: 1.6; }
        .credit-party { margin: 12px 0; font-size: 12px; line-height: 1.6; }
        .credit-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .credit-table th, .credit-table td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
        .credit-table thead th { background: #f3f4f6; }
        .credit-summary { width: 320px; margin-top: 14px; margin-left: auto; }
        .credit-summary div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
        .credit-summary .total { font-weight: 700; border-bottom: none; font-size: 14px; }
        .credit-reference { margin-top: 12px; font-size: 12px; }
      `,
      onError: (message) => setError(message),
    });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'given': return <DollarSign size={16} className="type-icon given" />;
      case 'payment': return <RefreshCw size={16} className="type-icon payment" />;
      default: return <DollarSign size={16} />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'given': return 'Given';
      case 'payment': return 'Payment';
      default: return type;
    }
  };

  // Build a readable report text for a set of transactions
  const buildCreditReport = (transactions, from, to) => {
    const allThroughPeriod = creditHistory
      .filter((t) => {
        const dateKey = getEffectiveTransactionDateKey(t);
        return Boolean(dateKey) && dateKey <= to;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const periodEndingBalance = allThroughPeriod.length > 0
      ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
      : 0;

    const normalizedTransactions = (transactions || []).map((t) => ({
      dateLabel: formatTransactionDate(t),
      typeLabel: getTypeLabel(t.type),
      type: t.type,
      amount: Number(t.amount) || 0,
      balance: Number(t.balance || 0),
      description: t.reference ? `${t.description || ''} (${t.reference})`.trim() : (t.description || '-')
    }));

    return buildCreditReportText({
      companyTitle: info.TITLE || 'BARMAN STORE',
      customerName: customer?.name || 'Customer',
      fromDate: from,
      toDate: to,
      generatedAt: Date.now(),
      transactions: normalizedTransactions,
      periodEndingBalance,
      currentDayBalance: parseFloat(balance || 0),
      onlineStoreUrl: info.ONLINE_STORE_URL,
      thankYouLine: 'Thank you for shopping with us.'
    });
  };

  // Generate report for selected date range (client-side filter)
  const handleGenerateReport = () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates for the report.');
      return;
    }
    if (fromDate > toDate) {
      setError('From date cannot be later than To date.');
      return;
    }
    setError('');
    setSuccess('');
    const filtered = creditHistory.filter((t) => {
      const dateKey = getEffectiveTransactionDateKey(t);
      return Boolean(dateKey) && dateKey >= fromDate && dateKey <= toDate;
    }).sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

    const report = buildCreditReport(filtered, fromDate, toDate);
    setReportText(report);
    setShowReport(true);
  };

  const handleCopyReport = async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setSuccess('Report copied to clipboard');
    } catch (err) {
      setError('Failed to copy report');
    }
  };

  const sendOnWhatsApp = async (text) => {
    if (!text) return;
    const result = await sendWhatsAppSmart({
      phone: customer?.phone,
      text,
    });
    if (result.status === 'missing_phone') {
      setError('Customer phone is missing or invalid. Please update phone and try again.');
      return;
    }
    if (result.status === 'fallback_copy') {
      setSuccess('Message was long. Copied to clipboard; paste it in WhatsApp.');
      return;
    }
    if (result.status === 'fallback_no_copy') {
      setError('Message was long. Opened WhatsApp chat, please paste the message manually.');
    }
  };

  const handleSendWhatsApp = async () => {
    await sendOnWhatsApp(reportText);
  };

  const buildManualEntryText = ({
    companyTitle,
    entryType,
    amount,
    description,
    reference,
    entryDate,
    previousBalance,
    updatedBalance,
    thankYouLine
  }) => buildCreditEntryText({
    companyTitle: companyTitle || info.TITLE || 'BARMAN STORE',
    entryTypeLabel: getTypeLabel(entryType),
    amount,
    description,
    reference,
    entryDate,
    previousBalance,
    updatedBalance,
    onlineStoreUrl: info.ONLINE_STORE_URL,
    thankYouLine: thankYouLine || 'Thank you for shopping with us.'
  });

  const handleCopyEntryShare = async () => {
    if (!entryShareText) return;
    try {
      await navigator.clipboard.writeText(entryShareText);
      setSuccess('Entry message copied to clipboard');
    } catch {
      setError('Failed to copy entry message');
    }
  };

  const handleSendEntryWhatsApp = async () => {
    await sendOnWhatsApp(entryShareText);
  };

  const isTransactionWithinFiveDays = (transactionOrDate) => {
    const txTime = typeof transactionOrDate === 'object'
      ? getEffectiveTransactionTimestamp(transactionOrDate)
      : new Date(transactionOrDate).getTime();
    if (!Number.isFinite(txTime)) return false;
    const now = Date.now();
    return now >= txTime && (now - txTime) <= FIVE_DAYS_MS;
  };

  const groupedTransactions = (() => {
    const groups = new Map();
    creditHistory.forEach((transaction) => {
      const dateKey = getEffectiveTransactionDateKey(transaction) || 'Unknown';
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(transaction);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, transactions]) => ({
        dateKey,
        dateLabel: /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
          ? formatTransactionDate({ transaction_date: dateKey }, { long: true })
          : dateKey,
        transactions: [...transactions].sort(
          (a, b) => getEffectiveTransactionTimestamp(b) - getEffectiveTransactionTimestamp(a)
        )
      }));
  })();

  const buildTransactionShareText = (transaction) => buildCreditTransactionText({
    companyTitle: info.TITLE || 'BARMAN STORE',
    dateLabel: formatTransactionDate(transaction),
    typeLabel: getTypeLabel(transaction?.type),
    amount: Number(transaction?.amount || 0),
    description: transaction?.description || 'No additional note',
    reference: transaction?.reference || '',
    updatedBalance: Number(transaction?.balance || 0),
    onlineStoreUrl: info.ONLINE_STORE_URL,
    thankYouLine: 'Thank you for shopping with us.'
  });

  const handleSendTransactionWhatsApp = async (transaction) => {
    if (!isTransactionWithinFiveDays(transaction)) return;
    await sendOnWhatsApp(buildTransactionShareText(transaction));
  };

  // Generate PDF report with company branding
  const generatePDFReport = () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates for the report.');
      return;
    }
    if (fromDate > toDate) {
      setError('From date cannot be later than To date.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      const filtered = creditHistory.filter((t) => {
        const dateKey = getEffectiveTransactionDateKey(t);
        return Boolean(dateKey) && dateKey >= fromDate && dateKey <= toDate;
      }).sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

      const allThroughPeriod = creditHistory
        .filter((t) => {
          const dateKey = getEffectiveTransactionDateKey(t);
          return Boolean(dateKey) && dateKey <= toDate;
        })
        .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

      const periodEndingBalance = allThroughPeriod.length > 0
        ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
        : 0;
      const currentDayBalance = Number(balance || 0);

      // Create PDF document
      const doc = createPdfDoc();
      
      // Colors
      const primaryColor = [41, 128, 185]; // Blue
      const secondaryColor = [52, 73, 94]; // Dark gray
      const accentColor = [39, 174, 96]; // Green
      
      // Header background
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 45, 'F');
      
      // Company name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(info.TITLE || 'BARMAN STORE', 105, 18, { align: 'center' });
      
      // Company subtitle
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(info.SUB_TITLE || 'Quality Groceries & Everyday Essentials', 105, 28, { align: 'center' });
      
      // Contact info
      doc.setFontSize(9);
      const contactText = `${info.EMAIL || ''} | ${info.CONTACT || ''}`;
      doc.text(contactText, 105, 38, { align: 'center' });
      
      // Report title
      doc.setTextColor(...secondaryColor);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Credit Report', 105, 55, { align: 'center' });
      
      // Customer info box
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(14, 62, 182, 28, 3, 3, 'FD');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...secondaryColor);
      doc.text('Customer Details', 20, 72);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Name: ${customer?.name || 'N/A'}`, 20, 80);
      doc.text(`Phone: ${customer?.phone || 'N/A'}`, 100, 80);
      doc.text(`Email: ${customer?.email || 'N/A'}`, 20, 86);
      
      // Date range
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${fromDate} to ${toDate}`, 100, 86);
      
      // Transactions table
      if (filtered.length > 0) {
        const tableData = filtered.map((t) => [
          formatTransactionDate(t),
          getTypeLabel(t.type),
          t.reference || '-',
          { content: formatPdfCurrency(t.type === 'payment' ? -Number(t.amount) : Number(t.amount)), styles: { halign: 'right' } },
          { content: formatPdfCurrency(Number(t.balance)), styles: { halign: 'right' } },
          t.description || '-'
        ]);
        
        addAutoTable(doc, {
          startY: 95,
          head: [['Date', 'Type', 'Reference', 'Amount', 'Balance', 'Description']],
          body: tableData,
          theme: 'plain',
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [45, 45, 45],
            fontStyle: 'bold',
            fontSize: PDF_TABLE_LAYOUT.fontSize,
            cellPadding: PDF_TABLE_LAYOUT.cellPadding,
            lineWidth: 0
          },
          bodyStyles: {
            fontSize: PDF_TABLE_LAYOUT.fontSize,
            textColor: [35, 35, 35],
            cellPadding: PDF_TABLE_LAYOUT.cellPadding,
            minCellHeight: PDF_TABLE_LAYOUT.minCellHeight,
            overflow: 'linebreak',
            valign: 'top',
            lineWidth: 0
          },
          styles: {
            lineWidth: 0
          },
          columnStyles: getPdfColumnStyles(doc),
          margin: { left: PDF_TABLE_LAYOUT.marginLeft, right: PDF_TABLE_LAYOUT.marginRight }
        });
        
        // Summary section
        const finalY = Number(doc?.lastAutoTable?.finalY || 95) + 10;
        
        let totalGiven = 0;
        let totalPayment = 0;
        filtered.forEach((t) => {
          const amount = Number(t.amount) || 0;
          if (t.type === 'given') totalGiven += amount;
          else if (t.type === 'payment') totalPayment += amount;
        });
        const summaryHeight = 42;
        const footerReserve = 14;
        const pageHeight = doc.internal.pageSize.height;
        const summaryTop = (finalY + summaryHeight + footerReserve > pageHeight) ? 20 : finalY;

        if (summaryTop !== finalY) {
          doc.addPage();
        }

        // Summary box
        doc.setFillColor(248, 249, 250);
        doc.roundedRect(14, summaryTop, 182, 42, 3, 3, 'F');
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...secondaryColor);
        doc.text('Summary', 20, summaryTop + 10);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const summaryY = summaryTop + 18;
        doc.text(`Total Credit Given: ${formatPdfCurrency(totalGiven)}`, 20, summaryY);
        doc.text(`Total Payments Received: ${formatPdfCurrency(totalPayment)}`, 20, summaryY + 7);
        doc.text(`Net Change: ${formatPdfCurrency(totalGiven - totalPayment)}`, 20, summaryY + 14);
        
        // Balances on right side
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...secondaryColor);
        doc.text('Period Ending Balance:', 118, summaryY + 2);
        doc.setTextColor(periodEndingBalance >= 0 ? accentColor[0] : 231, periodEndingBalance >= 0 ? accentColor[1] : 76, periodEndingBalance >= 0 ? accentColor[2] : 60);
        doc.text(formatPdfCurrency(periodEndingBalance), 118, summaryY + 8);
        doc.setTextColor(...secondaryColor);
        doc.text('Current Day Balance:', 118, summaryY + 14);
        doc.setTextColor(currentDayBalance >= 0 ? accentColor[0] : 231, currentDayBalance >= 0 ? accentColor[1] : 76, currentDayBalance >= 0 ? accentColor[2] : 60);
        doc.text(formatPdfCurrency(currentDayBalance), 118, summaryY + 20);
      } else {
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text('No transactions found in the selected date range.', 105, 110, { align: 'center' });
        doc.setFontSize(9);
        doc.setTextColor(...secondaryColor);
        doc.text(`Period Ending Balance: ${formatPdfCurrency(periodEndingBalance)}`, 105, 118, { align: 'center' });
        doc.text(`Current Day Balance: ${formatPdfCurrency(currentDayBalance)}`, 105, 124, { align: 'center' });
      }
      
      // Footer
      addPdfFooterWithPagination(doc, (pdf, i, pageCount) => {
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `Generated on ${new Date().toLocaleString('en-IN')} | Page ${i} of ${pageCount}`,
          105,
          pdf.internal.pageSize.height - 10,
          { align: 'center' }
        );
      });

      // Save the PDF
      const fileName = `Credit_Report_${safeFileName(customer?.name || 'Customer')}_${fromDate}_to_${toDate}`;
      savePdf(doc, fileName);
      setSuccess('PDF report downloaded successfully!');
    } catch (err) {
      setError(err?.message || 'Failed to generate PDF report.');
    }
  };

  if (loading) {
    return (
      <div className="credit-history-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  const getBackToAdminUrl = () => {
    const params = new URLSearchParams(location.search || '');
    const returnTab = params.get('returnTab') || location.state?.returnTab;
    if (returnTab) return `/admin?tab=${encodeURIComponent(returnTab)}`;
    return '/admin';
  };
  const backHref = isAdminView ? getBackToAdminUrl() : '/profile';
  const backLabel = isAdminView ? 'Back to Admin' : 'Back to Profile';

  return (
    <div className="credit-history-page">
      <div className="page-header">
        <Link to={backHref} className="back-link">
          <ArrowLeft size={20} /> {backLabel}
        </Link>
        <div className="header-content">
          <h1>{isAdminView ? 'Credit History' : 'My Credit History'}</h1>
          {customer && <p className="customer-name">{customer.name}</p>}
        </div>
        <div className="balance-card">
          <span className="balance-label">Current Balance</span>
          <span className={`balance-amount ${balance >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrencyColored(balance)}
          </span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {isAdminView && (
        <div className="actions-bar">
          <button className="admin-btn primary" onClick={() => setShowAddModal(true)}>
            <Plus size={20} /> Add Transaction
          </button>
        </div>
      )}

      <div className="credit-table-container">
        {creditHistory.length === 0 ? (
          <div className="empty-state">
            <p>No credit history found{isAdminView ? ' for this customer.' : '.'}</p>
            {isAdminView && <p>Click "Add Transaction" to record a transaction.</p>}
          </div>
        ) : (
          <>
            <table className="credit-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice #</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {creditHistory.map((transaction) => {
                  const descriptionWithRef = transaction.reference
                    ? `${transaction.description || ''} (${transaction.reference})`.trim()
                    : transaction.description || '-';
                  const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
                  return (
                    <tr key={transaction.id}>
                      <td>{formatTransactionDate(transaction, { long: true })}</td>
                      <td className="invoice-number">{transaction.invoice_number || '-'}</td>
                      <td>
                        {getTypeIcon(transaction.type)}
                        <span>{getTypeLabel(transaction.type)}</span>
                      </td>
                      <td className={transaction.type === 'payment' ? 'payment-amount' : 'given-amount'}>
                        {formatCurrencyColored(transaction.type === 'payment' ? -parseFloat(transaction.amount) : parseFloat(transaction.amount))}
                      </td>
                      <td>{formatCurrencyColored(parseFloat(transaction.balance))}</td>
                      <td>{descriptionWithRef}</td>
                      <td className="actions-cell">
                        {transaction.image_path && (
                          <a
                            href={transaction.image_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="action-icon view"
                            title="View Invoice"
                          >
                            <Eye size={16} />
                          </a>
                        )}
                        <button
                          className="action-icon print mobile-hide-print"
                          onClick={() => handlePrintInvoice(transaction)}
                          title="Print Invoice"
                          disabled={isMobile}
                          aria-disabled={isMobile}
                        >
                          <Printer size={16} />
                        </button>
                        {canShareTransaction && (
                          <button
                            className="action-icon whatsapp"
                            onClick={() => handleSendTransactionWhatsApp(transaction)}
                            title="Share on WhatsApp"
                          >
                            <MessageCircle size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="credit-mobile-list">
              {groupedTransactions.map((group) => (
                <section key={group.dateKey} className="credit-day-group">
                  <h3 className="credit-day-title">{group.dateLabel}</h3>
                  <div className="credit-bubble-stack">
                    {group.transactions.map((transaction) => {
                      const description = transaction.description || '-';
                      const reference = transaction.reference || '-';
                      const signedAmount = transaction.type === 'payment'
                        ? -parseFloat(transaction.amount)
                        : parseFloat(transaction.amount);
                      const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
                      return (
                        <article
                          key={`mobile-${transaction.id}`}
                          className={`credit-transaction-bubble ${transaction.type === 'payment' ? 'bubble-right payment' : 'bubble-left given'}`}
                        >
                          <header className="bubble-head">
                            <span className="bubble-type">
                              {getTypeIcon(transaction.type)}
                              {getTypeLabel(transaction.type)}
                            </span>
                            <span className={transaction.type === 'payment' ? 'payment-amount' : 'given-amount'}>
                              {formatCurrencyColored(signedAmount)}
                            </span>
                          </header>

                          <div className="bubble-detail"><strong>Desc:</strong> {description}</div>
                          <div className="bubble-detail"><strong>Ref:</strong> {reference}</div>
                          <div className="bubble-detail"><strong>Invoice:</strong> {transaction.invoice_number || '-'}</div>
                          <div className="bubble-detail"><strong>Date:</strong> {formatTransactionDate(transaction, { long: true })}</div>

                          <div className="bubble-actions">
                            {transaction.image_path && (
                              <a
                                href={transaction.image_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="action-icon view"
                                title="View Invoice"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye size={16} />
                              </a>
                            )}
                            <button
                              className="action-icon print mobile-hide-print"
                              onClick={() => handlePrintInvoice(transaction)}
                              title="Print Invoice"
                              disabled={isMobile}
                              aria-disabled={isMobile}
                            >
                              <Printer size={16} />
                            </button>
                            {canShareTransaction && (
                              <button
                                className="action-icon whatsapp"
                                onClick={() => handleSendTransactionWhatsApp(transaction)}
                                title="Share on WhatsApp"
                              >
                                <MessageCircle size={16} />
                              </button>
                            )}
                          </div>

                          <footer className="bubble-balance">
                            <span>Balance</span>
                            <strong>{formatCurrencyColored(parseFloat(transaction.balance))}</strong>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
              )}
         {isAdminView && (
           <div className="report-controls">
              <label> From:<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label> To:<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
              <button className="admin-btn" onClick={handleGenerateReport} title="Generate credit report for date range">
              Generate Report
              </button>
           </div>
         )}
      </div>

      {/* Report preview / share box */}
      {isAdminView && showReport && (
        <div className="report-box">
          <div className="report-header">
            <strong>Credit Report {customer?.name ? `- ${customer.name}` : ''}</strong>
          </div>
          <textarea className="report-text" readOnly value={reportText} />
          <div className="report-actions">
            <button className="report-btn" onClick={handleCopyReport}>Copy</button>
            <button className="report-btn whatsapp" onClick={handleSendWhatsApp}>WhatsApp</button>
            <button className="report-btn pdf" onClick={generatePDFReport}><Download size={14} /> PDF</button>
            <button className="report-btn" onClick={() => setShowReport(false)}>Close</button>
          </div>
        </div>
      )}

      {isAdminView && entryShareText && (
        <div className="report-box">
          <div className="report-header">
            <strong>Manual Entry Message</strong>
          </div>
          <textarea className="report-text" readOnly value={entryShareText} />
          <div className="report-actions">
            <button className="report-btn" onClick={handleCopyEntryShare}>Copy</button>
            <button className="report-btn whatsapp" onClick={handleSendEntryWhatsApp}>WhatsApp</button>
            <button className="report-btn" onClick={() => setEntryShareText('')}>Close</button>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isAdminView && showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Payment Entry</h2>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddTransaction}>
              <div className="form-group">
                <label>Transaction Type</label>
                <select
                  value={newTransaction.type}
                  onChange={(e) => setNewTransaction({ ...newTransaction, type: e.target.value })}
                >
                  <option value="given">Given (Add to balance)</option>
                  <option value="payment">Payment (Reduce balance)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                  placeholder="Enter amount"
                  required
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={newTransaction.transactionDate}
                  onChange={(e) => setNewTransaction({ ...newTransaction, transactionDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input
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
                    disabled={uploading}
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
                <button type="button" className="cancel-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Add Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && selectedTransaction && (
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
                  <td>{formatCurrencyColored(parseFloat(selectedTransaction.amount))}</td>
                </tr>
              </tbody>
            </table>

            <div className="invoice-summary">
              <div className="summary-row">
                <span>Previous Balance:</span>
                <span>{formatCurrencyColored(parseFloat(selectedTransaction.balance) + parseFloat(selectedTransaction.amount))}</span>
              </div>
              <div className="summary-row">
                <span>Amount:</span>
                <span>{formatCurrencyColored(parseFloat(selectedTransaction.amount))}</span>
              </div>
              <div className="summary-row total">
                <span>Current Balance:</span>
                <span>{formatCurrencyColored(parseFloat(selectedTransaction.balance))}</span>
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
      )}
    </div>
  );
}

export default CreditHistory;
