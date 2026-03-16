const registerOrderCreateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeOrderStatus,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    normalizeOrderPaymentStatus,
    parseOrderAddress,
    normalizeEmail,
    parsePhoneInput,
    parseBooleanEnv,
    normalizePaymentMethod,
    generateOrderNumber,
    validateCustomerProfile,
    createAppNotification,
    notifyAdmins,
    logAdminAuditAsync,
    logStockLedgerAsync,
    placeOrder
  } = deps;

app.post('/api/orders', requireAuth, async (_, res) =>
  res.status(410).json({ error: 'Legacy order endpoint is disabled. Use /api/orders/create-validated.' })
);

app.post('/api/orders/create-validated', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const authUser = req.authUser;
    const isAdminOrder = Boolean(body.is_admin_order) && authUser.role === 'admin';
    const effectiveUserId = isAdminOrder
      ? (Number(body.selected_customer_id || body.user_id || 0) || null)
      : Number(authUser.id);
    if (body.is_admin_order && authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required for admin order mode' });
    }
    if (isAdminOrder && !body.selected_customer_id) {
      return res.status(400).json({ error: 'Selected customer is required for admin order' });
    }
    if (effectiveUserId) {
      const customer = await dbGetAsync(
        `SELECT id, name, email_verified, phone_verified, phone, address, role FROM users WHERE id = ?`,
        [effectiveUserId]
      );
      if (!customer) {
        return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
      }
      let address = {};
      if (customer.address) {
        try {
          address = JSON.parse(customer.address);
        } catch (_) {
          address = { street: customer.address };
        }
      }
      if (String(customer.role || '').toLowerCase() !== 'admin') {
        const submittedAddress = (body.shipping_address && typeof body.shipping_address === 'object')
          ? body.shipping_address
          : {};
        const mergedAddress = {
          street: String(submittedAddress.street || address.street || '').trim(),
          city: String(submittedAddress.city || address.city || '').trim(),
          state: String(submittedAddress.state || address.state || '').trim(),
          zip: String(submittedAddress.zip || address.zip || '').trim(),
          country: String(submittedAddress.country || address.country || '').trim(),
        };
        const profileForValidation = {
          ...customer,
          phone: String(body.customer_phone || customer.phone || '').trim(),
        };
        const validation = validateCustomerProfile(profileForValidation, mergedAddress);
        if (!validation.complete) {
          return res.status(400).json({
            error: 'INCOMPLETE_PROFILE',
            message: 'Customer profile is incomplete',
            issues: validation.issues,
          });
        }
      }
    }

    const result = await placeOrder({
      ...body,
      user_id: effectiveUserId,
      customer_phone: body.customer_phone,
      shipping_address: body.shipping_address || {},
      payment_method: 'cash',
    });
    const orderId = Number(result?.orderId || 0);
    const orderNumber = String(result?.orderNumber || '').trim();
    const availableNowQty = Math.max(0, Number(result?.availableNowQty || 0));
    const pendingQty = Math.max(0, Number(result?.pendingQty || 0));
    const customerName = String(body.customer_name || '').trim() || `User #${effectiveUserId}`;
    const actorName = String(authUser?.name || '').trim() || 'System';
    try {
      if (orderId && effectiveUserId) {
        await createAppNotification({
          userId: Number(effectiveUserId),
          title: 'Order placed',
          message: pendingQty > 0
            ? `Order ${orderNumber || `#${orderId}`} placed. Partially available: ${availableNowQty} now, ${pendingQty} pending.`
            : `Order ${orderNumber || `#${orderId}`} has been placed successfully.`,
          level: 'success',
          entityType: 'order',
          entityId: orderId,
          metadata: {
            order_id: orderId,
            order_number: orderNumber || null,
            user_id: Number(effectiveUserId),
            available_now_qty: availableNowQty,
            pending_qty: pendingQty,
          },
          createdBy: Number(authUser?.id || 0) || null,
        });
      }
      if (orderId) {
        await notifyAdmins({
          title: 'New order placed',
          message: `${customerName} placed order ${orderNumber || `#${orderId}`}${isAdminOrder ? ` (created by ${actorName})` : ''}.`,
          level: 'info',
          entityType: 'order',
          entityId: orderId,
          metadata: {
            order_id: orderId,
            order_number: orderNumber || null,
            user_id: Number(effectiveUserId || 0) || null,
            created_by_admin: isAdminOrder ? Number(authUser?.id || 0) || null : null,
          },
          createdBy: Number(authUser?.id || 0) || null,
        });
      }
    } catch (notifyError) {
      console.warn('[NOTIFY] order placement notification failed:', notifyError?.message || notifyError);
    }
    return res.status(201).json({ success: true, ...result, message: 'Order placed successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

};

module.exports = { registerOrderCreateRoutes };
