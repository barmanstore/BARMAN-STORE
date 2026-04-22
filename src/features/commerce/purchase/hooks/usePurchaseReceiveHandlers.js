import { useCallback } from 'react';
import { DOMAINS, invalidateDomain } from '../../../../shared/services/invalidation';
import formatApiError from '../../../../shared/utils/formatApiError';

const usePurchaseReceiveHandlers = ({
  receiveData,
  setReceiveData,
  selectedOrder,
  setSelectedOrder,
  setShowReceiveModal,
  setReceiveSubmitting,
  receiveSubmitLockRef,
  purchaseOrdersApi,
  user,
  fetchOrders,
  setError,
  toNumber,
}) => {
  const handleReceiveClick = useCallback(
    (order) => {
      setSelectedOrder(order);
      setReceiveData({
        invoice_number: '',
        items:
          order.items?.map((item) => ({
            item_id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            ordered_quantity: item.quantity,
            received_quantity: item.quantity - (item.received_quantity || 0),
            unit_price: item.unit_price,
          })) || [],
      });
      setShowReceiveModal(true);
    },
    [setSelectedOrder, setReceiveData, setShowReceiveModal]
  );

  const handleReceiveItemChange = useCallback(
    (index, field, value) => {
      const items = [...receiveData.items];
      items[index][field] = value;
      setReceiveData((prev) => ({ ...prev, items }));
    },
    [receiveData.items, setReceiveData]
  );

  const handleReceiveQtyStep = useCallback(
    (index, delta) => {
      const item = receiveData.items[index];
      if (!item) return;
      const currentQty = toNumber(item.received_quantity);
      const nextQty = Math.max(0, Math.min(toNumber(item.ordered_quantity), currentQty + delta));
      handleReceiveItemChange(index, 'received_quantity', nextQty);
    },
    [receiveData.items, toNumber, handleReceiveItemChange]
  );

  const handleReceiveSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (receiveSubmitLockRef.current) return;
      receiveSubmitLockRef.current = true;
      setError('');
      setReceiveSubmitting(true);

      try {
        const validItems = receiveData.items.filter((item) => item.received_quantity > 0);
        if (validItems.length === 0) {
          receiveSubmitLockRef.current = false;
          setReceiveSubmitting(false);
          setError('Please receive at least one item');
          return;
        }

        await purchaseOrdersApi.receive(selectedOrder.id, {
          invoice_number: receiveData.invoice_number,
          items: validItems,
          received_by: user?.id,
        });

        setShowReceiveModal(false);
        setSelectedOrder(null);
        setReceiveData({ invoice_number: '', items: [] });
        fetchOrders();
        await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
        await invalidateDomain(DOMAINS.Products, { sourceId: 'purchase-orders' });
        await invalidateDomain(DOMAINS.Stock, { sourceId: 'purchase-orders' });
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        receiveSubmitLockRef.current = false;
        setReceiveSubmitting(false);
      }
    },
    [
      receiveData,
      purchaseOrdersApi,
      selectedOrder,
      user,
      fetchOrders,
      setShowReceiveModal,
      setSelectedOrder,
      setReceiveData,
      setError,
      setReceiveSubmitting,
      receiveSubmitLockRef,
    ]
  );

  return {
    handleReceiveClick,
    handleReceiveItemChange,
    handleReceiveQtyStep,
    handleReceiveSubmit,
  };
};

export default usePurchaseReceiveHandlers;
