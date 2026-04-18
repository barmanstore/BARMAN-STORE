import { useCallback, useMemo } from 'react';
import { getPurchaseDraftDiagnostics } from '../utils/orderDraftValidation';

function useOrderDetailComputed({
  orderDetail,
  orderDetailDraft,
  orderDetailEditMode,
  products,
  findProductForItem,
  calculateOrderItem,
  toNumber,
  formatCurrency,
  normalizeGstRateOption,
  calculateOrderTotals,
  getOrderDisplayTotal,
  toDateInputValue,
}) {
  const orderDetailItems = useMemo(
    () => (orderDetailEditMode ? orderDetailDraft?.items || [] : orderDetail?.items || []),
    [orderDetailEditMode, orderDetailDraft?.items, orderDetail?.items]
  );
  const orderDetailOriginalItems = useMemo(() => orderDetail?.items || [], [orderDetail?.items]);

  const getOrderDetailOriginalItem = useCallback(
    (draftItem, index) => {
      if (draftItem?.id) {
        const byId = orderDetailOriginalItems.find(
          (item) => String(item?.id || '') === String(draftItem.id)
        );
        if (byId) return byId;
      }
      return orderDetailOriginalItems[index] || null;
    },
    [orderDetailOriginalItems]
  );

  const hasOrderDetailItemChanged = useCallback(
    (draftItem, index) => {
      const originalItem = getOrderDetailOriginalItem(draftItem, index);
      if (!originalItem) return true;
      return (
        String(draftItem?.product_id || '') !== String(originalItem?.product_id || '') ||
        String(draftItem?.uom || '') !== String(originalItem?.uom || '') ||
        Math.abs(toNumber(draftItem?.quantity) - toNumber(originalItem?.quantity)) > 0.0001 ||
        Math.abs(
          toNumber(draftItem?.rate ?? draftItem?.unit_price) -
            toNumber(originalItem?.rate ?? originalItem?.unit_price)
        ) > 0.0001 ||
        Math.abs(toNumber(draftItem?.gst_rate) - toNumber(originalItem?.gst_rate)) > 0.0001 ||
        String(draftItem?.discount_type || 'percent') !==
          String(originalItem?.discount_type || 'percent') ||
        Math.abs(toNumber(draftItem?.discount_value) - toNumber(originalItem?.discount_value)) >
          0.0001
      );
    },
    [getOrderDetailOriginalItem, toNumber]
  );

  const getOrderDetailItemFieldChanged = useCallback(
    (draftItem, index, field) => {
      const originalItem = getOrderDetailOriginalItem(draftItem, index);
      if (!originalItem) return true;
      if (field === 'product_id') {
        return String(draftItem?.product_id || '') !== String(originalItem?.product_id || '');
      }
      if (field === 'uom') {
        return String(draftItem?.uom || '') !== String(originalItem?.uom || '');
      }
      if (field === 'quantity') {
        return Math.abs(toNumber(draftItem?.quantity) - toNumber(originalItem?.quantity)) > 0.0001;
      }
      if (field === 'rate') {
        return (
          Math.abs(
            toNumber(draftItem?.rate ?? draftItem?.unit_price) -
              toNumber(originalItem?.rate ?? originalItem?.unit_price)
          ) > 0.0001
        );
      }
      if (field === 'gst_rate') {
        return Math.abs(toNumber(draftItem?.gst_rate) - toNumber(originalItem?.gst_rate)) > 0.0001;
      }
      if (field === 'discount_type') {
        return (
          String(draftItem?.discount_type || 'percent') !==
          String(originalItem?.discount_type || 'percent')
        );
      }
      if (field === 'discount_value') {
        return (
          Math.abs(toNumber(draftItem?.discount_value) - toNumber(originalItem?.discount_value)) >
          0.0001
        );
      }
      return false;
    },
    [getOrderDetailOriginalItem, toNumber]
  );

  const getOrderDetailItemOriginalLabel = useCallback(
    (draftItem, index, field) => {
      const originalItem = getOrderDetailOriginalItem(draftItem, index);
      if (!originalItem) return 'New item';
      if (field === 'product_id') return String(originalItem?.product_name || '-');
      if (field === 'uom') return String(originalItem?.uom || '-');
      if (field === 'quantity') return String(toNumber(originalItem?.quantity));
      if (field === 'rate')
        return formatCurrency(toNumber(originalItem?.rate ?? originalItem?.unit_price));
      if (field === 'gst_rate')
        return `${normalizeGstRateOption(originalItem?.gst_rate).toFixed(0)}%`;
      if (field === 'discount_type')
        return String(originalItem?.discount_type === 'fixed' ? 'Fixed' : '%');
      if (field === 'discount_value') return String(toNumber(originalItem?.discount_value));
      return '-';
    },
    [formatCurrency, getOrderDetailOriginalItem, normalizeGstRateOption, toNumber]
  );

  const orderDetailHasComputedChanges = useMemo(
    () =>
      orderDetailEditMode &&
      (String(orderDetailDraft?.expected_delivery || '') !==
        toDateInputValue(orderDetail?.expected_delivery) ||
        String(orderDetailDraft?.strict_due_date || '') !==
          toDateInputValue(orderDetail?.strict_due_date) ||
        String(orderDetailDraft?.notes || '') !== String(orderDetail?.notes || '') ||
        String(orderDetailDraft?.strict_due_note || '') !==
          String(orderDetail?.strict_due_note || '') ||
        orderDetailItems.length !== orderDetailOriginalItems.length ||
        orderDetailItems.some((item, index) => hasOrderDetailItemChanged(item, index))),
    [
      orderDetailEditMode,
      orderDetailDraft?.expected_delivery,
      orderDetailDraft?.strict_due_date,
      orderDetailDraft?.notes,
      orderDetailDraft?.strict_due_note,
      orderDetail?.expected_delivery,
      orderDetail?.strict_due_date,
      orderDetail?.notes,
      orderDetail?.strict_due_note,
      orderDetailItems,
      orderDetailOriginalItems.length,
      hasOrderDetailItemChanged,
      toDateInputValue,
    ]
  );

  const orderDetailComputedTotals = useMemo(
    () =>
      orderDetailEditMode
        ? calculateOrderTotals(orderDetailItems)
        : {
            taxableValue: toNumber(orderDetail?.taxable_value),
            taxAmount: toNumber(orderDetail?.tax_amount),
            totalAmount: toNumber(orderDetail?.total_amount || getOrderDisplayTotal(orderDetail)),
          },
    [
      orderDetailEditMode,
      orderDetailItems,
      calculateOrderTotals,
      orderDetail,
      getOrderDisplayTotal,
      toNumber,
    ]
  );

  const orderDetailDraftDiagnostics = useMemo(
    () =>
      getPurchaseDraftDiagnostics({
        items: orderDetailEditMode
          ? orderDetailItems
          : orderDetailItems.map((item) => ({
              ...item,
              rate_warning_acknowledged: true,
              discount_warning_acknowledged: true,
            })),
        products,
        findProductForItem,
        calculateOrderItem,
      }),
    [orderDetailEditMode, orderDetailItems, products, findProductForItem, calculateOrderItem]
  );

  return {
    orderDetailItems,
    orderDetailOriginalItems,
    getOrderDetailOriginalItem,
    hasOrderDetailItemChanged,
    getOrderDetailItemFieldChanged,
    getOrderDetailItemOriginalLabel,
    orderDetailHasComputedChanges,
    orderDetailComputedTotals,
    orderDetailDraftDiagnostics,
  };
}

export default useOrderDetailComputed;
