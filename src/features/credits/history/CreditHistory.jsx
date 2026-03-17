import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { DollarSign, Plus, RefreshCw } from 'lucide-react';
import { creditApi, usersApi, adminApi, createClientRequestId } from '../../../services/api';
import { sendWhatsAppSmart } from '../../../utils/whatsapp';
import * as info from '../../../shared/info';
import { printHtmlDocument, escapeHtml } from '../../../utils/printService';
import { createPdfDoc, addAutoTable, addPdfFooterWithPagination, savePdf, safeFileName } from '../../../utils/pdfService';
import { formatCurrency, getSignedCurrencyClassName } from '../../../utils/formatters';
import MobileAccountLayout from '../../../components/mobile/MobileAccountLayout';
import {
  applyCreditQuickFilters,
  getBalanceSummary,
  getLastTransactionFromHistory,
  getRecentActivityHint,
  truncateCreditDescription,
} from '../../../utils/creditHistoryUi.mjs';
import { buildCreditReportText, buildCreditEntryText, buildCreditTransactionText } from '../../../utils/messageTemplates';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import CreditAddTransactionModal from './components/CreditAddTransactionModal';
import CreditInvoiceModal from './components/CreditInvoiceModal';
import CreditEntrySharePanel from './components/CreditEntrySharePanel';
import CreditHistoryHeader from './components/CreditHistoryHeader';
import CreditIssuesAdminInbox from './components/CreditIssuesAdminInbox';
import CreditQuickFilters from './components/CreditQuickFilters';
import CreditReportPreview from './components/CreditReportPreview';
import CreditTransactionsSection from './components/CreditTransactionsSection';
import {
  PDF_TABLE_LAYOUT,
  FIVE_DAYS_MS,
  compareTransactionsByDateDesc,
  formatPdfCurrency,
  formatTransactionDate,
  getEffectiveTransactionDateKey,
  getEffectiveTransactionTimestamp,
  getPdfColumnStyles,
  getTodayDateInputValue,
} from './utils/creditHistoryHelpers';
import './CreditHistory.css';

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};


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
  const [paymentBadges, setPaymentBadges] = useState([]);
  const [paymentBadgeSummary, setPaymentBadgeSummary] = useState(null);
  const [paymentBadgesLoading, setPaymentBadgesLoading] = useState(false);
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

  const loadPaymentBadges = async (targetUserId = effectiveUserId) => {
    if (!targetUserId) return;
    try {
      setPaymentBadgesLoading(true);
      const data = await creditApi.getPaymentBadges(targetUserId);
      setPaymentBadges(Array.isArray(data?.badges) ? data.badges : []);
      setPaymentBadgeSummary(data?.summary || null);
    } catch (_) {
      setPaymentBadges([]);
      setPaymentBadgeSummary(null);
    } finally {
      setPaymentBadgesLoading(false);
    }
  };

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
      loadPaymentBadges(targetUserId);
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
      setPaymentBadges([]);
      setPaymentBadgeSummary(null);
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
  const showPaymentBadges = paymentBadgesLoading
    || paymentBadges.length > 0
    || Number(paymentBadgeSummary?.total_payments || 0) > 0;
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
      <MobileAccountLayout>
        <div className="credit-history-page">
          <div className="loading">Loading...</div>
        </div>
      </MobileAccountLayout>
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
    <MobileAccountLayout>
      <div className="credit-history-page">
        <CreditHistoryHeader
          backHref={backHref}
          backLabel={backLabel}
          isAdminView={isAdminView}
          customer={customer}
          balanceSummary={balanceSummary}
          balance={balance}
          lastTransactionLine={lastTransactionLine}
          trustLine={trustLine}
          showPaymentBadges={showPaymentBadges}
          paymentBadgesLoading={paymentBadgesLoading}
          paymentBadges={paymentBadges}
          paymentBadgeSummary={paymentBadgeSummary}
          inactivityHint={inactivityHint}
          error={error}
          success={success}
          isMobile={isMobile}
          openAddModalWithType={openAddModalWithType}
        />

        <CreditQuickFilters
          quickTypeFilter={quickTypeFilter}
          setQuickTypeFilter={setQuickTypeFilter}
          quickRangeFilter={quickRangeFilter}
          setQuickRangeFilter={setQuickRangeFilter}
        />

      {isAdminView && (
        <CreditIssuesAdminInbox
          adminVisibleIssues={adminVisibleIssues}
          focusIssueId={focusIssueId}
          getAdminIssueDraft={getAdminIssueDraft}
          setAdminIssueDraft={setAdminIssueDraft}
          activeAdminIssueId={activeAdminIssueId}
          setActiveAdminIssueId={setActiveAdminIssueId}
          handleAdminIssueAction={handleAdminIssueAction}
          adminIssueSavingId={adminIssueSavingId}
          scrollToTransactionEntry={scrollToTransactionEntry}
        />
      )}

      <CreditTransactionsSection
        filteredTransactions={filteredTransactions}
        creditHistory={creditHistory}
        hasFiltersApplied={hasFiltersApplied}
        isAdminView={isAdminView}
        isMobile={isMobile}
        issueFlagByEntryId={issueFlagByEntryId}
        groupedTransactions={groupedTransactions}
        expandedTransactionId={expandedTransactionId}
        setExpandedTransactionId={setExpandedTransactionId}
        getTypeIcon={getTypeIcon}
        getTypeLabel={getTypeLabel}
        formatTransactionDate={formatTransactionDate}
        formatCurrencyColored={formatCurrencyColored}
        isTransactionWithinFiveDays={isTransactionWithinFiveDays}
        truncateCreditDescription={truncateCreditDescription}
        setIssueForm={setIssueForm}
        handlePrintInvoice={handlePrintInvoice}
        handleSendTransactionWhatsApp={handleSendTransactionWhatsApp}
        handleDeleteTransaction={handleDeleteTransaction}
        deletingEntryId={deletingEntryId}
        issueForm={issueForm}
        handleReportIssue={handleReportIssue}
        issueSubmitting={issueSubmitting}
        creditIssues={creditIssues}
        issueResponseDrafts={issueResponseDrafts}
        setIssueResponseDrafts={setIssueResponseDrafts}
        handleIssueResponse={handleIssueResponse}
        issueRespondingId={issueRespondingId}
        fromDate={fromDate}
        toDate={toDate}
        setFromDate={setFromDate}
        setToDate={setToDate}
        handleGenerateReport={handleGenerateReport}
      />

      {/* Report preview / share box */}
      {isAdminView && (
        <CreditReportPreview
          showReport={showReport}
          reportSummary={reportSummary}
          reportText={reportText}
          customer={customer}
          formatCurrencyColored={formatCurrencyColored}
          handleCopyReport={handleCopyReport}
          handleSendWhatsApp={handleSendWhatsApp}
          generatePDFReport={generatePDFReport}
          setShowReport={setShowReport}
          setReportSummary={setReportSummary}
        />
      )}

      {isAdminView && (
        <CreditEntrySharePanel
          entryShareText={entryShareText}
          handleCopyEntryShare={handleCopyEntryShare}
          handleSendEntryWhatsApp={handleSendEntryWhatsApp}
          setEntryShareText={setEntryShareText}
        />
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
      <CreditAddTransactionModal
        showAddModal={isAdminView && showAddModal}
        closeAddModal={closeAddModal}
        addingTransaction={addingTransaction}
        handleAddTransaction={handleAddTransaction}
        newTransaction={newTransaction}
        setNewTransaction={setNewTransaction}
        fileInputRef={fileInputRef}
        handleFileUpload={handleFileUpload}
        uploading={uploading}
        addModalTitle={addModalTitle}
        addModalActionLabel={addModalActionLabel}
      />

      {/* Invoice Modal */}
      <CreditInvoiceModal
        showInvoiceModal={showInvoiceModal}
        selectedTransaction={selectedTransaction}
        setShowInvoiceModal={setShowInvoiceModal}
        formatTransactionDate={formatTransactionDate}
        customer={customer}
        getTypeLabel={getTypeLabel}
        formatCurrencyColored={formatCurrencyColored}
        printInvoice={printInvoice}
      />

      </div>
    </MobileAccountLayout>
  );
}

export default CreditHistory;

