import { useCallback } from 'react';
import { validateAmountInput } from '../../../../shared/utils/amountExpression';

const usePurchasePaymentHandlers = ({
  purchaseOrders,
  getPoBalanceDue,
  getDefaultPoPaymentFormData,
  setPoPaymentFormData,
  setPaymentOrder,
  setShowPoPaymentModal,
  setPoPaymentSubmitting,
  poPaymentSubmitting,
  poPaymentLockRef,
  poPaymentClientRequestIdRef,
  purchaseOrdersApi,
  createClientRequestId,
  getTodayDate,
  toNumber,
  user,
  paymentOrder,
  poPaymentFormData,
  fetchOrders,
  fetchOperationsSummary,
  fetchDistributorLedger,
  setError,
}) => {
  const resolveLatestPaymentOrder = useCallback(async (order) => {
    if (!order?.id || typeof purchaseOrdersApi?.getById !== 'function') return order;
    try {
      const latest = await purchaseOrdersApi.getById(order.id);
      if (latest && Number(latest.id || 0) === Number(order.id || 0)) return latest;
    } catch (_) {
      // ignore fetch failures and fall back to the provided order
    }
    return order;
  }, [purchaseOrdersApi]);

  const handleOpenPoPaymentModal = useCallback((order) => {
    if (!order) return;
    const openModal = async () => {
      const resolvedOrder = await resolveLatestPaymentOrder(order);
      const balanceDue = getPoBalanceDue(resolvedOrder);
      setError('');
      setPaymentOrder(resolvedOrder);
      setPoPaymentFormData({
        ...getDefaultPoPaymentFormData(),
        amount: balanceDue > 0 ? balanceDue.toFixed(2) : '',
        reference: String(resolvedOrder.bill_number || resolvedOrder.invoice_number || resolvedOrder.po_number || '').trim(),
        transaction_date: getTodayDate(),
        notes: '',
      });
      poPaymentLockRef.current = false;
      poPaymentClientRequestIdRef.current = createClientRequestId('popay');
      setShowPoPaymentModal(true);
    };
    void openModal();
  }, [
    resolveLatestPaymentOrder,
    getPoBalanceDue,
    getDefaultPoPaymentFormData,
    setError,
    setPaymentOrder,
    setPoPaymentFormData,
    getTodayDate,
    poPaymentLockRef,
    poPaymentClientRequestIdRef,
    createClientRequestId,
    setShowPoPaymentModal,
  ]);

  const handleOpenPoPaymentById = useCallback((orderId) => {
    const order = (purchaseOrders || []).find((row) => Number(row.id) === Number(orderId));
    if (order) handleOpenPoPaymentModal(order);
  }, [purchaseOrders, handleOpenPoPaymentModal]);

  const closePoPaymentModal = useCallback(() => {
    setShowPoPaymentModal(false);
    setPaymentOrder(null);
    setPoPaymentFormData(getDefaultPoPaymentFormData());
    setPoPaymentSubmitting(false);
    poPaymentLockRef.current = false;
    poPaymentClientRequestIdRef.current = '';
  }, [
    setShowPoPaymentModal,
    setPaymentOrder,
    setPoPaymentFormData,
    getDefaultPoPaymentFormData,
    setPoPaymentSubmitting,
    poPaymentLockRef,
    poPaymentClientRequestIdRef,
  ]);

  const handlePoPaymentSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!paymentOrder) return;
    if (poPaymentSubmitting || poPaymentLockRef.current) return;
    poPaymentLockRef.current = true;
    const resolvedOrder = await resolveLatestPaymentOrder(paymentOrder);
    if (resolvedOrder && resolvedOrder !== paymentOrder) {
      setPaymentOrder(resolvedOrder);
    }
    const balanceDue = getPoBalanceDue(resolvedOrder);
    const amountResult = validateAmountInput(poPaymentFormData.amount, { max: balanceDue });
    const amount = amountResult.valid ? Math.max(0, Number(amountResult.value)) : 0;
    if (!amountResult.valid || amount <= 0) {
      poPaymentLockRef.current = false;
      setError(amountResult.message || 'Payment amount must be greater than 0');
      return;
    }
    if (amount > balanceDue) {
      poPaymentLockRef.current = false;
      setError(`Payment amount cannot exceed current balance due (${balanceDue.toFixed(2)})`);
      return;
    }

    try {
      setError('');
      setPoPaymentSubmitting(true);
      const clientRequestId = poPaymentClientRequestIdRef.current || createClientRequestId('popay');
      poPaymentClientRequestIdRef.current = clientRequestId;
      await purchaseOrdersApi.addPayment(paymentOrder.id, {
        amount: Number(amount.toFixed(2)),
        payment_mode: poPaymentFormData.payment_mode,
        reference: poPaymentFormData.reference,
        transaction_date: poPaymentFormData.transaction_date || getTodayDate(),
        notes: poPaymentFormData.notes,
        created_by: user?.id,
        client_request_id: clientRequestId,
      });
      closePoPaymentModal();
      await Promise.all([
        fetchOrders(),
        typeof fetchOperationsSummary === 'function' ? fetchOperationsSummary() : Promise.resolve(),
        fetchDistributorLedger(),
      ]);
    } catch (err) {
      setError(err?.message || 'Failed to add PO payment');
      setPoPaymentSubmitting(false);
      poPaymentLockRef.current = false;
    }
  }, [
    poPaymentSubmitting,
    poPaymentLockRef,
    toNumber,
    getPoBalanceDue,
    setError,
    setPoPaymentSubmitting,
    poPaymentClientRequestIdRef,
    createClientRequestId,
    purchaseOrdersApi,
    getTodayDate,
    user,
    paymentOrder,
    poPaymentFormData,
    closePoPaymentModal,
    fetchOrders,
    fetchOperationsSummary,
    fetchDistributorLedger,
    resolveLatestPaymentOrder,
    setPaymentOrder,
  ]);

  return {
    handleOpenPoPaymentModal,
    handleOpenPoPaymentById,
    closePoPaymentModal,
    handlePoPaymentSubmit,
  };
};

export default usePurchasePaymentHandlers;
