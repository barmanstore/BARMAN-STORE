import { validateAmountInput } from '../../../../shared/utils/amountExpression';

const useCreditKhataLedgerForm = ({
  getDefaultFormData,
  setShowLedgerForm,
  setEditingLedgerEntryId,
  setLedgerFormData,
  setLedgerSubmitting,
  ledgerSubmitLockRef,
  ledgerRequestIdRef,
  setError,
  ledgerSubmitting,
  ledgerFormData,
  editingLedgerEntryId,
  user,
  creditApi,
  createClientRequestId,
  fetchLedger,
  filters,
  users,
}) => {
  const handleOpenLedgerForm = () => {
    setEditingLedgerEntryId(null);
    setLedgerFormData(getDefaultFormData());
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
    setShowLedgerForm(true);
  };

  const handleOpenLedgerEdit = (entry) => {
    if (!entry) return;
    setEditingLedgerEntryId(entry.id);
    setLedgerFormData({
      user_id: entry.user_id || '',
      type: entry.type || 'payment',
      amount: String(entry.amount || ''),
      transactionDate: entry.transaction_date || entry.transaction_ts || entry.created_at || '',
      reference: entry.reference || '',
      description: entry.description || ''
    });
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
    setShowLedgerForm(true);
  };

  const closeLedgerForm = () => {
    setShowLedgerForm(false);
    setEditingLedgerEntryId(null);
    setLedgerFormData(getDefaultFormData());
    setLedgerSubmitting(false);
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    if (ledgerSubmitting || ledgerSubmitLockRef.current) return;
    ledgerSubmitLockRef.current = true;
    setError('');

    const amountResult = validateAmountInput(ledgerFormData.amount);
    const amount = amountResult.valid ? Number(amountResult.value) : 0;
    if (!ledgerFormData.user_id) {
      ledgerSubmitLockRef.current = false;
      setError('Please select a customer');
      return;
    }
    if (!amountResult.valid || amount <= 0) {
      ledgerSubmitLockRef.current = false;
      setError(amountResult.message || 'Please enter a valid amount');
      return;
    }
    if (!ledgerFormData.description.trim()) {
      ledgerSubmitLockRef.current = false;
      setError('Please enter a description');
      return;
    }

    try {
      setLedgerSubmitting(true);
      if (editingLedgerEntryId) {
        await creditApi.updateTransaction(ledgerFormData.user_id, editingLedgerEntryId, {
          type: ledgerFormData.type,
          amount: Number(amount.toFixed(2)),
          reference: ledgerFormData.reference,
          description: ledgerFormData.description,
          transactionDate: ledgerFormData.transactionDate,
          edited_by: user?.id
        });
      } else {
        const clientRequestId = ledgerRequestIdRef.current || createClientRequestId('credit');
        ledgerRequestIdRef.current = clientRequestId;
        await creditApi.addTransaction(ledgerFormData.user_id, {
          type: ledgerFormData.type,
          amount: Number(amount.toFixed(2)),
          reference: ledgerFormData.reference,
          description: ledgerFormData.description,
          transactionDate: ledgerFormData.transactionDate,
          created_by: user?.id,
          client_request_id: clientRequestId
        });
      }
      closeLedgerForm();
      await fetchLedger(filters.user_id, users);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      setError(err.message || (editingLedgerEntryId ? 'Failed to edit ledger transaction' : 'Failed to add ledger transaction'));
    } finally {
      setLedgerSubmitting(false);
      ledgerSubmitLockRef.current = false;
    }
  };

  return {
    handleOpenLedgerForm,
    handleOpenLedgerEdit,
    closeLedgerForm,
    handleLedgerSubmit,
  };
};

export default useCreditKhataLedgerForm;
