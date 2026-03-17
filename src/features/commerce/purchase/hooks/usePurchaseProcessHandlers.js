import { useCallback } from 'react';

const usePurchaseProcessHandlers = ({
  getDefaultProcessFormData,
  setProcessingOrder,
  setProcessFormData,
  setShowProcessModal,
  setProcessSubmitting,
  processSubmitLockRef,
  handleUpdateStatus,
  getTodayDate,
  toNumber,
  getOrderDisplayTotal,
  user,
  processingOrder,
  processFormData,
  setError,
}) => {
  const handleOpenProcessModal = useCallback((order) => {
    if (!order) return;
    setError('');
    setProcessingOrder(order);
    setProcessFormData({
      ...getDefaultProcessFormData(),
      bill_number: String(order.bill_number || order.invoice_number || '').trim(),
      paid_amount: '',
      payment_reference: String(order.bill_number || order.invoice_number || '').trim(),
      payment_date: getTodayDate(),
      payment_notes: '',
    });
    setShowProcessModal(true);
  }, [
    setError,
    setProcessingOrder,
    setProcessFormData,
    getDefaultProcessFormData,
    getTodayDate,
    setShowProcessModal,
  ]);

  const closeProcessModal = useCallback(() => {
    setShowProcessModal(false);
    setProcessingOrder(null);
    setProcessFormData(getDefaultProcessFormData());
    setProcessSubmitting(false);
    processSubmitLockRef.current = false;
  }, [
    setShowProcessModal,
    setProcessingOrder,
    setProcessFormData,
    getDefaultProcessFormData,
    setProcessSubmitting,
    processSubmitLockRef,
  ]);

  const handleProcessSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!processingOrder) return;
    if (processSubmitLockRef.current) return;
    processSubmitLockRef.current = true;
    const billNumber = String(processFormData.bill_number || '').trim();
    if (!billNumber) {
      processSubmitLockRef.current = false;
      setError('Bill number is required to process PO');
      return;
    }
    const paidAmount = Math.max(0, toNumber(processFormData.paid_amount));
    const poTotal = Math.max(0, getOrderDisplayTotal(processingOrder));
    if (paidAmount > poTotal) {
      processSubmitLockRef.current = false;
      setError('Initial paid amount cannot exceed PO total');
      return;
    }

    try {
      setError('');
      setProcessSubmitting(true);
      await handleUpdateStatus(processingOrder.id, 'processed', {
        bill_number: billNumber,
        paid_amount: Number(paidAmount.toFixed(2)),
        payment_mode: processFormData.payment_mode,
        payment_reference: processFormData.payment_reference || billNumber,
        payment_date: processFormData.payment_date || getTodayDate(),
        payment_notes: processFormData.payment_notes,
        updated_by: user?.id,
      });
      closeProcessModal();
    } catch (err) {
      setError(err?.message || 'Failed to process purchase order');
      setProcessSubmitting(false);
    } finally {
      processSubmitLockRef.current = false;
    }
  }, [
    processingOrder,
    processSubmitLockRef,
    processFormData,
    toNumber,
    getOrderDisplayTotal,
    handleUpdateStatus,
    getTodayDate,
    user,
    setError,
    setProcessSubmitting,
    closeProcessModal,
  ]);

  return {
    handleOpenProcessModal,
    closeProcessModal,
    handleProcessSubmit,
  };
};

export default usePurchaseProcessHandlers;
