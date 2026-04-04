import { useCallback } from 'react';

const hasMeaningfulPoItem = (item = {}) => (
  Number(item?.product_id || 0) > 0
  || String(item?.product_query || '').trim().length > 0
  || String(item?.product_name || '').trim().length > 0
  || Number(item?.quantity || 0) > 1
  || Number(item?.rate ?? item?.unit_price ?? 0) > 0
);

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
    setOrderFormData((prev) => {
      const targetItem = prev.items?.[index];
      const locked = targetItem?.po_item_locked === true
        || targetItem?.po_item_source === 'supplier_default'
        || String(targetItem?.row_source || '').trim().toLowerCase() === 'supplier';
      if (locked) return prev;
      return {
        ...prev,
        items: prev.items.length <= 1
          ? [createEmptyOrderItem()]
          : prev.items.filter((_, i) => i !== index),
      };
    });
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
      setError('Select a valid supplier before loading items');
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
        .filter((item) => !existingProductIds.has(String(item.product_id || '').trim()));

      if (!nextItems.length) {
        setSuccess('No more supplier history items are available to load.');
        return;
      }

      setOrderFormData((prev) => ({
        ...prev,
        items: [...(prev.items || []), ...nextItems],
      }));
      setSuccess(`Loaded ${nextItems.length} supplier item${nextItems.length === 1 ? '' : 's'} with recent qty and rate.`);
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

  const handleApplySupplierHistoryItem = useCallback((suggestedItem, overrides = null) => {
    const productId = String(suggestedItem?.product_id || '').trim();
    if (!productId) return;
    const resolvedOverrides = overrides && typeof overrides === 'object'
      ? overrides
      : { quantity: overrides };
    const resolvedQuantity = Math.max(1, Number(resolvedOverrides?.quantity ?? suggestedItem?.quantity ?? 1) || 1);
    const resolvedUom = String(resolvedOverrides?.uom || suggestedItem?.uom || 'pcs').trim() || 'pcs';
    let nextActiveIndex = 0;

    setOrderFormData((prev) => {
      const currentItems = Array.isArray(prev?.items) ? [...prev.items] : [createEmptyOrderItem()];
      const existingIndex = currentItems.findIndex((item) => String(item?.product_id || '').trim() === productId);
      const nextItem = {
        ...suggestedItem,
        quantity: resolvedQuantity,
        uom: resolvedUom,
        rate_warning_acknowledged: false,
        discount_warning_acknowledged: false,
      };

      if (existingIndex >= 0) {
        currentItems[existingIndex] = {
          ...currentItems[existingIndex],
          ...nextItem,
        };
        nextActiveIndex = existingIndex;
        return {
          ...prev,
          items: currentItems,
        };
      }

      const replaceIndex = currentItems.findIndex((item) => !hasMeaningfulPoItem(item));
      if (replaceIndex >= 0) {
        currentItems[replaceIndex] = nextItem;
        nextActiveIndex = replaceIndex;
      } else {
        currentItems.push(nextItem);
        nextActiveIndex = currentItems.length - 1;
      }

      return {
        ...prev,
        items: currentItems,
      };
    });

    setActivePoProductField({ mode: 'entry', index: nextActiveIndex });
  }, [createEmptyOrderItem, setActivePoProductField, setOrderFormData]);

  return {
    handleOrderItemAdd,
    handleOrderItemRemove,
    ensureOrderFormItemAtIndex,
    getTargetPoProductField,
    handleOrderProductFieldFocus,
    handleLoadDistributorItems,
    handleApplySupplierHistoryItem,
  };
};

export default usePurchaseOrderFormItems;
