const buildBillContext = async (deps, req, createHttpError) => {
  const {
    dbGetAsync,
    dbAllAsync,
    normalizeEmail,
    normalizePhone,
    normalizeOrderStatus,
    resolveClientRequestId,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
  } = deps;

  const b = req.body || {};
  const linkedOrderId = Number(b.order_id || 0) || 0;
  const idempotency = resolveClientRequestId(req);
  if (idempotency.error) throw createHttpError(400, idempotency.error);
  const clientRequestId = idempotency.value;
  if (clientRequestId) {
    const existing = await dbGetAsync('SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1', [clientRequestId]);
    if (existing) {
      return {
        dedupe: {
          clientRequestId,
          linkedOrderId,
          dedupe: {
            status: 200,
            body: {
              success: true,
              deduplicated: true,
              bill_id: Number(existing.id),
              bill_number: existing.bill_number,
            },
          },
        },
      };
    }
  }

  let linkedOrder = null;
  let linkedOrderItems = [];
  if (linkedOrderId) {
    linkedOrder = await dbGetAsync('SELECT * FROM orders WHERE id = ?', [linkedOrderId]);
    if (!linkedOrder) throw createHttpError(404, 'Linked order not found');
    const existingForOrder = await dbGetAsync('SELECT id, bill_number FROM bills WHERE order_id = ? LIMIT 1', [linkedOrderId]);
    if (existingForOrder) {
      return {
        dedupe: {
          clientRequestId,
          linkedOrderId,
          dedupe: {
            status: 200,
            body: {
              success: true,
              deduplicated: true,
              bill_id: Number(existingForOrder.id),
              bill_number: existingForOrder.bill_number,
              reason: 'order_already_billed',
            },
          },
        },
      };
    }
    const linkedOrderStatus = normalizeOrderStatus(linkedOrder?.status, ORDER_STATUS_ORDERED);
    if (linkedOrderStatus !== ORDER_STATUS_RECEIVED) {
      const error = createHttpError(409, 'Linked order must be marked received before billing');
      error.orderStatus = linkedOrderStatus;
      throw error;
    }
    linkedOrderItems = await dbAllAsync('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [linkedOrderId]);
  }

  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw createHttpError(400, 'items are required');
  const billTypeRaw = String(b.bill_type || 'sales').trim().toLowerCase();
  const billType = billTypeRaw === 'purchase' ? 'purchase' : 'sales';
  const fulfillmentModeRaw = String(b.fulfillment_mode || '').trim().toLowerCase();
  const fulfillmentMode = linkedOrderId
    ? (fulfillmentModeRaw === 'full_now' ? 'full_now' : 'available_now')
    : 'full_now';

  const customerIdFromBody = Number(b.customer_id || 0);
  const fallbackOrderUserId = Number(linkedOrder?.user_id || 0);
  const customerId = customerIdFromBody || fallbackOrderUserId || 0;
  let customer = customerId
    ? await dbGetAsync('SELECT id, name, email, phone, address, role FROM users WHERE id = ?', [customerId])
    : null;

  if (!customer && linkedOrderId) {
    customer = {
      id: customerId || null,
      name: String(linkedOrder?.customer_name || '').trim() || 'Customer',
      email: normalizeEmail(linkedOrder?.customer_email),
      phone: normalizePhone(linkedOrder?.customer_phone),
      address: linkedOrder?.shipping_address || null,
      role: 'customer',
    };
  }
  if (!customer) throw createHttpError(400, 'customer not found');
  if (!String(customer.name || '').trim()) throw createHttpError(400, 'Customer name is required');

  return {
    dedupe: null,
    context: {
      clientRequestId,
      linkedOrderId,
      linkedOrderItems,
      items,
      billType,
      fulfillmentMode,
      customer,
      customerName: String(customer.name || '').trim(),
      customerEmail: normalizeEmail(customer.email),
      customerPhone: normalizePhone(customer.phone),
      customerAddress: customer.address ? String(customer.address).trim() : null,
      requestBody: b,
    },
  };
};

module.exports = { buildBillContext };
