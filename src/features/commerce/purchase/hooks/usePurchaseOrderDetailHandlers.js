import { useCallback } from 'react';

const usePurchaseOrderDetailHandlers = ({
  orderDetail,
  orderDetailDraft,
  setOrderDetail,
  setOrderDetailDraft,
  setShowOrderDetail,
  setOrderDetailLoading,
  setOrderDetailEditMode,
  setOrderDetailSaving,
  setError,
  setSuccess,
  purchaseOrdersApi,
  products,
  toDateInputValue,
  getProductSearchLabel,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
  calculateOrderItem,
  calculateOrderTotals,
  createEmptyOrderItem,
  isPoEditable,
  resolveProductByInput,
  getPurchaseRequestErrorMessage,
  fetchOrders,
}) => {
  const buildOrderDetailDraft = useCallback((order) => {
    if (!order) return null;
    return {
      expected_delivery: toDateInputValue(order.expected_delivery),
      strict_due_date: toDateInputValue(order.strict_due_date),
      notes: order.notes || '',
      strict_due_note: order.strict_due_note || '',
      items: (order.items || []).map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        return {
          id: item.id,
          product_id: item.product_id ? String(item.product_id) : '',
          product_query: product ? getProductSearchLabel(product) : (item.product_name || ''),
          product_name: item.product_name || '',
          quantity: Math.max(1, toNumber(item.quantity)),
          uom: resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs'),
          rate: toNumber(item.rate ?? item.unit_price),
          unit_price: toNumber(item.unit_price ?? item.rate),
          gst_rate: normalizeGstRateOption(item.gst_rate),
          discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
          discount_value: Math.max(0, toNumber(item.discount_value)),
          taxable_value: toNumber(item.taxable_value),
          tax_amount: toNumber(item.tax_amount),
          line_total: toNumber(item.line_total ?? item.total),
        };
      }),
    };
  }, [products, toDateInputValue, getProductSearchLabel, resolvePurchaseUnitForProduct, normalizeGstRateOption, toNumber]);

  const closeOrderDetail = useCallback(() => {
    setShowOrderDetail(false);
    setOrderDetail(null);
    setOrderDetailEditMode(false);
    setOrderDetailSaving(false);
    setOrderDetailDraft(null);
  }, [
    setShowOrderDetail,
    setOrderDetail,
    setOrderDetailEditMode,
    setOrderDetailSaving,
    setOrderDetailDraft,
  ]);

  const handleOrderDetailFieldChange = useCallback((field, value) => {
    setOrderDetailDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, [setOrderDetailDraft]);

  const handleOrderDetailItemChange = useCallback((index, field, value) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const current = items[index];
      if (!current) return prev;
      const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
      const nextItem = { ...current, [field]: nextValue };
      if (field === 'uom') {
        const selectedProduct = products.find((product) => String(product?.id || '') === String(current.product_id || '')) || null;
        nextItem.uom = resolvePurchaseUnitForProduct(selectedProduct, value);
      }
      if (field === 'rate') {
        nextItem.rate = toNumber(value);
        nextItem.unit_price = toNumber(value);
      }
      if (field === 'unit_price') {
        nextItem.unit_price = toNumber(value);
        nextItem.rate = toNumber(value);
      }
      if (field === 'quantity') {
        nextItem.quantity = Math.max(1, toNumber(value));
      }
      items[index] = nextItem;
      return { ...prev, items };
    });
  }, [setOrderDetailDraft, normalizeGstRateOption, products, resolvePurchaseUnitForProduct, toNumber]);

  const handleOrderDetailProductInputChange = useCallback((index, value) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const current = items[index];
      if (!current) return prev;

      const nextItem = {
        ...current,
        product_query: value,
      };
      const match = resolveProductByInput(value);
      if (!match) {
        nextItem.product_id = '';
        nextItem.product_name = value;
        items[index] = nextItem;
        return { ...prev, items };
      }

      const defaultUom = resolvePurchaseUnitForProduct(match, match.base_unit || match.uom || 'pcs');
      nextItem.product_id = String(match.id);
      nextItem.product_name = match.name;
      nextItem.product_query = getProductSearchLabel(match);
      nextItem.uom = defaultUom;
      nextItem.rate = toNumber(match.price);
      nextItem.unit_price = toNumber(match.price);
      items[index] = nextItem;
      return { ...prev, items };
    });
  }, [setOrderDetailDraft, resolveProductByInput, resolvePurchaseUnitForProduct, getProductSearchLabel, toNumber]);

  const handleOrderDetailItemAdd = useCallback(() => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...(prev.items || []),
          {
            ...createEmptyOrderItem(),
            quantity: 1,
            gst_rate: normalizeGstRateOption(5),
          },
        ],
      };
    });
  }, [setOrderDetailDraft, createEmptyOrderItem, normalizeGstRateOption]);

  const handleOrderDetailItemRemove = useCallback((index) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: (prev.items || []).filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }, [setOrderDetailDraft]);

  const openOrderDetailEditMode = useCallback(() => {
    if (!orderDetail || !isPoEditable(orderDetail)) return;
    setOrderDetailDraft(buildOrderDetailDraft(orderDetail));
    setOrderDetailEditMode(true);
  }, [orderDetail, isPoEditable, buildOrderDetailDraft, setOrderDetailDraft, setOrderDetailEditMode]);

  const handleOrderDetailSave = useCallback(async () => {
    if (!orderDetail || !orderDetailDraft) return;
    const validItems = (orderDetailDraft.items || []).filter((item) => item.product_id && toNumber(item.quantity) > 0);
    if (!validItems.length) {
      setError('Please keep at least one valid item in the purchase order');
      return;
    }

    try {
      setError('');
      setOrderDetailSaving(true);
      const calculatedItems = validItems.map((item) => {
        const line = calculateOrderItem(item);
        return {
          ...item,
          quantity: line.quantity,
          uom: line.uom,
          unit_price: line.rate,
          rate: line.rate,
          gst_rate: line.gstRate,
          discount_type: line.discountType,
          discount_value: line.discountValue,
          taxable_value: line.taxableValue,
          tax_amount: line.taxAmount,
          line_total: line.totalAmount,
        };
      });
      const totals = calculateOrderTotals(calculatedItems);
      const payload = {
        distributor_id: orderDetail.distributor_id,
        expected_delivery: orderDetailDraft.expected_delivery || null,
        strict_due_date: orderDetailDraft.strict_due_date || null,
        strict_due_note: orderDetailDraft.strict_due_note || '',
        notes: orderDetailDraft.notes || '',
        subtotal: totals.taxableValue,
        taxable_value: totals.taxableValue,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        grand_total: totals.totalAmount,
        total: totals.totalAmount,
        items: calculatedItems,
      };
      await purchaseOrdersApi.update(orderDetail.id, payload);
      const refreshedOrder = await purchaseOrdersApi.getById(orderDetail.id);
      setOrderDetail(refreshedOrder);
      setOrderDetailDraft(buildOrderDetailDraft(refreshedOrder));
      setOrderDetailEditMode(false);
      setSuccess('Purchase order updated.');
      await fetchOrders();
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'Failed to update purchase order'));
    } finally {
      setOrderDetailSaving(false);
    }
  }, [
    orderDetail,
    orderDetailDraft,
    toNumber,
    setError,
    setOrderDetailSaving,
    calculateOrderItem,
    calculateOrderTotals,
    purchaseOrdersApi,
    setOrderDetail,
    setOrderDetailDraft,
    buildOrderDetailDraft,
    setOrderDetailEditMode,
    setSuccess,
    fetchOrders,
    getPurchaseRequestErrorMessage,
  ]);

  const handleViewOrder = useCallback(async (orderId) => {
    try {
      setShowOrderDetail(true);
      setOrderDetail(null);
      setOrderDetailLoading(true);
      setOrderDetailEditMode(false);
      setOrderDetailDraft(null);
      const order = await purchaseOrdersApi.getById(orderId);
      setOrderDetail(order);
      setOrderDetailDraft(buildOrderDetailDraft(order));
    } catch (err) {
      setError('Failed to load order details');
      setShowOrderDetail(false);
    } finally {
      setOrderDetailLoading(false);
    }
  }, [
    setShowOrderDetail,
    setOrderDetail,
    setOrderDetailLoading,
    setOrderDetailEditMode,
    setOrderDetailDraft,
    purchaseOrdersApi,
    buildOrderDetailDraft,
    setError,
  ]);

  return {
    buildOrderDetailDraft,
    closeOrderDetail,
    handleOrderDetailFieldChange,
    handleOrderDetailItemChange,
    handleOrderDetailProductInputChange,
    handleOrderDetailItemAdd,
    handleOrderDetailItemRemove,
    openOrderDetailEditMode,
    handleOrderDetailSave,
    handleViewOrder,
  };
};

export default usePurchaseOrderDetailHandlers;
