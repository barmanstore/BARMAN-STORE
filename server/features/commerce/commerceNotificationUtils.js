const createCommerceNotificationUtils = (deps = {}) => {
  const {
    dbGetAsync,
    dbAllAsync,
    normalizeTransactionDate,
    normalizePoPaymentStatus,
    PO_PAYMENT_UNPAID,
    createNotificationEvent,
    updateNotificationEventStatus,
    notificationService,
    whatsappProvider,
    WHATSAPP_DELIVERY_MODE,
    getDistributorWhatsappPhone,
  } = deps;

  const normalizeWhatsAppRecipientPhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return digits;
  };

  const getRequestedDeliveryMode = () =>
    String(WHATSAPP_DELIVERY_MODE || 'manual')
      .trim()
      .toLowerCase() === 'auto'
      ? 'auto'
      : 'manual';

  const canAutoDeliverWhatsApp = () =>
    getRequestedDeliveryMode() === 'auto' &&
    Boolean(whatsappProvider?.supportsSend) &&
    Boolean(whatsappProvider?.isReady);

  const notifyDistributorPurchaseOrderAsync = async ({
    purchaseOrderId = null,
    distributorId,
    poNumber,
    totalAmount,
    paymentStatus = PO_PAYMENT_UNPAID,
    balanceDue = 0,
    expectedDelivery = null,
    notes = '',
    billNumber = '',
    isUpdate = false,
    items = [],
    messageDate = null,
    title = '',
    preparedBy = null,
  } = {}) => {
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedDistributorId) return { queued: false, reason: 'missing_distributor' };
    const distributor = await dbGetAsync(
      `SELECT id, name, contacts FROM distributors WHERE id = ?`,
      [normalizedDistributorId]
    );
    if (!distributor) return { queued: false, reason: 'distributor_not_found' };
    const normalizedPhone = getDistributorWhatsappPhone(distributor);
    if (!normalizedPhone) return { queued: false, reason: 'missing_phone' };

    const recipientPhone = normalizeWhatsAppRecipientPhone(normalizedPhone);
    if (!recipientPhone) return { queued: false, reason: 'invalid_phone' };

    const normalizedPurchaseOrderId = Number(purchaseOrderId || 0);
    let noticeItems = Array.isArray(items) ? items : [];
    if (!noticeItems.length && normalizedPurchaseOrderId) {
      noticeItems = await dbAllAsync(
        `SELECT poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, p.price AS product_price
         FROM purchase_order_items poi
         LEFT JOIN products p ON p.id = poi.product_id
         WHERE poi.order_id = ?
         ORDER BY poi.id ASC`,
        [normalizedPurchaseOrderId]
      );
    }
    const noticeProductIds = [
      ...new Set(
        noticeItems
          .map((item) => Number(item?.product_id || 0))
          .filter((value) => Number.isInteger(value) && value > 0)
      ),
    ];
    if (noticeProductIds.length > 0) {
      const placeholders = noticeProductIds.map(() => '?').join(', ');
      const productRows = await dbAllAsync(
        `SELECT id, price
         FROM products
         WHERE id IN (${placeholders})`,
        noticeProductIds
      );
      const productPriceById = new Map(
        productRows.map((row) => [Number(row?.id || 0), Number(row?.price || 0)])
      );
      noticeItems = noticeItems.map((item) => {
        const productId = Number(item?.product_id || 0);
        const productPrice = productPriceById.get(productId);
        if (!Number.isFinite(productPrice) || productPrice <= 0) return item;
        return {
          ...item,
          price: productPrice,
          product_price: productPrice,
        };
      });
    }

    const orderDate =
      normalizeTransactionDate(messageDate) || new Date().toISOString().slice(0, 10);
    const preparedWhatsApp = notificationService.prepareWhatsApp({
      type: 'purchase_order_distributor_notice',
      to: recipientPhone,
      payload: {
        title: String(title || '').trim() || `Order for ${orderDate}`,
        order_date: orderDate,
        items: noticeItems,
      },
    });
    const text = preparedWhatsApp.text;
    const normalizedRecipientPhone = preparedWhatsApp.to;
    const whatsappUrl = preparedWhatsApp.whatsapp_url;
    const requestedDeliveryMode = getRequestedDeliveryMode();
    const effectiveDeliveryMode = canAutoDeliverWhatsApp() ? 'auto' : 'manual';

    const eventId = await createNotificationEvent({
      type: 'purchase_order_distributor_notice',
      channel: 'whatsapp',
      recipient: normalizedRecipientPhone,
      recipientUserId: null,
      subject: `PO ${isUpdate ? 'update' : 'register'} ${poNumber || ''}`.trim(),
      body: text,
      metadata: {
        mode: effectiveDeliveryMode,
        requested_mode: requestedDeliveryMode,
        provider_supports_send: Boolean(whatsappProvider?.supportsSend),
        po_number: poNumber || null,
        distributor_id: normalizedDistributorId,
        items_count: noticeItems.length,
        order_date: orderDate,
        title: String(title || '').trim() || `Order for ${orderDate}`,
        balance_due: Number(balanceDue || 0),
        payment_status: normalizePoPaymentStatus(paymentStatus, PO_PAYMENT_UNPAID),
        bill_number: billNumber || null,
        expected_delivery: expectedDelivery ? String(expectedDelivery).slice(0, 10) : null,
      },
      status: 'prepared',
      preparedBy,
    });

    if (effectiveDeliveryMode !== 'auto') {
      return {
        queued: false,
        reason: 'manual_send_required',
        mode: effectiveDeliveryMode,
        event_id: eventId,
        whatsapp: {
          to: normalizedRecipientPhone,
          text,
          whatsapp_url: whatsappUrl,
        },
      };
    }

    try {
      await whatsappProvider.sendMessage({ to: normalizedRecipientPhone, text });
      await updateNotificationEventStatus(eventId, { status: 'sent' });
      return {
        queued: true,
        mode: 'auto',
        event_id: eventId,
        whatsapp: { to: normalizedRecipientPhone, text, whatsapp_url: whatsappUrl },
      };
    } catch (error) {
      await updateNotificationEventStatus(eventId, {
        status: 'failed',
        errorMessage: error?.message || String(error || 'WhatsApp send failed'),
      });
      return {
        queued: false,
        reason: 'send_failed',
        event_id: eventId,
        error: error?.message || String(error || 'WhatsApp send failed'),
        whatsapp: { to: normalizedRecipientPhone, text, whatsapp_url: whatsappUrl },
      };
    }
  };

  return { notifyDistributorPurchaseOrderAsync };
};

module.exports = { createCommerceNotificationUtils };
