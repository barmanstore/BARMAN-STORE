import { useCallback } from 'react';

const usePurchaseOrderFormHandlers = ({
  setFilters,
  setActiveSubTab,
  closePoProductForm,
  getDefaultOrderFormData,
  setOrderFormData,
  setEditingOrderId,
  setOrderFullMode,
  setOrderSubmitting,
  setLoadingDistributorItems,
  setActivePoProductField,
  setPoProductFormTarget,
  setShowOrderForm,
  orderSubmitLockRef,
  orderSubmitting,
  orderFormData,
  distributors,
  products,
  buildOrderDraftItem,
  createEmptyOrderItem,
  toNumber,
  calculateOrderItem,
  calculateOrderTotals,
  purchaseOrdersApi,
  user,
  editingOrderId,
  orderFormClientRequestId,
  setOrderFormClientRequestId,
  createClientRequestId,
  setError,
  getPurchaseRequestErrorMessage,
  fetchOrders,
  isPoEditable,
  toDateInputValue,
}) => {
  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  }, [setFilters]);

  const resetOrderForm = useCallback(() => {
    setOrderFormData(getDefaultOrderFormData());
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderSubmitting(false);
    setLoadingDistributorItems(false);
    setActivePoProductField({ mode: 'entry', index: null });
    setPoProductFormTarget(null);
    orderSubmitLockRef.current = false;
    setOrderFormClientRequestId(createClientRequestId('po'));
  }, [
    setOrderFormData,
    getDefaultOrderFormData,
    setEditingOrderId,
    setOrderFullMode,
    setOrderSubmitting,
    setLoadingDistributorItems,
    setActivePoProductField,
    setPoProductFormTarget,
    orderSubmitLockRef,
    setOrderFormClientRequestId,
    createClientRequestId,
  ]);

  const openCreateOrderForm = useCallback(() => {
    setError('');
    resetOrderForm();
    setShowOrderForm(true);
  }, [setError, resetOrderForm, setShowOrderForm]);

  const openCreateOrderFormForDistributor = useCallback((distributorId, options = {}) => {
    const distributor = distributors.find((entry) => String(entry.id) === String(distributorId));
    const suggestedItems = Array.isArray(options.suggested_items) ? options.suggested_items : [];
    setError('');
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderFormData({
      distributor_id: distributor ? String(distributor.id) : String(distributorId || ''),
      distributor_name: distributor?.name || '',
      expected_delivery: options.expected_delivery || options.order_date || '',
      strict_due_date: options.strict_due_date || '',
      strict_due_note: options.strict_due_note || '',
      notes: options.notes || '',
      items: suggestedItems.length
        ? suggestedItems.map((item) => {
            const product = products.find((entry) => String(entry.id) === String(item.product_id || '')) || null;
            return buildOrderDraftItem(product, {
              ...item,
              quantity: Math.max(1, toNumber(item.quantity || 1)),
              last_purchase_hint: 'Suggested from recent distributor history',
            });
          })
        : [createEmptyOrderItem()],
    });
    setShowOrderForm(true);
  }, [
    distributors,
    products,
    buildOrderDraftItem,
    createEmptyOrderItem,
    toNumber,
    setError,
    setEditingOrderId,
    setOrderFullMode,
    setOrderFormData,
    setShowOrderForm,
  ]);

  const closeOrderForm = useCallback(() => {
    closePoProductForm();
    setShowOrderForm(false);
    resetOrderForm();
  }, [closePoProductForm, setShowOrderForm, resetOrderForm]);

  const handlePurchaseSectionChange = useCallback((sectionKey) => {
    setActiveSubTab(sectionKey);
  }, [setActiveSubTab]);

  const handleOrderSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (orderSubmitLockRef.current || orderSubmitting) return;
    orderSubmitLockRef.current = true;
    setError('');

    try {
      setOrderSubmitting(true);
      const selectedDistributor = distributors.find((d) => String(d.id) === String(orderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const invalidTypedProducts = orderFormData.items.filter((item) =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const validItems = orderFormData.items.filter((item) => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

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

      const orderTotals = calculateOrderTotals(calculatedItems);
      const payload = {
        distributor_id: orderFormData.distributor_id,
        expected_delivery: orderFormData.expected_delivery,
        strict_due_date: orderFormData.strict_due_date || null,
        strict_due_note: orderFormData.strict_due_note || '',
        notes: orderFormData.notes,
        subtotal: orderTotals.taxableValue,
        taxable_value: orderTotals.taxableValue,
        tax_amount: orderTotals.taxAmount,
        total_amount: orderTotals.totalAmount,
        grand_total: orderTotals.totalAmount,
        total: orderTotals.totalAmount,
        items: calculatedItems,
        created_by: user?.id,
        client_request_id: editingOrderId ? undefined : orderFormClientRequestId,
      };

      if (editingOrderId) {
        await purchaseOrdersApi.update(editingOrderId, payload);
      } else {
        await purchaseOrdersApi.create(payload);
      }

      closeOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(
        getPurchaseRequestErrorMessage(
          err,
          editingOrderId ? 'Failed to update purchase order' : 'Failed to create purchase order'
        )
      );
      setOrderSubmitting(false);
      orderSubmitLockRef.current = false;
    }
  }, [
    orderSubmitLockRef,
    orderSubmitting,
    setError,
    setOrderSubmitting,
    distributors,
    orderFormData,
    calculateOrderItem,
    calculateOrderTotals,
    user,
    editingOrderId,
    orderFormClientRequestId,
    purchaseOrdersApi,
    closeOrderForm,
    fetchOrders,
    getPurchaseRequestErrorMessage,
  ]);

  const handleEditOrder = useCallback(async (orderId) => {
    try {
      setError('');
      const order = await purchaseOrdersApi.getById(orderId);
      if (!order || !isPoEditable(order)) {
        setError('Only prepared, sent, or revised orders can be edited');
        return;
      }

      const mappedItems = (order.items || []).map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        return buildOrderDraftItem(product, {
          ...item,
          product_query: item.product_name || '',
          quantity: toNumber(item.quantity),
          last_purchase_hint: '',
        });
      });

      setOrderFormData({
        distributor_id: order.distributor_id ? String(order.distributor_id) : '',
        distributor_name: order.distributor_name || distributors.find((d) => String(d.id) === String(order.distributor_id))?.name || '',
        expected_delivery: toDateInputValue(order.expected_delivery),
        strict_due_date: toDateInputValue(order.strict_due_date),
        strict_due_note: order.strict_due_note || '',
        notes: order.notes || '',
        items: mappedItems.length ? mappedItems : [createEmptyOrderItem()],
      });
      setOrderFullMode(true);
      setEditingOrderId(order.id);
      setShowOrderForm(true);
    } catch (err) {
      setError(err.message || 'Failed to load order for edit');
    }
  }, [
    setError,
    purchaseOrdersApi,
    isPoEditable,
    products,
    buildOrderDraftItem,
    toNumber,
    setOrderFormData,
    distributors,
    toDateInputValue,
    createEmptyOrderItem,
    setOrderFullMode,
    setEditingOrderId,
    setShowOrderForm,
  ]);

  return {
    handleFilterChange,
    openCreateOrderForm,
    openCreateOrderFormForDistributor,
    closeOrderForm,
    handlePurchaseSectionChange,
    handleOrderSubmit,
    handleEditOrder,
    resetOrderForm,
  };
};

export default usePurchaseOrderFormHandlers;
