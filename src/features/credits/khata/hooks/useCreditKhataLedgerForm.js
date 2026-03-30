import { validateAmountInput } from '../../../../shared/utils/amountExpression';
import { readFileAsDataUrl } from '../../../../shared/utils/readFileAsDataUrl';

const toDateInputValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.slice(0, 10);
};

const useCreditKhataLedgerForm = ({
  getDefaultFormData,
  setShowLedgerForm,
  setEditingLedgerEntryId,
  setLedgerFormData,
  setLedgerSubmitting,
  setLedgerUploading,
  ledgerSubmitLockRef,
  ledgerRequestIdRef,
  setError,
  ledgerSubmitting,
  ledgerUploading,
  ledgerFormData,
  editingLedgerEntryId,
  user,
  creditApi,
  createClientRequestId,
  fetchLedger,
  filters,
  users,
  ledgerFileInputRef,
  clearUser,
}) => {
  const resetLedgerAttachmentInput = () => {
    if (ledgerFileInputRef?.current) {
      ledgerFileInputRef.current.value = '';
    }
  };

  const handleOpenLedgerForm = (type = 'payment') => {
    setEditingLedgerEntryId(null);
    setLedgerUploading(false);
    setLedgerFormData(getDefaultFormData(filters.user_id, type));
    resetLedgerAttachmentInput();
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
    setShowLedgerForm(true);
  };

  const handleOpenLedgerEdit = (entry) => {
    if (!entry) return;
    setEditingLedgerEntryId(entry.id);
    setLedgerUploading(false);
    setLedgerFormData({
      user_id: entry.user_id || '',
      type: entry.type || 'payment',
      amount: String(entry.amount || ''),
      transactionDate: toDateInputValue(entry.transaction_date || entry.transaction_ts || entry.created_at),
      reference: entry.reference || '',
      description: entry.description || '',
      imageBase64: '',
      imagePath: entry.image_path || '',
      attachmentName: ''
    });
    resetLedgerAttachmentInput();
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
    setShowLedgerForm(true);
  };

  const closeLedgerForm = () => {
    setShowLedgerForm(false);
    setEditingLedgerEntryId(null);
    setLedgerFormData(getDefaultFormData(filters.user_id));
    setLedgerSubmitting(false);
    setLedgerUploading(false);
    resetLedgerAttachmentInput();
    ledgerSubmitLockRef.current = false;
    ledgerRequestIdRef.current = '';
  };

  const handleLedgerFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLedgerFormData((prev) => ({
        ...prev,
        imageBase64: '',
        attachmentName: '',
      }));
      return;
    }

    setLedgerUploading(true);
    setError('');
    try {
      const imageBase64 = await readFileAsDataUrl(file);
      setLedgerFormData((prev) => ({
        ...prev,
        imageBase64,
        attachmentName: String(file.name || '').trim(),
      }));
    } catch (_) {
      setError('Failed to read file');
      resetLedgerAttachmentInput();
    } finally {
      setLedgerUploading(false);
    }
  };

  const handleClearLedgerAttachment = () => {
    setLedgerFormData((prev) => ({
      ...prev,
      imageBase64: '',
      attachmentName: '',
    }));
    resetLedgerAttachmentInput();
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    if (ledgerSubmitting || ledgerUploading || ledgerSubmitLockRef.current) return;
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
      setError('Please enter a note');
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
          image_base64: String(ledgerFormData.imageBase64 || '').trim() || undefined,
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
          image_base64: String(ledgerFormData.imageBase64 || '').trim() || undefined,
          created_by: user?.id,
          client_request_id: clientRequestId
        });
      }
      closeLedgerForm();
      await fetchLedger(filters.user_id, users);
    } catch (err) {
      if (err?.status === 401) {
        if (typeof clearUser === 'function') {
          clearUser();
        }
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
    handleLedgerFileUpload,
    handleClearLedgerAttachment,
    handleLedgerSubmit,
  };
};

export default useCreditKhataLedgerForm;
