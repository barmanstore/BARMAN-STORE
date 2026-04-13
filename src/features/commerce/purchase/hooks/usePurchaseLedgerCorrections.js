import { useCallback } from 'react';
import { DOMAINS, invalidateDomain } from '../../../../shared/services/invalidation';
import { getSignedLedgerAmount } from '../../../../shared/utils/ledger';
import { validateAmountInput } from '../../../../shared/utils/amountExpression';

const usePurchaseLedgerCorrections = ({
  distributorLedgerApi,
  calculateOrderBalanceAmount,
  toNumber,
  normalizeTextKey,
  getDefaultPoCorrectionFormData,
  getDefaultLedgerFormData,
  setShowPoCorrectionForm,
  setSelectedCorrectionOrder,
  setPoCorrectionFormData,
  setPoCorrectionContext,
  setPoCorrectionSubmitting,
  poCorrectionLockRef,
  selectedCorrectionOrder,
  poCorrectionSubmitting,
  poCorrectionFormData,
  setError,
  fetchDistributorLedger,
  user,
  setShowLedgerForm,
  setLedgerFormData,
  setLedgerSubmitting,
  ledgerSubmitLockRef,
  ledgerSubmitting,
  ledgerFormData,
  addLocalLedgerEntry,
  localLedgerKey,
  filters,
}) => {
  const getLedgerRowsFromResponse = useCallback((response) => {
    if (Array.isArray(response)) return response;
    return response?.rows || response?.data || response?.transactions || [];
  }, []);

  const getPoLinkedLedgerRows = useCallback((rows, order) => {
    if (!order) return [];

    const orderId = String(order.id || '').trim();
    const poNumberKey = normalizeTextKey(order.po_number);

    return (rows || []).filter((entry) => {
      const source = normalizeTextKey(entry?.source);
      const sourceId = entry?.source_id ?? entry?.sourceId;
      if (
        (source === 'purchase_order' || source === 'po_correction')
        && sourceId !== undefined
        && sourceId !== null
        && String(sourceId).trim() === orderId
      ) {
        return true;
      }

      const referenceKey = normalizeTextKey(entry?.reference || entry?.po_number);
      if (!poNumberKey || !referenceKey || referenceKey !== poNumberKey) return false;
      const descriptionKey = normalizeTextKey(entry?.description);
      return (
        descriptionKey.includes('purchase order')
        || descriptionKey.includes('po correction')
        || descriptionKey.includes('ledger correction')
      );
    });
  }, [normalizeTextKey]);

  const getPoLedgerImpact = useCallback((rows, order) => (
    getPoLinkedLedgerRows(rows, order).reduce((sum, entry) => sum + getSignedLedgerAmount(entry), 0)
  ), [getPoLinkedLedgerRows]);

  const closePoCorrectionForm = useCallback(() => {
    setShowPoCorrectionForm(false);
    setSelectedCorrectionOrder(null);
    setPoCorrectionFormData(getDefaultPoCorrectionFormData());
    setPoCorrectionContext({
      expectedAmount: 0,
      currentImpact: 0,
      delta: 0,
      linkedEntries: 0,
    });
    setPoCorrectionSubmitting(false);
    poCorrectionLockRef.current = false;
  }, [
    setShowPoCorrectionForm,
    setSelectedCorrectionOrder,
    setPoCorrectionFormData,
    getDefaultPoCorrectionFormData,
    setPoCorrectionContext,
    setPoCorrectionSubmitting,
    poCorrectionLockRef,
  ]);

  const handleOpenPoCorrectionForm = useCallback(async (order) => {
    if (!order || !order.distributor_id) {
      setError('Cannot open correction form. Invalid purchase order/distributor.');
      return;
    }

    try {
      setError('');
      setPoCorrectionSubmitting(true);
      poCorrectionLockRef.current = false;

      const response = await distributorLedgerApi.getByDistributor(order.distributor_id, { limit: 500 });
      const rows = getLedgerRowsFromResponse(response);
      const linkedRows = getPoLinkedLedgerRows(rows, order);
      const expectedAmount = calculateOrderBalanceAmount(order);
      const currentImpact = getPoLedgerImpact(rows, order);
      const delta = Number((expectedAmount - currentImpact).toFixed(2));
      const suggestedType = delta < 0 ? 'payment' : 'credit';
      const suggestedAmount = Math.abs(delta);

      setSelectedCorrectionOrder(order);
      setPoCorrectionContext({
        expectedAmount,
        currentImpact,
        delta,
        linkedEntries: linkedRows.length,
      });
      setPoCorrectionFormData({
        ...getDefaultPoCorrectionFormData(),
        type: suggestedType,
        amount: suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '',
        reference: order.po_number || '',
      });
      setShowPoCorrectionForm(true);
    } catch (err) {
      setError(err?.message || 'Failed to load PO ledger impact for correction');
    } finally {
      setPoCorrectionSubmitting(false);
    }
  }, [
    distributorLedgerApi,
    calculateOrderBalanceAmount,
    getLedgerRowsFromResponse,
    getPoLinkedLedgerRows,
    getPoLedgerImpact,
    getDefaultPoCorrectionFormData,
    setError,
    setPoCorrectionSubmitting,
    poCorrectionLockRef,
    setSelectedCorrectionOrder,
    setPoCorrectionContext,
    setPoCorrectionFormData,
    setShowPoCorrectionForm,
  ]);

  const handlePoCorrectionSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedCorrectionOrder) return;
    if (poCorrectionSubmitting || poCorrectionLockRef.current) return;
    poCorrectionLockRef.current = true;

    const amountResult = validateAmountInput(poCorrectionFormData.amount, { min: 0 });
    const amount = amountResult.valid ? Number(amountResult.value) : 0;
    const reason = String(poCorrectionFormData.reason || '').trim();
    if (!amountResult.valid || amount <= 0) {
      poCorrectionLockRef.current = false;
      setError(amountResult.message || 'Correction amount must be greater than 0');
      return;
    }
    if (!reason) {
      poCorrectionLockRef.current = false;
      setError('Correction reason is required');
      return;
    }

    try {
      setError('');
      setPoCorrectionSubmitting(true);

      await distributorLedgerApi.addTransaction(selectedCorrectionOrder.distributor_id, {
        type: poCorrectionFormData.type,
        transaction_type: poCorrectionFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: poCorrectionFormData.payment_mode,
        reference: poCorrectionFormData.reference || selectedCorrectionOrder.po_number || '',
        description: `PO correction for ${selectedCorrectionOrder.po_number || selectedCorrectionOrder.id}: ${reason}`,
        transactionDate: poCorrectionFormData.transaction_date,
        source: 'po_correction',
        source_id: selectedCorrectionOrder.id,
        mode: 'manual',
        created_by: user?.id,
      });

      closePoCorrectionForm();
      fetchDistributorLedger();
      await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
      await invalidateDomain(DOMAINS.Ledger, { sourceId: 'purchase-orders' });
    } catch (err) {
      setError(err?.message || 'Failed to post PO correction');
    } finally {
      setPoCorrectionSubmitting(false);
      poCorrectionLockRef.current = false;
    }
  }, [
    selectedCorrectionOrder,
    poCorrectionSubmitting,
    poCorrectionLockRef,
    poCorrectionFormData,
    toNumber,
    setError,
    setPoCorrectionSubmitting,
    distributorLedgerApi,
    user,
    closePoCorrectionForm,
    fetchDistributorLedger,
  ]);

  const handleOpenLedgerForm = useCallback(() => {
    setLedgerFormData({
      ...getDefaultLedgerFormData(),
      distributor_id: filters.distributor_id || '',
    });
    setLedgerSubmitting(false);
    ledgerSubmitLockRef.current = false;
    setShowLedgerForm(true);
  }, [
    setLedgerFormData,
    getDefaultLedgerFormData,
    filters.distributor_id,
    setLedgerSubmitting,
    ledgerSubmitLockRef,
    setShowLedgerForm,
  ]);

  const closeLedgerForm = useCallback(() => {
    setShowLedgerForm(false);
    setLedgerFormData(getDefaultLedgerFormData());
    setLedgerSubmitting(false);
    ledgerSubmitLockRef.current = false;
  }, [
    setShowLedgerForm,
    setLedgerFormData,
    getDefaultLedgerFormData,
    setLedgerSubmitting,
    ledgerSubmitLockRef,
  ]);

  const handleLedgerSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (ledgerSubmitting || ledgerSubmitLockRef.current) return;
    ledgerSubmitLockRef.current = true;
    setError('');

    const amountResult = validateAmountInput(ledgerFormData.amount);
    const amount = amountResult.valid ? Number(amountResult.value) : 0;
    if (!ledgerFormData.distributor_id) {
      ledgerSubmitLockRef.current = false;
      setError('Please select a distributor for ledger entry');
      return;
    }
    if (!amountResult.valid || amount <= 0) {
      ledgerSubmitLockRef.current = false;
      setError(amountResult.message || 'Please enter a valid amount');
      return;
    }

    try {
      setLedgerSubmitting(true);
      await distributorLedgerApi.addTransaction(ledgerFormData.distributor_id, {
        type: ledgerFormData.type,
        transaction_type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: ledgerFormData.payment_mode,
        reference: ledgerFormData.reference,
        description: ledgerFormData.description || `Manual ${ledgerFormData.type} entry`,
        transactionDate: ledgerFormData.transaction_date,
        mode: 'manual',
        created_by: user?.id,
      });

      closeLedgerForm();
      fetchDistributorLedger();
      await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
      await invalidateDomain(DOMAINS.Ledger, { sourceId: 'purchase-orders' });
    } catch (err) {
      const localEntry = {
        id: `local-${Date.now()}`,
        distributor_id: ledgerFormData.distributor_id,
        type: ledgerFormData.type,
        transaction_type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: ledgerFormData.payment_mode,
        reference: ledgerFormData.reference,
        description: ledgerFormData.description || `Manual ${ledgerFormData.type} entry`,
        transaction_date: ledgerFormData.transaction_date,
        created_at: new Date().toISOString(),
        mode: 'manual',
      };
      addLocalLedgerEntry(localLedgerKey, localEntry);
      closeLedgerForm();
      fetchDistributorLedger();
      await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
      await invalidateDomain(DOMAINS.Ledger, { sourceId: 'purchase-orders' });
    } finally {
      setLedgerSubmitting(false);
      ledgerSubmitLockRef.current = false;
    }
  }, [
    ledgerSubmitting,
    ledgerSubmitLockRef,
    toNumber,
    ledgerFormData,
    setError,
    setLedgerSubmitting,
    distributorLedgerApi,
    user,
    closeLedgerForm,
    fetchDistributorLedger,
    addLocalLedgerEntry,
    localLedgerKey,
  ]);

  return {
    getLedgerRowsFromResponse,
    getPoLinkedLedgerRows,
    getPoLedgerImpact,
    closePoCorrectionForm,
    handleOpenPoCorrectionForm,
    handlePoCorrectionSubmit,
    handleOpenLedgerForm,
    closeLedgerForm,
    handleLedgerSubmit,
  };
};

export default usePurchaseLedgerCorrections;

