import { useCallback } from 'react';

const usePurchaseOrderFormItems = ({
  orderFormData,
  setOrderFormData,
  createEmptyOrderItem,
  activePoProductField,
  setActivePoProductField,
  setError,
  setSuccess,
  setLoadingDistributorItems,
  distributors,
  getDistributorHistoryProducts,
}) => {
  const handleOrderItemAdd = useCallback(() => {
    setOrderFormData((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyOrderItem()],
    }));
  }, [setOrderFormData, createEmptyOrderItem]);

  const handleOrderItemRemove = useCallback((index) => {
    setOrderFormData((prev) => ({
      ...prev,
      items: prev.items.length <= 1
        ? [createEmptyOrderItem()]
        : prev.items.filter((_, i) => i !== index),
    }));
  }, [setOrderFormData, createEmptyOrderItem]);

  const ensureOrderFormItemAtIndex = useCallback((index) => {
    setOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= index) {
        items.push(createEmptyOrderItem());
      }
      return { ...prev, items };
    });
  }, [setOrderFormData, createEmptyOrderItem]);

  const getTargetPoProductField = useCallback(() => {
    const items = Array.isArray(orderFormData.items) ? orderFormData.items : [];
    if (
      activePoProductField?.mode === 'entry'
      && Number.isInteger(activePoProductField?.index)
      && activePoProductField.index >= 0
    ) {
      return activePoProductField;
    }
    const emptyIndex = items.findIndex(
      (item) => !String(item?.product_id || '').trim() && !String(item?.product_query || '').trim()
    );
    if (emptyIndex >= 0) {
      return { mode: 'entry', index: emptyIndex };
    }
    return { mode: 'entry', index: items.length };
  }, [orderFormData.items, activePoProductField]);

  const handleOrderProductFieldFocus = useCallback((index) => {
    setActivePoProductField({ mode: 'entry', index });
  }, [setActivePoProductField]);

  const handleLoadDistributorItems = useCallback(() => {
    const selectedDistributor = distributors.find(
      (entry) => String(entry.id) === String(orderFormData.distributor_id) && entry.status === 'active'
    );
    if (!selectedDistributor) {
      setError('Select a valid distributor before loading items');
      return;
    }

    setError('');
    setLoadingDistributorItems(true);
    try {
      const existingProductIds = new Set(
        (orderFormData.items || [])
          .map((item) => String(item?.product_id || '').trim())
          .filter(Boolean)
      );
      const nextItems = getDistributorHistoryProducts(selectedDistributor.id)
        .filter((item) => !existingProductIds.has(String(item.product_id || '').trim()))
        .slice(0, 10);

      if (!nextItems.length) {
        setSuccess('No more distributor history items are available to load.');
        return;
      }

      setOrderFormData((prev) => ({
        ...prev,
        items: [...(prev.items || []), ...nextItems],
      }));
      setSuccess(`Loaded ${nextItems.length} distributor item${nextItems.length === 1 ? '' : 's'} with recent qty and rate.`);
    } finally {
      setLoadingDistributorItems(false);
    }
  }, [
    distributors,
    orderFormData.distributor_id,
    orderFormData.items,
    getDistributorHistoryProducts,
    setError,
    setSuccess,
    setLoadingDistributorItems,
    setOrderFormData,
  ]);

  return {
    handleOrderItemAdd,
    handleOrderItemRemove,
    ensureOrderFormItemAtIndex,
    getTargetPoProductField,
    handleOrderProductFieldFocus,
    handleLoadDistributorItems,
  };
};

export default usePurchaseOrderFormItems;
