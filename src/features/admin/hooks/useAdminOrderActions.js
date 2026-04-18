import { apiFetch } from '../../../shared/services/api';

const useAdminOrderActions = ({
  ordersApi,
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
  const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

  const buildReceiveResultMessage = (result, successLabel) => {
    if (result?.applied === false) {
      return String(result?.message || successLabel).trim() || successLabel;
    }

    const fulfilledQty = Math.max(0, Number(result?.fulfilled_qty || 0));
    const pendingQty = Math.max(0, Number(result?.pending_qty || 0));
    if (pendingQty > 0) {
      return `${successLabel} ${fulfilledQty} fulfilled, ${pendingQty} still pending.`;
    }
    return successLabel;
  };

  const buildAddressTextFromOrder = (order) => {
    const shipping =
      order?.shipping_address && typeof order.shipping_address === 'object'
        ? order.shipping_address
        : {};
    const parts = [shipping.street, shipping.city, shipping.state, shipping.zip, shipping.country]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
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
      items: rows.map((item, index) => {
        const requestedQty = Math.max(1, Number(item?.requested_qty ?? item?.quantity ?? 1) || 1);
        const lineSubtotal = Math.max(
          0,
          Number(item?.line_subtotal || 0) || Math.max(0, Number(item?.price || 0)) * requestedQty
        );
        const offerDiscount = Math.max(0, Number(item?.offer_discount || 0));
        const manualDiscount = Math.max(0, Number(item?.manual_discount || 0));
        return {
          id: `prefill_${Number(order?.id || 0)}_${index}`,
          name: String(item?.product_name || item?.name || 'Item').trim() || 'Item',
          productId: Number(item?.product_id || 0) > 0 ? Number(item.product_id) : null,
          linkedOrderItemId: Number(item?.id || 0) || null,
          price:
            requestedQty > 0
              ? roundMoney(lineSubtotal / requestedQty)
              : Math.max(0, Number(item?.price || 0)),
          qty: requestedQty,
          unit: String(item?.uom || item?.unit || 'pcs').trim() || 'pcs',
          disc: manualDiscount,
          discType: 'fixed',
          linkedOrderRequestedQty: requestedQty,
          linkedOrderAvailableNowQty: Math.max(0, Number(item?.available_now_qty || 0)),
          linkedOrderFulfilledQty: Math.max(0, Number(item?.fulfilled_qty || 0)),
          linkedOrderPendingQty: Math.max(0, Number(item?.pending_qty || 0)),
          prefilledLineSubtotal: lineSubtotal,
          prefilledOfferDiscount: offerDiscount,
          prefilledManualDiscount: manualDiscount,
          prefilledTotalDiscount: Math.min(
            lineSubtotal,
            Math.max(Math.max(0, Number(item?.discount || 0)), offerDiscount + manualDiscount)
          ),
          prefilledOfferLabel: String(item?.offer_label || '').trim(),
        };
      }),
      note: `Prepared from order ${String(order?.order_number || `#${order?.id || ''}`)}`,
    };
  };

  const openApproveModal = async (orderId) => {
    try {
      setModalLoading(true);
      setModalItems([]);
      const order = await ordersApi.getById(orderId);
      setModalOrder(order);
      setModalItems(Array.isArray(order?.items) ? order.items : []);
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
      const result = await ordersApi.updateStatus(modalOrder.id, 'received', {
        description: 'Marked received via admin modal',
      });
      setShowApproveModal(false);
      await Promise.all([refreshOrdersData(), refreshAdminData()]);
      showNotification(buildReceiveResultMessage(result, 'Order received.'), 'success');
      await apiFetch(`/api/notify-order/${modalOrder.id}`, {
        method: 'POST',
        body: { action: 'received' },
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
      const result = await ordersApi.updateStatus(id, status, {
        description: `Order ${status} via admin panel`,
      });
      await Promise.all([refreshOrdersData(), refreshAdminData()]);
      showNotification(
        buildReceiveResultMessage(result, `Order ${status} successfully.`),
        'success'
      );
    } catch (error) {
      console.error('Failed to update order status', error);
      showNotification(error.message || 'Failed to update order status', 'error');
    }
  };

  const handleApplyPendingFulfillment = async (orderId) => {
    if (!orderId) return;
    try {
      const result = await ordersApi.updateStatus(orderId, 'received', {
        description: 'Pending fulfillment re-applied via admin panel',
        reapply_pending: true,
      });
      await Promise.all([refreshOrdersData(), refreshAdminData()]);
      showNotification(
        buildReceiveResultMessage(result, 'Pending quantity re-checked against current stock.'),
        'success'
      );
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
      let didAutoReceive = false;
      const currentStatus = String(fullOrder?.status || '')
        .trim()
        .toLowerCase();
      if (currentStatus === 'ordered') {
        const confirmReceiveThenBill = window.confirm(
          'This order is still pending receipt.\n\nMark as received and open billing now?'
        );
        if (!confirmReceiveThenBill) return;
        const result = await ordersApi.updateStatus(orderId, 'received', {
          description: 'Auto-confirmed before billing',
        });
        await Promise.all([refreshOrdersData(), refreshAdminData()]);
        fullOrder = await ordersApi.getById(orderId);
        didAutoReceive = true;
        showNotification(
          buildReceiveResultMessage(result, 'Order marked received. Billing is now open.'),
          'success'
        );
      }
      const prefill = buildBillingPrefillFromOrder(fullOrder);
      setBillingPrefill(prefill);
      handleTabChange('billing');
      setShowApproveModal(false);
      if (!didAutoReceive) {
        showNotification('Order loaded in billing form', 'success');
      }
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
