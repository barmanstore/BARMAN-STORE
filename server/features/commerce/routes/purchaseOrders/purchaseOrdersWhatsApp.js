const registerPurchaseOrdersWhatsAppRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    normalizePoPaymentStatus,
    normalizeTransactionDate,
    notifyDistributorPurchaseOrderAsync,
    recordPurchaseOrderStatusHistoryAsync,
    saveDistributorPurchaseReminderAsync,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_SENT,
    PO_PAYMENT_UNPAID,
  } = deps;

  app.post('/api/purchase-orders/:id/distributor-whatsapp', requireAdmin, async (req, res) => {
    try {
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });

      const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
      if (!isPoEditableLifecycle(lifecycleStatus)) {
        return res
          .status(400)
          .json({ error: 'WhatsApp action is available only before confirmation' });
      }

      const items = await dbAllAsync(
        `SELECT poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, p.price AS product_price
         FROM purchase_order_items poi
         LEFT JOIN products p ON p.id = poi.product_id
         WHERE poi.order_id = ?
         ORDER BY poi.id ASC`,
        [req.params.id]
      );

      const orderDate =
        normalizeTransactionDate(order.created_at || order.order_date) ||
        new Date().toISOString().slice(0, 10);
      const distributorNotice = await notifyDistributorPurchaseOrderAsync({
        purchaseOrderId: Number(req.params.id || 0),
        distributorId: Number(order.distributor_id || 0),
        poNumber: order.po_number,
        totalAmount: Number(order.total_amount ?? order.total ?? 0),
        paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
        balanceDue: Number(order.balance_due || 0),
        expectedDelivery: order.expected_delivery || null,
        notes: order.notes || '',
        billNumber: order.bill_number || order.invoice_number || '',
        isUpdate: false,
        items,
        messageDate: orderDate,
        title: `Order for ${orderDate}`,
        preparedBy: req?.authUser?.id || req.body?.created_by || null,
      });

      const whatsappUrl = distributorNotice?.whatsapp?.whatsapp_url || null;
      const nextStatus =
        lifecycleStatus === PO_LIFECYCLE_REVISED ? PO_LIFECYCLE_SENT : PO_LIFECYCLE_SENT;
      await dbRunAsync(
        `UPDATE purchase_orders
         SET po_status = ?,
             status = 'sent',
             sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
             last_reminder_at = CURRENT_TIMESTAMP,
             next_action = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, 'Confirm with bill', req.params.id]
      );
      await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
        fromStatus: lifecycleStatus,
        toStatus: nextStatus,
        note: 'Manual WhatsApp template prepared for distributor',
        paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
        balanceDue: Number(order.balance_due || 0),
        createdBy: req?.authUser?.id || req.body?.created_by || null,
      });
      await saveDistributorPurchaseReminderAsync({
        distributorId: Number(order.distributor_id || 0),
        purchaseOrderId: Number(req.params.id || 0),
        reminderType: 'manual_whatsapp_prepare',
        scheduledFor: new Date().toISOString().slice(0, 10),
        status: 'prepared',
        title: `PO ${order.po_number} ready for WhatsApp`,
        message: `Manual WhatsApp template prepared for ${order.po_number}`,
        whatsappUrl,
        createdBy: req?.authUser?.id || req.body?.created_by || null,
      });

      return res.json({
        success: true,
        delivery_scope: distributorNotice?.mode === 'auto' ? 'provider_send' : 'manual_prepare',
        distributor_notice: distributorNotice || undefined,
        po_status: nextStatus,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Failed to prepare distributor WhatsApp message' });
    }
  });
};

module.exports = { registerPurchaseOrdersWhatsAppRoutes };
