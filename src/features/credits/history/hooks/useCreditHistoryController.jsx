import { useCallback } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DollarSign, RefreshCw } from 'lucide-react';
import { creditApi, usersApi, adminApi, createClientRequestId } from '../../../../shared/services/api';
import { sendWhatsAppSmart } from '../../../../shared/utils/whatsapp';
import * as info from '../../../../shared/info';
import { printHtmlDocument, escapeHtml } from '../../../../shared/utils/printService';
import {
  createPdfDoc,
  addAutoTable,
  addPdfFooterWithPagination,
  savePdf,
  safeFileName,
} from '../../../../shared/utils/pdfService';
import { formatCurrency } from '../../../../shared/utils/formatters';
import {
  applyCreditQuickFilters,
  getBalanceSummary,
  getLastTransactionFromHistory,
  getRecentActivityHint,
  truncateCreditDescription,
} from '../../../../shared/utils/creditHistoryUi.mjs';
import {
  buildCreditReportText,
  buildCreditEntryText,
  buildCreditTransactionText,
} from '../../../../shared/utils/messageTemplates';
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
} from '../utils/creditHistoryHelpers';
import { getAdminTabHref } from '../../../admin/config/adminSidebarConfig';
import useCreditHistoryComputed from './useCreditHistoryComputed';
import useCreditHistoryEffects from './useCreditHistoryEffects';
import useCreditHistoryIssues from './useCreditHistoryIssues';
import useCreditHistoryLoaders from './useCreditHistoryLoaders';
import useCreditHistoryReports from './useCreditHistoryReports';
import useCreditHistoryState from './useCreditHistoryState';
import useCreditHistoryTransactions from './useCreditHistoryTransactions';
import {
  getCreditEntryDelta,
  getCreditEntryTypeLabel,
} from '../utils/creditLedgerPresentation';

const useCreditHistoryController = ({ user }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const state = useCreditHistoryState({ user, userId, searchParams, getTodayDateInputValue });
  const {
    authUser,
    isAdminView,
    effectiveUserId,
    creditHistory,
    setCreditHistory,
    balance,
    setBalance,
    customer,
    setCustomer,
    loading,
    setLoading,
    showAddModal,
    setShowAddModal,
    selectedTransaction,
    setSelectedTransaction,
    showInvoiceModal,
    setShowInvoiceModal,
    addingTransaction,
    setAddingTransaction,
    uploading,
    setUploading,
    newTransaction,
    setNewTransaction,
    createNewTransactionDraft,
    error,
    setError,
    success,
    setSuccess,
    paymentBadges,
    setPaymentBadges,
    paymentBadgeSummary,
    setPaymentBadgeSummary,
    paymentBadgesLoading,
    setPaymentBadgesLoading,
    isMobile,
    setIsMobile,
    fileInputRef,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    reportText,
    setReportText,
    showReport,
    setShowReport,
    reportSummary,
    setReportSummary,
    entryShareText,
    setEntryShareText,
    quickTypeFilter,
    setQuickTypeFilter,
    quickRangeFilter,
    setQuickRangeFilter,
    expandedTransactionId,
    setExpandedTransactionId,
    creditIssues,
    setCreditIssues,
    issueSubmitting,
    setIssueSubmitting,
    issueForm,
    setIssueForm,
    issueRespondingId,
    setIssueRespondingId,
    issueResponseDrafts,
    setIssueResponseDrafts,
    adminIssueDrafts,
    setAdminIssueDrafts,
    adminIssueSavingId,
    setAdminIssueSavingId,
    activeAdminIssueId,
    setActiveAdminIssueId,
    deletingEntryId,
    setDeletingEntryId,
    focusIssueId,
    focusEntryId,
    addTransactionLockRef,
    addTransactionRequestIdRef,
  } = state;

  const { fetchCreditData } = useCreditHistoryLoaders({
    creditApi,
    usersApi,
    navigate,
    setLoading,
    setCreditHistory,
    setBalance,
    setCustomer,
    setPaymentBadges,
    setPaymentBadgeSummary,
    setPaymentBadgesLoading,
    setCreditIssues,
    setError,
    effectiveUserId,
  });

  const getTypeIcon = (type) => {
    const entry = type && typeof type === 'object' ? type : { type };
    return getCreditEntryDelta(entry) < 0
      ? <RefreshCw size={16} className="type-icon payment" />
      : <DollarSign size={16} className="type-icon given" />;
  };

  const getTypeLabel = (type) => getCreditEntryTypeLabel(type);

  const scrollToTransactionEntry = useCallback((entryId) => {
    const numericId = Number(entryId || 0);
    if (!numericId || typeof document === 'undefined') return;
    const selector = `[data-credit-entry-id="${numericId}"]`;
    const target = document.querySelector(selector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const reports = useCreditHistoryReports({
    creditHistory,
    customer,
    balance,
    paymentBadgeSummary,
    fromDate,
    toDate,
    setError,
    setSuccess,
    setReportText,
    setReportSummary,
    setShowReport,
    reportText,
    entryShareText,
    buildCreditReportText,
    buildCreditEntryText,
    buildCreditTransactionText,
    info,
    formatTransactionDate,
    getEffectiveTransactionDateKey,
    getEffectiveTransactionTimestamp,
    getTypeLabel,
    sendWhatsAppSmart,
    FIVE_DAYS_MS,
    createPdfDoc,
    addAutoTable,
    addPdfFooterWithPagination,
    savePdf,
    safeFileName,
    PDF_TABLE_LAYOUT,
    formatPdfCurrency,
    getPdfColumnStyles,
  });

  const transactions = useCreditHistoryTransactions({
    creditApi,
    effectiveUserId,
    isAdminView,
    authUser,
    addTransactionLockRef,
    addTransactionRequestIdRef,
    addingTransaction,
    setAddingTransaction,
    uploading,
    setUploading,
    newTransaction,
    setNewTransaction,
    createNewTransactionDraft,
    setError,
    setSuccess,
    balance,
    setEntryShareText,
    setShowAddModal,
    setSelectedTransaction,
    setShowInvoiceModal,
    setDeletingEntryId,
    fileInputRef,
    createClientRequestId,
    getTodayDateInputValue,
    buildManualEntryText: reports.buildManualEntryText,
    fetchCreditData,
    printHtmlDocument,
    escapeHtml,
    info,
    formatTransactionDate,
    customer,
    getTypeLabel,
    formatCurrency,
    isMobile,
    selectedTransaction,
  });

  const issues = useCreditHistoryIssues({
    creditApi,
    adminApi,
    effectiveUserId,
    isAdminView,
    setError,
    setSuccess,
    setIssueSubmitting,
    issueSubmitting,
    issueForm,
    setIssueForm,
    setCreditIssues,
    issueResponseDrafts,
    setIssueResponseDrafts,
    setIssueRespondingId,
    setAdminIssueDrafts,
    adminIssueDrafts,
    setAdminIssueSavingId,
    setActiveAdminIssueId,
    fetchCreditData,
  });

  const computed = useCreditHistoryComputed({
    creditHistory,
    balance,
    isAdminView,
    paymentBadges,
    paymentBadgesLoading,
    quickTypeFilter,
    quickRangeFilter,
    creditIssues,
    focusIssueId,
    applyCreditQuickFilters,
    compareTransactionsByDateDesc,
    formatTransactionDate,
    getEffectiveTransactionDateKey,
    getEffectiveTransactionTimestamp,
    getLastTransactionFromHistory,
    getRecentActivityHint,
    getBalanceSummary,
    getTypeLabel,
  });

  useCreditHistoryEffects({
    authUser,
    isAdminView,
    userId,
    effectiveUserId,
    navigate,
    fetchCreditData,
    setIsMobile,
    setExpandedTransactionId,
    quickTypeFilter,
    quickRangeFilter,
    focusEntryId,
    loading,
    scrollToTransactionEntry,
    focusIssueId,
    setActiveAdminIssueId,
  });

  const getBackToAdminUrl = () => {
    const params = new URLSearchParams(location.search || '');
    const returnTab = params.get('returnTab') || location.state?.returnTab;
    if (returnTab) return getAdminTabHref(returnTab);
    return getAdminTabHref();
  };

  const backHref = isAdminView ? getBackToAdminUrl() : '/profile';
  const backLabel = isAdminView ? 'Back to Admin' : 'Back to Profile';
  const billsHref = isAdminView ? getAdminTabHref('view-bills') : '/my-bills';
  const trustLine = isAdminView
    ? 'Running balance is recalculated after every entry. Reversals are audit logged.'
    : 'Running balance is recalculated after every entry.';
  const addModalTitle = newTransaction.type === 'payment' ? 'Add Payment' : 'Add Manual Sale';
  const addModalActionLabel = newTransaction.type === 'payment' ? 'Payment' : 'Manual Sale';

  return {
    loading,
    viewProps: {
      backHref,
      backLabel,
      isAdminView,
      customer,
      balanceSummary: computed.balanceSummary,
      balance,
      ledgerSummary: computed.ledgerSummary,
      lastTransactionLine: computed.lastTransactionLine,
      trustLine,
      billsHref,
      showPaymentBadges: computed.showPaymentBadges,
      paymentBadgesLoading,
      paymentBadges,
      paymentBadgeSummary,
      inactivityHint: computed.inactivityHint,
      error,
      success,
      isMobile,
      openAddModalWithType: transactions.openAddModalWithType,
      quickTypeFilter,
      setQuickTypeFilter,
      quickRangeFilter,
      setQuickRangeFilter,
      adminVisibleIssues: computed.adminVisibleIssues,
      focusIssueId,
      getAdminIssueDraft: issues.getAdminIssueDraft,
      setAdminIssueDraft: issues.setAdminIssueDraft,
      activeAdminIssueId,
      setActiveAdminIssueId,
      handleAdminIssueAction: issues.handleAdminIssueAction,
      adminIssueSavingId,
      scrollToTransactionEntry,
      filteredTransactions: computed.filteredTransactions,
      creditHistory,
      hasFiltersApplied: computed.hasFiltersApplied,
      issueFlagByEntryId: computed.issueFlagByEntryId,
      groupedTransactions: computed.groupedTransactions,
      expandedTransactionId,
      setExpandedTransactionId,
      getTypeIcon,
      getTypeLabel,
      formatTransactionDate,
      truncateCreditDescription,
      setIssueForm,
      handlePrintInvoice: transactions.handlePrintInvoice,
      isTransactionWithinFiveDays: reports.isTransactionWithinFiveDays,
      handleSendTransactionWhatsApp: reports.handleSendTransactionWhatsApp,
      handleDeleteTransaction: transactions.handleDeleteTransaction,
      deletingEntryId,
      issueForm,
      handleReportIssue: issues.handleReportIssue,
      issueSubmitting,
      creditIssues,
      issueResponseDrafts,
      setIssueResponseDrafts,
      handleIssueResponse: issues.handleIssueResponse,
      issueRespondingId,
      fromDate,
      toDate,
      setFromDate,
      setToDate,
      handleGenerateReport: reports.handleGenerateReport,
      showReport,
      reportSummary,
      reportText,
      handleCopyReport: reports.handleCopyReport,
      handleSendWhatsApp: reports.handleSendWhatsApp,
      generatePDFReport: reports.generatePDFReport,
      setShowReport,
      setReportSummary,
      entryShareText,
      handleCopyEntryShare: reports.handleCopyEntryShare,
      handleSendEntryWhatsApp: reports.handleSendEntryWhatsApp,
      setEntryShareText,
      showAddModal,
      closeAddModal: transactions.closeAddModal,
      addingTransaction,
      handleAddTransaction: transactions.handleAddTransaction,
      newTransaction,
      setNewTransaction,
      handleClearAttachment: transactions.handleClearAttachment,
      fileInputRef,
      handleFileUpload: transactions.handleFileUpload,
      uploading,
      addModalTitle,
      addModalActionLabel,
      showInvoiceModal,
      selectedTransaction,
      setShowInvoiceModal,
      printInvoice: transactions.printInvoice,
    },
  };
};

export default useCreditHistoryController;

