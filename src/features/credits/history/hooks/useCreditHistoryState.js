import { useRef, useState } from 'react';

export const getCreditTransactionDefaultDescription = (type = 'payment') =>
  type === 'given' ? 'Manual sale' : 'Payment received';

const createNewTransactionDraft = (getTodayDateInputValue, type = 'payment') => ({
  editEntryId: 0,
  type: type === 'given' ? 'given' : 'payment',
  amount: '',
  description: getCreditTransactionDefaultDescription(type),
  reference: '',
  transactionDate: getTodayDateInputValue(),
  imageBase64: '',
  imagePath: '',
  attachmentName: '',
});

const useCreditHistoryState = ({ user, userId, searchParams, getTodayDateInputValue }) => {
  const authUser = user || null;
  const isAdminView = authUser?.role === 'admin';
  const effectiveUserId = isAdminView ? userId : authUser?.id || userId;

  const [creditHistory, setCreditHistory] = useState([]);
  const [historyCursor, setHistoryCursor] = useState('');
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyLoadingFull, setHistoryLoadingFull] = useState(false);
  const [balance, setBalance] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [addingTransaction, setAddingTransaction] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTransaction, setNewTransaction] = useState(() =>
    createNewTransactionDraft(getTodayDateInputValue)
  );
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

  const [fromDate, setFromDate] = useState(getTodayDateInputValue());
  const [toDate, setToDate] = useState(getTodayDateInputValue());
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);
  const [entryShareText, setEntryShareText] = useState('');
  const [quickTypeFilter, setQuickTypeFilter] = useState('all');
  const [quickRangeFilter, setQuickRangeFilter] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({
    transaction_type: '',
    start_date: '',
    end_date: '',
  });
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

  const addTransactionLockRef = useRef(false);
  const addTransactionRequestIdRef = useRef('');

  return {
    authUser,
    isAdminView,
    effectiveUserId,
    creditHistory,
    setCreditHistory,
    historyCursor,
    setHistoryCursor,
    historyHasMore,
    setHistoryHasMore,
    historyLoadingMore,
    setHistoryLoadingMore,
    historyLoadingFull,
    setHistoryLoadingFull,
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
    showAdvancedFilters,
    setShowAdvancedFilters,
    filters,
    setFilters,
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
  };
};

export default useCreditHistoryState;
