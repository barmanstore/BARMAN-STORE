const useAdminOrderActions = ({
  ordersApi,
  productsApi,
  user,
  setModalLoading,
  setModalOrder,
  setModalItems,
  setShowApproveModal,
  modalOrder,
  showNotification,
  refreshAdminData,
  refreshOrdersData,
  setProceedBillingOrderId,
  setBillingPrefill,
  handleTabChange,
}) => {
  const buildAddressTextFromOrder = (order) => {
    const shipping = order?.shipping_address && typeof order.shipping_address === 'object'
      ? order.shipping_address
      : {};
    const parts = [
      shipping.street,
      shipping.city,
      shipping.state,
      shipping.zip,
      shipping.country,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return parts.join(', ');
  };

  const buildBillingPrefillFromOrder = (order) => {
    const customerId = Number(order?.user_id || 0) || null;
    const rows = Array.isArray(order?.items) ? order.items : [];
    return {
      key: `order_${Number(order?.id || 0)}_${Date.now()}`,
      source: {
        order_id: Number(order?.id || 0) || null,
        order_number: String(order?.order_number || '').trim(),
      },
      customer: {
        id: customerId,
        name: String(order?.customer_name || '').trim(),
        email: String(order?.customer_email || '').trim(),
        phone: String(order?.customer_phone || '').trim(),
        address: buildAddressTextFromOrder(order),
      },
      items: rows.map((item, index) => ({
        id: `prefill_${Number(order?.id || 0)}_${index}`,
        name: String(item?.product_name || item?.name || 'Item').trim() || 'Item',
        productId: Number(item?.product_id || 0) > 0 ? Number(item.product_id) : null,
        price: Math.max(0, Number(item?.price || 0)),
        qty: Math.max(1, Number(item?.quantity || 1)),
        unit: String(item?.uom || item?.unit || 'pcs').trim() || 'pcs',
        disc: 0,
        discType: 'fixed',
      })),
      note: `Prepared from order ${String(order?.order_number || `#${order?.id || ''}`)}`,
    };
  };

  const openApproveModal = async (orderId) => {
    try {
      setModalLoading(true);
      const order = await ordersApi.getById(orderId);
      setModalOrder(order);
      // Fetch current stock for each product in order items.
      const items = order.items || [];
      const itemsWithStock = await Promise.all(items.map(async (item) => {
        try {
          const product = await productsApi.getById(item.product_id);
          return { ...item, stock: product.stock };
        } catch (_) {
          return { ...item, stock: undefined };
        }
      }));
      setModalItems(itemsWithStock);
      setShowApproveModal(true);
    } catch (error) {
      showNotification(error.message || 'Failed to load order details', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const confirmApprove = async () => {
    if (!modalOrder) return;
    try {
      setModalLoading(true);
      await ordersApi.updateStatus(modalOrder.id, 'received', 'Marked received via admin modal', user.id);
      setShowApproveModal(false);
      await refreshOrdersData();
      await refreshAdminData();
      showNotification('Order marked received and stock applied', 'success');
      await fetch(`/api/notify-order/${modalOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'received' })
      }).catch(() => {});
    } catch (error) {
      showNotification(error.message || 'Failed to mark order received', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (id, status) => {
    if (status !== 'received') return;
    if (!window.confirm('Mark this order as received and apply stock?')) return;
    try {
      await ordersApi.updateStatus(id, status, `Order ${status} via admin panel`, user.id);
      await refreshOrdersData();
      await refreshAdminData();
      showNotification(`Order ${status} successfully`, 'success');
    } catch (error) {
      console.error('Failed to update order status', error);
      showNotification(error.message || 'Failed to update order status', 'error');
    }
  };

  const handleApplyPendingFulfillment = async (orderId) => {
    if (!orderId) return;
    try {
      await ordersApi.updateStatus(
        orderId,
        'received',
        'Pending fulfillment re-applied via admin panel',
        user.id,
        { reapply_pending: true }
      );
      await refreshOrdersData();
      await refreshAdminData();
      showNotification('Pending quantity re-checked against current stock', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to apply pending fulfillment', 'error');
    }
  };

  const handleProceedToBilling = async (orderInput) => {
    const orderId = Number(orderInput?.id || 0);
    if (!orderId) return;
    try {
      setProceedBillingOrderId(orderId);
      let fullOrder = Array.isArray(orderInput?.items)
        ? orderInput
        : await ordersApi.getById(orderId);
      const currentStatus = String(fullOrder?.status || '').trim().toLowerCase();
      if (currentStatus === 'ordered') {
        const confirmReceiveThenBill = window.confirm(
          'This order is still pending receipt.\n\nMark as received and open billing now?'
        );
        if (!confirmReceiveThenBill) return;
        await ordersApi.updateStatus(orderId, 'received', 'Auto-confirmed before billing', user.id);
        await refreshOrdersData();
        await refreshAdminData();
        fullOrder = await ordersApi.getById(orderId);
        showNotification('Order marked received. Billing is now open.', 'success');
      }
      const prefill = buildBillingPrefillFromOrder(fullOrder);
      setBillingPrefill(prefill);
      handleTabChange('billing');
      setShowApproveModal(false);
      showNotification('Order loaded in billing form', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to open billing with this order', 'error');
    } finally {
      setProceedBillingOrderId(0);
    }
  };

  return {
    openApproveModal,
    confirmApprove,
    handleUpdateOrderStatus,
    handleApplyPendingFulfillment,
    handleProceedToBilling,
  };
};

export default useAdminOrderActions;
