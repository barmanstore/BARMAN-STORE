import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, DollarSign, CreditCard, RefreshCw, Printer, Upload, FileText, Eye, Download, MessageCircle, X, Trash2 } from 'lucide-react';
import { creditApi, usersApi, adminApi, createClientRequestId } from '../services/api';
import { sendWhatsAppSmart } from '../utils/whatsapp';
import * as info from './info';
import { printHtmlDocument, escapeHtml } from '../utils/printService';
import { createPdfDoc, addAutoTable, addPdfFooterWithPagination, savePdf, safeFileName } from '../utils/pdfService';
import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';
import {
  applyCreditQuickFilters,
  getBalanceSummary,
  getLastTransactionFromHistory,
  getRecentActivityHint,
  truncateCreditDescription,
} from '../utils/creditHistoryUi.mjs';
import { buildCreditReportText, buildCreditEntryText, buildCreditTransactionText } from '../utils/messageTemplates';
import useLockBodyScroll from '../hooks/useLockBodyScroll';
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
  const txDateRaw = transaction?.transaction_date ?? transaction?.transactionDate;
  if (txDateRaw) {
    if (typeof txDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txDateRaw)) {
      return txDateRaw;
    }
    const d = new Date(txDateRaw);
    if (!Number.isNaN(d.getTime())) {
      return toLocalDateKey(d);
    }
  }
  const tsRaw = transaction?.transaction_ts ?? transaction?.transactionTs;
  if (tsRaw) {
    const tsDate = new Date(tsRaw);
    if (!Number.isNaN(tsDate.getTime())) return toLocalDateKey(tsDate);
  }
  const created = new Date(transaction?.created_at || '');
  return toLocalDateKey(created);
};

const getEffectiveTransactionTimestamp = (transaction) => {
  const tsRaw = transaction?.transaction_ts ?? transaction?.transactionTs;
  if (tsRaw) {
    const ts = new Date(tsRaw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  const txDateRaw = transaction?.transaction_date ?? transaction?.transactionDate;
  if (txDateRaw) {
    if (typeof txDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txDateRaw)) {
      const [year, month, day] = txDateRaw.split('-').map((v) => Number(v));
      const createdAt = new Date(transaction?.created_at || '');
      const withTime = !Number.isNaN(createdAt.getTime())
        ? new Date(year, month - 1, day, createdAt.getHours(), createdAt.getMinutes(), createdAt.getSeconds(), createdAt.getMilliseconds())
        : new Date(year, month - 1, day);
      if (!Number.isNaN(withTime.getTime())) return withTime.getTime();
    }
    const d = new Date(txDateRaw);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const createdTs = new Date(transaction?.created_at || '').getTime();
  return Number.isFinite(createdTs) ? createdTs : 0;
};

const compareTransactionsByDateDesc = (a, b) => {
  const timeDiff = getEffectiveTransactionTimestamp(b) - getEffectiveTransactionTimestamp(a);
  if (timeDiff !== 0) return timeDiff;
  return Number(b?.id || 0) - Number(a?.id || 0);
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
  const [searchParams] = useSearchParams();
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
  const [addingTransaction, setAddingTransaction] = useState(false);
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
  const [reportSummary, setReportSummary] = useState(null);
  const [entryShareText, setEntryShareText] = useState('');
  const [quickTypeFilter, setQuickTypeFilter] = useState('all');
  const [quickRangeFilter, setQuickRangeFilter] = useState('all');
  const [expandedTransactionId, setExpandedTransactionId] = useState(null);
  const [creditIssues, setCreditIssues] = useState([]);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueForm, setIssueForm] = useState({
    credit_entry_id: '',
    issue_type: 'wrong_entry',
    message: '',
  });
  const [issueRespondingId, setIssueRespondingId] = useState(0);
  const [issueResponseDrafts, setIssueResponseDrafts] = useState({});
  const [adminIssueDrafts, setAdminIssueDrafts] = useState({});
  const [adminIssueSavingId, setAdminIssueSavingId] = useState(0);
  const [activeAdminIssueId, setActiveAdminIssueId] = useState(0);
  const [deletingEntryId, setDeletingEntryId] = useState(0);
  const focusIssueId = Number(searchParams.get('focusIssue') || 0) || 0;
  const focusEntryId = Number(searchParams.get('focusEntry') || 0) || 0;

  useLockBodyScroll(showAddModal || showInvoiceModal);

  const addTransactionLockRef = useRef(false);
  const addTransactionRequestIdRef = useRef('');

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

  useEffect(() => {
    setExpandedTransactionId(null);
  }, [quickTypeFilter, quickRangeFilter]);

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
      try {
        const issueRows = await creditApi.listIssues(targetUserId);
        setCreditIssues(Array.isArray(issueRows) ? issueRows : []);
      } catch (_) {
        setCreditIssues([]);
      }
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
    if (addingTransaction || addTransactionLockRef.current) return;
    addTransactionLockRef.current = true;
    setError('');
    setSuccess('');

    // Validation
    if (!newTransaction.amount || parseFloat(newTransaction.amount) <= 0) {
      addTransactionLockRef.current = false;
      setError('Please enter a valid amount');
      return;
    }

    if (!newTransaction.transactionDate) {
      addTransactionLockRef.current = false;
      setError('Please select a transaction date');
      return;
    }

    if (!newTransaction.description.trim()) {
      addTransactionLockRef.current = false;
      setError('Please enter a description');
      return;
    }

    try {
      setAddingTransaction(true);
      const previousBalance = Number(balance || 0);
      const txSnapshot = {
        type: newTransaction.type,
        amount: parseFloat(newTransaction.amount),
        description: String(newTransaction.description || '').trim(),
        reference: String(newTransaction.reference || '').trim(),
        transactionDate: newTransaction.transactionDate || getTodayDateInputValue()
      };
      
      const clientRequestId = addTransactionRequestIdRef.current || createClientRequestId('credit');
      addTransactionRequestIdRef.current = clientRequestId;

      const result = await creditApi.addTransaction(effectiveUserId, {
        ...newTransaction,
        amount: parseFloat(newTransaction.amount),
        created_by: authUser?.id,
        client_request_id: clientRequestId
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
      closeAddModal();
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
        thankYouLine: 'আপোনাৰ পৰিশোধ আৰু বিশ্বাসৰ বাবে ধন্যবাদ।'
      });
      setEntryShareText(manualShare);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setError(err.message || 'Failed to add transaction');
    } finally {
      setAddingTransaction(false);
      addTransactionLockRef.current = false;
    }
  };

  const handleDeleteTransaction = async (transaction) => {
    if (!isAdminView) return;
    const entryId = Number(transaction?.id || 0);
    if (!entryId || !effectiveUserId) return;
    if (!window.confirm(`Delete credit entry #${entryId}? This will recalculate balances.`)) return;
    try {
      setDeletingEntryId(entryId);
      setError('');
      setSuccess('');
      await creditApi.deleteTransaction(effectiveUserId, entryId);
      await fetchCreditData(effectiveUserId);
      setSuccess('Credit entry deleted.');
    } catch (err) {
      setError(err.message || 'Failed to delete credit entry');
    } finally {
      setDeletingEntryId(0);
    }
  };

  const handleReportIssue = async (event) => {
    event.preventDefault();
    if (issueSubmitting || isAdminView) return;
    setIssueSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        credit_entry_id: Number(issueForm.credit_entry_id || 0) || null,
        issue_type: String(issueForm.issue_type || 'wrong_entry').trim(),
        message: String(issueForm.message || '').trim(),
      };
      if (!payload.message) {
        throw new Error('Please describe the issue');
      }
      await creditApi.reportIssue(effectiveUserId, payload);
      const issueRows = await creditApi.listIssues(effectiveUserId);
      setCreditIssues(Array.isArray(issueRows) ? issueRows : []);
      setIssueForm((prev) => ({ ...prev, message: '' }));
      setSuccess('Issue submitted. Admin will review and correct if needed.');
    } catch (err) {
      setError(err.message || 'Failed to submit issue');
    } finally {
      setIssueSubmitting(false);
    }
  };

  const handleIssueResponse = async (issue, responseStatus) => {
    if (isAdminView || !issue?.id || !effectiveUserId) return;
    const nextResponse = String(responseStatus || '').trim().toLowerCase();
    if (nextResponse !== 'acknowledged' && nextResponse !== 'disputed') return;
    const note = String(issueResponseDrafts[issue.id] || '').trim();
    if (nextResponse === 'disputed' && !note) {
      setError('Please add a short note before marking an issue as disputed.');
      return;
    }
    try {
      setIssueRespondingId(Number(issue.id || 0));
      setError('');
      setSuccess('');
      await creditApi.respondIssue(effectiveUserId, issue.id, {
        response_status: nextResponse,
        message: note,
      });
      const issueRows = await creditApi.listIssues(effectiveUserId);
      setCreditIssues(Array.isArray(issueRows) ? issueRows : []);
      setIssueResponseDrafts((prev) => ({ ...prev, [issue.id]: '' }));
      setSuccess(nextResponse === 'acknowledged'
        ? 'Thanks. Admin has been notified that this issue is acknowledged.'
        : 'Your dispute has been sent to admin for re-check.');
    } catch (err) {
      setError(err.message || 'Failed to send issue response');
    } finally {
      setIssueRespondingId(0);
    }
  };

  const getAdminIssueDraft = (issue) => {
    const current = adminIssueDrafts[issue.id] || {};
    return {
      admin_reason: current.admin_reason ?? issue.admin_reason ?? issue.resolution_note ?? '',
      correction_type: current.correction_type ?? '',
      correction_amount: current.correction_amount ?? '',
      correction_description: current.correction_description ?? '',
      correction_reference: current.correction_reference ?? '',
    };
  };

  const setAdminIssueDraft = (id, patch) => {
    setAdminIssueDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch,
      },
    }));
  };

  const scrollToTransactionEntry = (entryId) => {
    const numericId = Number(entryId || 0);
    if (!numericId || typeof document === 'undefined') return;
    const selector = `[data-credit-entry-id="${numericId}"]`;
    const target = document.querySelector(selector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAdminIssueAction = async (issue, action) => {
    if (!isAdminView) return;
    const issueId = Number(issue?.id || 0);
    if (!issueId) return;
    const nextAction = String(action || '').trim().toLowerCase();
    if (!nextAction) return;
    const draft = getAdminIssueDraft(issue);
    const payload = {
      action: nextAction,
      admin_reason: String(draft.admin_reason || '').trim(),
    };
    const correctionAmount = Number(draft.correction_amount || 0);
    if (nextAction === 'corrected' && correctionAmount > 0) {
      payload.correction_type = draft.correction_type === 'payment' ? 'payment' : 'given';
      payload.correction_amount = correctionAmount;
      payload.correction_description = String(draft.correction_description || '').trim();
      payload.correction_reference = String(draft.correction_reference || '').trim();
    }
    try {
      setAdminIssueSavingId(issueId);
      setError('');
      setSuccess('');
      await adminApi.updateCreditIssue(issueId, payload);
      await fetchCreditData(effectiveUserId);
      setSuccess('Issue action submitted and customer has been notified.');
      setActiveAdminIssueId(0);
    } catch (err) {
      setError(err.message || 'Failed to update issue');
    } finally {
      setAdminIssueSavingId(0);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    addTransactionLockRef.current = false;
    addTransactionRequestIdRef.current = '';
  };

  const openAddModalWithType = (type = 'given') => {
    setError('');
    setSuccess('');
    setNewTransaction((prev) => ({
      ...prev,
      type: type === 'payment' ? 'payment' : 'given',
    }));
    addTransactionLockRef.current = false;
    addTransactionRequestIdRef.current = createClientRequestId('credit');
    setShowAddModal(true);
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
      thankYouLine: 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।'
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
    setReportSummary(null);
    const filtered = creditHistory.filter((t) => {
      const dateKey = getEffectiveTransactionDateKey(t);
      return Boolean(dateKey) && dateKey >= fromDate && dateKey <= toDate;
    }).sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

    const totals = filtered.reduce((acc, transaction) => {
      const numericAmount = Number(transaction?.amount || 0);
      if (String(transaction?.type || '').toLowerCase() === 'payment') {
        acc.totalPayment += numericAmount;
      } else {
        acc.totalGiven += numericAmount;
      }
      return acc;
    }, { totalGiven: 0, totalPayment: 0 });

    const allThroughPeriod = creditHistory
      .filter((t) => {
        const dateKey = getEffectiveTransactionDateKey(t);
        return Boolean(dateKey) && dateKey <= toDate;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const endingBalance = allThroughPeriod.length > 0
      ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
      : 0;

    const report = buildCreditReport(filtered, fromDate, toDate);
    setReportText(report);
    setReportSummary({
      entryCount: filtered.length,
      fromDate,
      toDate,
      netChange: totals.totalGiven - totals.totalPayment,
      endingBalance,
    });
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
    thankYouLine: thankYouLine || 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।'
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

  const filteredTransactions = applyCreditQuickFilters(creditHistory, {
    typeFilter: quickTypeFilter,
    rangeFilter: quickRangeFilter,
    nowTimestamp: Date.now(),
    getTimestamp: getEffectiveTransactionTimestamp,
  }).sort(compareTransactionsByDateDesc);

  const groupedTransactions = (() => {
    const groups = new Map();
    filteredTransactions.forEach((transaction) => {
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
        transactions: [...transactions].sort(compareTransactionsByDateDesc)
      }));
  })();

  const lastTransaction = getLastTransactionFromHistory(creditHistory, getEffectiveTransactionTimestamp);
  const lastTransactionLine = lastTransaction
    ? `Last: ${getTypeLabel(lastTransaction.type)} · ${formatTransactionDate(lastTransaction, { long: true })}`
    : 'Last: No transactions yet';
  const balanceSummary = getBalanceSummary(balance, {
    viewerRole: isAdminView ? 'admin' : 'customer',
  });
  const inactivityHint = getRecentActivityHint(
    lastTransaction ? getEffectiveTransactionTimestamp(lastTransaction) : 0,
    { idleDays: 30 }
  );
  const hasFiltersApplied = quickTypeFilter !== 'all' || quickRangeFilter !== 'all';
  const issueFlagByEntryId = (() => {
    const map = new Map();
    const tonePriority = {
      open: 1,
      review: 2,
      rejected: 3,
      corrected: 4,
    };
    for (const issue of creditIssues) {
      const entryId = Number(issue?.credit_entry_id || 0);
      if (!entryId) continue;
      const status = String(issue?.status || '').trim().toLowerCase();
      const customerResponse = String(issue?.customer_response_status || '').trim().toLowerCase();
      let tone = '';
      let label = '';
      if (customerResponse === 'disputed' || status === 'in_review') {
        tone = 'review';
        label = 'Under Review';
      } else if (status === 'open') {
        tone = 'open';
        label = 'Issue Open';
      } else if (status === 'corrected') {
        tone = 'corrected';
        label = 'Corrected';
      } else if (status === 'rejected') {
        tone = 'rejected';
        label = 'Rejected';
      }
      if (!tone) continue;
      const updatedAtTs = new Date(issue?.updated_at || issue?.created_at || 0).getTime() || 0;
      const existing = map.get(entryId);
      const nextPriority = Number(tonePriority[tone] || 0);
      if (!existing || updatedAtTs > existing.updatedAtTs || (updatedAtTs === existing.updatedAtTs && nextPriority >= existing.priority)) {
        map.set(entryId, {
          tone,
          label,
          updatedAtTs,
          priority: nextPriority,
        });
      }
    }
    return map;
  })();
  const adminVisibleIssues = isAdminView
    ? creditIssues.filter((issue) => {
      const status = String(issue?.status || '').trim().toLowerCase();
      const response = String(issue?.customer_response_status || '').trim().toLowerCase();
      if (focusIssueId > 0 && Number(issue?.id || 0) === focusIssueId) return true;
      return status === 'open' || status === 'in_review' || response === 'pending' || response === 'disputed';
    })
    : [];

  useEffect(() => {
    if (!focusEntryId) return;
    if (loading) return;
    scrollToTransactionEntry(focusEntryId);
  }, [focusEntryId, loading, filteredTransactions.length]);

  useEffect(() => {
    if (!focusIssueId) return;
    setActiveAdminIssueId(focusIssueId);
  }, [focusIssueId]);

  const buildTransactionShareText = (transaction) => {
    const amount = Number(transaction?.amount || 0);
    const updatedBalance = Number(transaction?.balance || 0);
    const previousBalance = String(transaction?.type || '').toLowerCase() === 'payment'
      ? updatedBalance + amount
      : updatedBalance - amount;

    return buildCreditTransactionText({
      companyTitle: info.TITLE || 'BARMAN STORE',
      dateLabel: formatTransactionDate(transaction),
      typeLabel: getTypeLabel(transaction?.type),
      amount,
      description: transaction?.description || 'অতিৰিক্ত টোকা নাই',
      reference: transaction?.reference || '',
      previousBalance,
      updatedBalance,
      onlineStoreUrl: info.ONLINE_STORE_URL,
      thankYouLine: 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।'
    });
  };

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
  const trustLine = isAdminView
    ? 'Data stored safely in your Barman Store system. Backup available in Admin > Backup.'
    : 'Data stored safely in your Barman Store system.';
  const addModalTitle = newTransaction.type === 'payment' ? 'Add Payment' : 'Add Credit';
  const addModalActionLabel = newTransaction.type === 'payment' ? 'Payment' : 'Credit';

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
      </div>

      <section className="balance-card summary-hero-card">
        <span className="balance-label">{balanceSummary.headline}</span>
        <span className={`balance-amount ${balanceSummary.toneClass}`}>
          {formatCurrency(Math.abs(Number(balance || 0)))}
        </span>
        <span className="summary-direction">{balanceSummary.directionLine}</span>
        <span className="summary-last-line">{lastTransactionLine}</span>
        <span className="summary-trust-line">{trustLine}</span>
      </section>

      {inactivityHint && (
        <div className="inactivity-hint">{inactivityHint}</div>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {isAdminView && !isMobile && (
        <div className="actions-bar">
          <button className="admin-btn primary" onClick={() => openAddModalWithType('payment')}>
            <RefreshCw size={18} /> Add Payment
          </button>
          <button className="admin-btn" onClick={() => openAddModalWithType('given')}>
            <Plus size={18} /> Add Credit
          </button>
        </div>
      )}

      <div className="quick-filter-panel">
        <div className="quick-filter-group">
          <span className="quick-filter-title">Type</span>
          <div className="quick-filter-chips">
            <button
              type="button"
              className={`quick-chip ${quickTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setQuickTypeFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`quick-chip ${quickTypeFilter === 'given' ? 'active' : ''}`}
              onClick={() => setQuickTypeFilter('given')}
            >
              Given
            </button>
            <button
              type="button"
              className={`quick-chip ${quickTypeFilter === 'payment' ? 'active' : ''}`}
              onClick={() => setQuickTypeFilter('payment')}
            >
              Payment
            </button>
          </div>
        </div>
        <div className="quick-filter-group">
          <span className="quick-filter-title">Range</span>
          <div className="quick-filter-chips">
            <button
              type="button"
              className={`quick-chip ${quickRangeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setQuickRangeFilter('all')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`quick-chip ${quickRangeFilter === '7d' ? 'active' : ''}`}
              onClick={() => setQuickRangeFilter('7d')}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`quick-chip ${quickRangeFilter === '30d' ? 'active' : ''}`}
              onClick={() => setQuickRangeFilter('30d')}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`quick-chip ${quickRangeFilter === 'this_month' ? 'active' : ''}`}
              onClick={() => setQuickRangeFilter('this_month')}
            >
              This Month
            </button>
          </div>
        </div>
      </div>

      {isAdminView && (
        <div className="report-box admin-issue-workbench">
          <div className="report-header">
            <strong>Transaction Issue Inbox</strong>
          </div>
          {adminVisibleIssues.length === 0 ? (
            <p className="muted">No customer transaction issues right now.</p>
          ) : (
            <div className="admin-issue-list">
              {adminVisibleIssues.map((issue) => {
                const issueId = Number(issue?.id || 0);
                const draft = getAdminIssueDraft(issue);
                const isFocused = focusIssueId > 0 && issueId === focusIssueId;
                const entryId = Number(issue?.credit_entry_id || 0) || null;
                return (
                  <article key={issueId || `issue-${issue.created_at || ''}`} className={`admin-issue-card ${isFocused ? 'focused' : ''}`}>
                    <div className="admin-issue-top">
                      <strong>Issue #{issueId}</strong>
                      <span className={`status-chip ${issue.status}`}>{issue.status}</span>
                    </div>
                    <div className="admin-issue-meta">
                      <span>Type: {issue.issue_type}</span>
                      {entryId ? <span>Entry: #{entryId}</span> : null}
                      {issue.customer_response_status ? (
                        <span>Customer: {issue.customer_response_status}</span>
                      ) : null}
                    </div>
                    <p>{issue.message}</p>
                    {(issue.admin_reason || issue.resolution_note) ? (
                      <p><strong>Reason:</strong> {issue.admin_reason || issue.resolution_note}</p>
                    ) : null}
                    {entryId ? (
                      <button
                        type="button"
                        className="report-btn secondary-action"
                        onClick={() => scrollToTransactionEntry(entryId)}
                      >
                        Go to Transaction
                      </button>
                    ) : null}
                    {activeAdminIssueId !== issueId ? (
                      <button
                        type="button"
                        className="report-btn secondary-action"
                        onClick={() => setActiveAdminIssueId(issueId)}
                      >
                        Open Action Panel
                      </button>
                    ) : (
                      <>
                        <label>
                          Resolution Reason
                          <textarea
                            id={`issue-admin-reason-${issueId}`}
                            name={`issue_admin_reason_${issueId}`}
                            value={draft.admin_reason}
                            onChange={(e) => setAdminIssueDraft(issueId, { admin_reason: e.target.value })}
                            rows={2}
                            placeholder="Reason visible to customer"
                          />
                        </label>
                        <div className="request-correction-grid">
                          <label>
                            Correction Type
                            <select
                              id={`issue-correction-type-${issueId}`}
                              name={`issue_correction_type_${issueId}`}
                              value={draft.correction_type}
                              onChange={(e) => setAdminIssueDraft(issueId, { correction_type: e.target.value })}
                            >
                              <option value="">None</option>
                              <option value="given">Credit</option>
                              <option value="payment">Payment</option>
                            </select>
                          </label>
                          <label>
                            Correction Amount
                            <input
                              id={`issue-correction-amount-${issueId}`}
                              name={`issue_correction_amount_${issueId}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.correction_amount}
                              onChange={(e) => setAdminIssueDraft(issueId, { correction_amount: e.target.value })}
                              placeholder="0"
                            />
                          </label>
                        </div>
                        <label>
                          Correction Description
                          <input
                            id={`issue-correction-description-${issueId}`}
                            name={`issue_correction_description_${issueId}`}
                            type="text"
                            value={draft.correction_description}
                            onChange={(e) => setAdminIssueDraft(issueId, { correction_description: e.target.value })}
                            placeholder="Optional"
                          />
                        </label>
                        <div className="request-correction-actions">
                          <button
                            type="button"
                            className="report-btn secondary-action"
                            onClick={() => handleAdminIssueAction(issue, 'in_review')}
                            disabled={adminIssueSavingId === issueId}
                          >
                            {adminIssueSavingId === issueId ? 'Submitting...' : 'Needs Review'}
                          </button>
                          <button
                            type="button"
                            className="report-btn secondary-action"
                            onClick={() => handleAdminIssueAction(issue, 'rejected')}
                            disabled={adminIssueSavingId === issueId}
                          >
                            {adminIssueSavingId === issueId ? 'Submitting...' : 'Reject'}
                          </button>
                          <button
                            type="button"
                            className="report-btn primary-action"
                            onClick={() => handleAdminIssueAction(issue, 'corrected')}
                            disabled={adminIssueSavingId === issueId}
                          >
                            {adminIssueSavingId === issueId ? 'Submitting...' : 'Submit Correction'}
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="credit-table-container">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            {creditHistory.length === 0 ? (
              <>
                <p>No entries yet{isAdminView ? ' for this customer.' : '.'}</p>
                {isAdminView && <p>Tap "Add Credit" for first sale or "Add Payment" when customer pays.</p>}
              </>
            ) : (
              <>
                <p>No entries match current filters.</p>
                {hasFiltersApplied && <p>Switch filters to "All" to view complete history.</p>}
              </>
            )}
          </div>
        ) : (
          <>
            <table className="credit-table">
              <thead>
                <tr>
                  <th className="credit-col-date">Date</th>
                  <th>Invoice #</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Description</th>
                  <th className="credit-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => {
                  const descriptionWithRef = transaction.reference
                    ? `${transaction.description || ''} (${transaction.reference})`.trim()
                    : transaction.description || '-';
                  const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
                  const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
                  return (
                    <tr
                      key={transaction.id}
                      data-credit-entry-id={Number(transaction.id || 0) || undefined}
                      className={issueFlag ? `credit-row-issue ${issueFlag.tone}` : ''}
                    >
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
                      <td>
                        {descriptionWithRef}
                        {issueFlag ? <span className={`entry-issue-pill ${issueFlag.tone}`}>{issueFlag.label}</span> : null}
                      </td>
                      <td className="actions-cell">
                        {!isAdminView && (
                          <button
                            className="action-icon"
                            onClick={() => setIssueForm((prev) => ({ ...prev, credit_entry_id: String(transaction.id || '') }))}
                            title="Report issue on this entry"
                          >
                            <FileText size={16} />
                          </button>
                        )}
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
                        {isAdminView && (
                          <button
                            className="action-icon delete"
                            onClick={() => handleDeleteTransaction(transaction)}
                            title="Delete entry"
                            disabled={deletingEntryId === Number(transaction.id || 0)}
                          >
                            <Trash2 size={16} />
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
                  <div className="credit-tile-stack">
                    {group.transactions.map((transaction) => {
                      const description = String(transaction.description || '').trim();
                      const reference = String(transaction.reference || '').trim();
                      const signedAmount = transaction.type === 'payment'
                        ? -parseFloat(transaction.amount)
                        : parseFloat(transaction.amount);
                      const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
                      const isExpanded = expandedTransactionId === transaction.id;
                      const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
                      return (
                        <article
                          key={`mobile-${transaction.id}`}
                          data-credit-entry-id={Number(transaction.id || 0) || undefined}
                          className={`credit-transaction-tile ${transaction.type === 'payment' ? 'payment' : 'given'}${issueFlag ? ` has-issue ${issueFlag.tone}` : ''}`}
                        >
                          <header className="tile-top-row">
                            <span className="tile-type-wrap">
                              <span className={`tile-type-pill ${transaction.type === 'payment' ? 'payment' : 'given'}`}>
                                {getTypeLabel(transaction.type)}
                              </span>
                              {issueFlag ? <span className={`entry-issue-pill ${issueFlag.tone}`}>{issueFlag.label}</span> : null}
                            </span>
                            <span className={`tile-amount ${transaction.type === 'payment' ? 'payment-amount' : 'given-amount'}`}>
                              {formatCurrencyColored(signedAmount)}
                            </span>
                          </header>

                          <div className="tile-meta-row">
                            <span>{formatTransactionDate(transaction, { long: true })}</span>
                            <span>Invoice: {transaction.invoice_number || '-'}</span>
                          </div>

                          <div className="tile-description">
                            {truncateCreditDescription(description || 'No description', 52)}
                          </div>

                          <div className="tile-footer-row">
                            <span className="tile-balance-pill">
                              Balance: {formatCurrencyColored(parseFloat(transaction.balance))}
                            </span>
                            <button
                              type="button"
                              className="tile-expand-btn"
                              onClick={() => setExpandedTransactionId(isExpanded ? null : transaction.id)}
                            >
                              {isExpanded ? 'Less' : 'More'}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="tile-expanded">
                              <div className="tile-detail"><strong>Invoice:</strong> {transaction.invoice_number || '-'}</div>
                              {reference ? <div className="tile-detail"><strong>Ref:</strong> {reference}</div> : null}
                              <div className="tile-detail"><strong>Date:</strong> {formatTransactionDate(transaction, { long: true })}</div>
                              <div className="tile-actions">
                                {!isAdminView && (
                                  <button
                                    className="action-icon"
                                    onClick={() => setIssueForm((prev) => ({ ...prev, credit_entry_id: String(transaction.id || '') }))}
                                    title="Report issue on this entry"
                                  >
                                    <FileText size={16} />
                                  </button>
                                )}
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
                                {isAdminView && (
                                  <button
                                    className="action-icon delete"
                                    onClick={() => handleDeleteTransaction(transaction)}
                                    title="Delete entry"
                                    disabled={deletingEntryId === Number(transaction.id || 0)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
              )}
         {!isAdminView && (
            <div className="report-box">
              <div className="report-header">
                <strong>Report Credit Entry Issue</strong>
              </div>
              <form className="credit-issue-form" onSubmit={handleReportIssue}>
                <label>
                  Entry
                  <select
                    id="credit-issue-entry"
                    name="credit_entry_id"
                    value={issueForm.credit_entry_id}
                    onChange={(e) => setIssueForm((prev) => ({ ...prev, credit_entry_id: e.target.value }))}
                  >
                    <option value="">Select (optional)</option>
                    {creditHistory.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        #{entry.id} | {getTypeLabel(entry.type)} | {formatCurrency(entry.amount || 0)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Issue Type
                  <select
                    id="credit-issue-type"
                    name="issue_type"
                    value={issueForm.issue_type}
                    onChange={(e) => setIssueForm((prev) => ({ ...prev, issue_type: e.target.value }))}
                  >
                    <option value="wrong_entry">Wrong Entry</option>
                    <option value="missing_entry">Missing Entry</option>
                    <option value="wrong_amount">Wrong Amount</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Message
                  <textarea
                    id="credit-issue-message"
                    name="issue_message"
                    value={issueForm.message}
                    onChange={(e) => setIssueForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Explain what is wrong so admin can correct it."
                    rows={3}
                    required
                  />
                </label>
                <button type="submit" className="report-btn primary-action" disabled={issueSubmitting}>
                  {issueSubmitting ? 'Submitting...' : 'Submit Issue'}
                </button>
              </form>
              {creditIssues.length > 0 && (
                <div className="credit-issues-list">
                  {creditIssues.map((issue) => (
                    <div key={issue.id} className="credit-issue-row">
                      <div>
                        <strong>#{issue.id}</strong> {issue.issue_type}
                      </div>
                      <div>{issue.message}</div>
                      <div className={`status-chip ${issue.status}`}>{issue.status}</div>
                      {issue.admin_reason || issue.resolution_note ? (
                        <div><strong>Admin reason:</strong> {issue.admin_reason || issue.resolution_note}</div>
                      ) : null}
                      {issue.correction_entry_id ? (
                        <div><strong>Correction entry:</strong> #{issue.correction_entry_id}</div>
                      ) : null}
                      {issue.customer_response_status ? (
                        <div><strong>Your response:</strong> {issue.customer_response_status}</div>
                      ) : null}
                      {(issue.status === 'corrected' || issue.status === 'rejected') && !issue.customer_response_status ? (
                        <div className="credit-issue-response">
                          <textarea
                            id={`credit-issue-response-${issue.id}`}
                            name={`credit_issue_response_${issue.id}`}
                            value={issueResponseDrafts[issue.id] || ''}
                            onChange={(e) => setIssueResponseDrafts((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                            placeholder="Optional note. Required if you still disagree."
                            rows={2}
                          />
                          <div className="credit-issue-response-actions">
                            <button
                              type="button"
                              className="report-btn secondary-action"
                              onClick={() => handleIssueResponse(issue, 'acknowledged')}
                              disabled={issueRespondingId === Number(issue.id)}
                            >
                              {issueRespondingId === Number(issue.id) ? 'Sending...' : 'Acknowledge'}
                            </button>
                            <button
                              type="button"
                              className="report-btn primary-action"
                              onClick={() => handleIssueResponse(issue, 'disputed')}
                              disabled={issueRespondingId === Number(issue.id)}
                            >
                              {issueRespondingId === Number(issue.id) ? 'Sending...' : 'Still Wrong'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
         )}
         {isAdminView && (
            <div id="credit-report-controls" className="report-controls credit-secondary-tools report-controls-light">
               <label htmlFor="credit-report-from-date">
                 <span>From:</span>
                 <input id="credit-report-from-date" name="from_date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
               </label>
               <label htmlFor="credit-report-to-date">
                 <span>To:</span>
                 <input id="credit-report-to-date" name="to_date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
              <button type="button" className="report-btn primary-action" onClick={handleGenerateReport} title="Generate credit report for date range">
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
          {reportSummary && (
            <div className="report-summary-line">
              <span>{reportSummary.entryCount} entries</span>
              <span>{reportSummary.fromDate} to {reportSummary.toDate}</span>
              <span>Net change: {formatCurrencyColored(reportSummary.netChange)}</span>
              <span>Ending balance: {formatCurrencyColored(reportSummary.endingBalance)}</span>
            </div>
          )}
          <textarea id="credit-report-preview" name="credit_report_preview" className="report-text" readOnly value={reportText} />
          <div className="report-actions">
            <button className="report-btn primary-action" onClick={handleCopyReport}>Copy Text</button>
            <button className="report-btn whatsapp primary-action" onClick={handleSendWhatsApp}>Share on WhatsApp</button>
            <button className="report-btn pdf secondary-action" onClick={generatePDFReport}><Download size={14} /> PDF</button>
            <button className="report-btn secondary-action" onClick={() => { setShowReport(false); setReportSummary(null); }}>Close</button>
          </div>
        </div>
      )}

      {isAdminView && entryShareText && (
        <div className="report-box">
          <div className="report-header">
            <strong>Manual Entry Message</strong>
          </div>
          <textarea id="credit-entry-share-text" name="credit_entry_share_text" className="report-text" readOnly value={entryShareText} />
          <div className="report-actions">
            <button className="report-btn" onClick={handleCopyEntryShare}>Copy</button>
            <button className="report-btn whatsapp" onClick={handleSendEntryWhatsApp}>WhatsApp</button>
            <button className="report-btn" onClick={() => setEntryShareText('')}>Close</button>
          </div>
        </div>
      )}

      {isAdminView && isMobile && (
        <div className="credit-mobile-cta-bar">
          <button
            type="button"
            className="mobile-cta payment"
            onClick={() => openAddModalWithType('payment')}
          >
            <RefreshCw size={16} /> Add Payment
          </button>
          <button
            type="button"
            className="mobile-cta given"
            onClick={() => openAddModalWithType('given')}
          >
            <Plus size={16} /> Add Credit
          </button>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isAdminView && showAddModal && (
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
                <input
                  id="credit-tx-amount"
                  name="amount"
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
