import { validateAmountInput } from '../../../../shared/utils/amountExpression';
import { readFileAsDataUrl } from '../../../../shared/utils/readFileAsDataUrl';
import {
  getCreditBalanceMeta,
  getCreditEntryDescription,
  getCreditEntrySourceLabel,
  getCreditEntryTypeLabel,
  getCreditPreviousBalance,
} from '../utils/creditLedgerPresentation';

const useCreditHistoryTransactions = ({
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
  buildManualEntryText,
  fetchCreditData,
  printHtmlDocument,
  escapeHtml,
  info,
  formatTransactionDate,
  customer,
  formatCurrency,
  isMobile,
  selectedTransaction,
}) => {
  const resetAttachmentInput = () => {
    if (fileInputRef?.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetTransactionDraft = (type = 'payment') => {
    setNewTransaction(createNewTransactionDraft(getTodayDateInputValue, type));
    resetAttachmentInput();
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setNewTransaction((prev) => ({
        ...prev,
        imageBase64: '',
        attachmentName: '',
      }));
      return;
    }

    setUploading(true);
    setError('');

    try {
      const imageBase64 = await readFileAsDataUrl(file);
      setNewTransaction((prev) => ({
        ...prev,
        imageBase64,
        attachmentName: String(file.name || '').trim(),
      }));
    } catch (_) {
      setError('Failed to read file');
    } finally {
      setUploading(false);
    }
  };

  const handleClearAttachment = () => {
    setNewTransaction((prev) => ({
      ...prev,
      imageBase64: '',
      attachmentName: '',
    }));
    resetAttachmentInput();
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setUploading(false);
    resetTransactionDraft();
    addTransactionLockRef.current = false;
    addTransactionRequestIdRef.current = '';
  };

  const openAddModalWithType = (type = 'payment') => {
    setError('');
    setSuccess('');
    setUploading(false);
    resetTransactionDraft(type);
    addTransactionLockRef.current = false;
    addTransactionRequestIdRef.current = createClientRequestId('credit');
    setShowAddModal(true);
  };

  const handleAddTransaction = async (event) => {
    event.preventDefault();
    if (addingTransaction || addTransactionLockRef.current) return;
    addTransactionLockRef.current = true;
    setError('');
    setSuccess('');

    const amountResult = validateAmountInput(newTransaction.amount);
    const amount = amountResult.valid ? Number(amountResult.value) : 0;

    if (!amountResult.valid || amount <= 0) {
      addTransactionLockRef.current = false;
      setError(amountResult.message || 'Please enter a valid amount');
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
        amount,
        description: String(newTransaction.description || '').trim(),
        reference: String(newTransaction.reference || '').trim(),
        transactionDate: newTransaction.transactionDate || getTodayDateInputValue(),
      };

      const clientRequestId = addTransactionRequestIdRef.current || createClientRequestId('credit');
      addTransactionRequestIdRef.current = clientRequestId;

      await creditApi.addTransaction(effectiveUserId, {
        amount,
        type: txSnapshot.type,
        description: txSnapshot.description,
        reference: txSnapshot.reference,
        transactionDate: txSnapshot.transactionDate,
        image_base64: String(newTransaction.imageBase64 || '').trim() || undefined,
        created_by: authUser?.id,
        client_request_id: clientRequestId,
      });
      setSuccess('Ledger entry added successfully');
      setEntryShareText('');
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
        thankYouLine: 'Thank you.',
      });
      setEntryShareText(manualShare);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        return;
      }
      setError(err.message || 'Failed to add ledger entry');
    } finally {
      setAddingTransaction(false);
      addTransactionLockRef.current = false;
    }
  };

  const handleDeleteTransaction = async (transaction) => {
    if (!isAdminView) return;
    const entryId = Number(transaction?.id || 0);
    if (!entryId || !effectiveUserId) return;
    if (!window.confirm(`Create a reversal for ledger entry #${entryId}? This keeps history intact and recalculates the running balance.`)) return;
    try {
      setDeletingEntryId(entryId);
      setError('');
      setSuccess('');
      await creditApi.deleteTransaction(effectiveUserId, entryId);
      await fetchCreditData(effectiveUserId);
      setSuccess('Reversal entry added.');
    } catch (err) {
      setError(err.message || 'Failed to reverse ledger entry');
    } finally {
      setDeletingEntryId(0);
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
    const previousBalance = getCreditPreviousBalance(transaction);
    const balanceMeta = getCreditBalanceMeta(balanceNow);
    const sourceLabel = getCreditEntrySourceLabel(transaction);
    const entryTypeLabel = getCreditEntryTypeLabel(transaction);
    const description = getCreditEntryDescription(transaction);

    return `
      <div class="credit-invoice">
        <div class="credit-invoice-header">
          <div>
            <h1>LEDGER ENTRY</h1>
            <div class="meta">${escapeHtml(info.TITLE || 'BARMAN STORE')}</div>
          </div>
          <div class="meta-right">
            <div><strong>Entry #:</strong> ${escapeHtml(transaction?.id || '-')}</div>
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
              <th>Source</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(sourceLabel)}</td>
              <td>${escapeHtml(entryTypeLabel)}</td>
              <td>${escapeHtml(formatCurrency(amount))}</td>
              <td>${escapeHtml(description)}</td>
            </tr>
          </tbody>
        </table>
        <div class="credit-summary">
          <div><span>Previous Balance</span><strong>${escapeHtml(formatCurrency(Math.abs(previousBalance)))}</strong></div>
          <div><span>Movement</span><strong>${escapeHtml(formatCurrency(amount))}</strong></div>
          <div class="total"><span>${escapeHtml(balanceMeta.label)} Balance</span><strong>${escapeHtml(formatCurrency(Math.abs(balanceNow)))}</strong></div>
        </div>
        <div class="credit-reference"><strong>Reference:</strong> ${escapeHtml(sourceLabel)}</div>
      </div>
    `;
  };

  const printInvoice = () => {
    if (!selectedTransaction) return;
    const html = buildCreditInvoiceHtml(selectedTransaction);
    const sourceLabel = getCreditEntrySourceLabel(selectedTransaction);
    printHtmlDocument({
      title: `Ledger Entry ${sourceLabel !== '-' ? sourceLabel : selectedTransaction?.id || ''}`.trim(),
      bodyHtml: html,
      cssText: `
        .credit-invoice { max-width: 780px; margin: 0 auto; font-family: 'Arial', sans-serif; }
        .credit-invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
        .credit-invoice-header h1 { margin: 0 0 8px; }
        .meta { font-size: 13px; color: #555; }
        .meta-right { font-size: 13px; color: #444; text-align: right; }
        .credit-party { margin: 12px 0; font-size: 13px; }
        .credit-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .credit-table th, .credit-table td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
        .credit-table thead th { background: #f3f4f6; }
        .credit-summary { width: 320px; margin-top: 14px; margin-left: auto; }
        .credit-summary div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
        .credit-summary .total { font-weight: 700; border-bottom: none; font-size: 14px; }
        .credit-reference { margin-top: 12px; font-size: 12px; }
      `,
      onError: (message) => setError(message),
    });
  };

  return {
    handleFileUpload,
    handleAddTransaction,
    handleDeleteTransaction,
    closeAddModal,
    openAddModalWithType,
    handleClearAttachment,
    handlePrintInvoice,
    printInvoice,
  };
};

export default useCreditHistoryTransactions;
