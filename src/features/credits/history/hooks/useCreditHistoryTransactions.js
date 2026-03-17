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
  getTypeLabel,
  formatCurrency,
  isMobile,
  selectedTransaction,
}) => {
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
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

  const handleAddTransaction = async (event) => {
    event.preventDefault();
    if (addingTransaction || addTransactionLockRef.current) return;
    addTransactionLockRef.current = true;
    setError('');
    setSuccess('');

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

      await creditApi.addTransaction(effectiveUserId, {
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
        thankYouLine: 'à¦†à¦ªà§‹à¦¨à¦¾à§° à¦ªà§°à¦¿à¦¶à§‹à¦§ à¦†à§°à§ à¦¬à¦¿à¦¶à§à¦¬à¦¾à¦¸à§° à¦¬à¦¾à¦¬à§‡ à¦§à¦¨à§à¦¯à¦¬à¦¾à¦¦à¥¤'
      });
      setEntryShareText(manualShare);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
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
          <div class="total"><span>Updated Balance</span><strong>${escapeHtml(formatCurrency(balanceNow))}</strong></div>
        </div>
        <div class="credit-reference"><strong>Reference:</strong> ${escapeHtml(transaction?.reference || '-')}</div>
      </div>
    `;
  };

  const printInvoice = () => {
    if (!selectedTransaction) return;
    const html = buildCreditInvoiceHtml(selectedTransaction);
    printHtmlDocument({
      title: `Invoice ${selectedTransaction?.invoice_number || ''}`,
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
    handlePrintInvoice,
    printInvoice,
  };
};

export default useCreditHistoryTransactions;
