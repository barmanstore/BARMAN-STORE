const {
  loadActiveOffers,
  loadProductsByIds,
  resolveOfferEligibilityContext,
  previewOfferPricing,
} = require('../offers/offerEngine');

const createOrderPlacement = (deps) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    parsePhoneInput,
    parseBooleanEnv,
    normalizePaymentMethod,
    generateOrderNumber,
    normalizeOrderPaymentStatus,
    ORDER_STATUS_ORDERED,
  } = deps;
  const { validateOrderPayload } = require('./orderPlacement/validatePayload');
  const { parseOrderItems } = require('./orderPlacement/parseItems');
  const { loadOrderStockSnapshots } = require('./orderPlacement/loadStockSnapshots');
  const { computeOrderTotals } = require('./orderPlacement/computeTotals');
  const { persistOrderPlacement } = require('./orderPlacement/persistOrder');

  const placeOrder = async (payload) => {
    const {
      user_id = null,
      customer_name,
      customer_email = '',
      customer_phone = null,
      shipping_address = {},
      items = [],
      payment_method = 'cash',
    } = payload;

    const { normalizedCustomerEmail, normalizedCustomerPhone } = await validateOrderPayload({
      payload,
      dbGetAsync,
      normalizeEmail,
      parsePhoneInput,
    });

    const parsedItems = parseOrderItems({ items, parseBooleanEnv });
    const { stockSnapshotByProductId } = await loadOrderStockSnapshots({
      parsedItems,
      dbGetAsync,
    });
    const pricedItems = await (async () => {
      const productIds = parsedItems
        .map((item) => Number(item?.product_id || 0))
        .filter((productId) => productId > 0);
      const [productsById, activeOffers] = await Promise.all([
        loadProductsByIds(dbAllAsync, productIds),
        loadActiveOffers(dbAllAsync),
      ]);
      const eligibilityContext = await resolveOfferEligibilityContext(dbGetAsync, {
        customer_user_id: Number(user_id || 0) || null,
      });
      const preview = previewOfferPricing({
        items: parsedItems.map((item) => ({
          client_item_id: item.line_index,
          product_id: Number(item?.product_id || 0) || null,
          product_name: item.product_name,
          quantity: Number(item.quantity || 0),
          unit: item.uom,
          unit_price_override:
            Number(item.is_manual || 0) === 1 ? Number(item.price || 0) : undefined,
          skip_offers: Number(item.is_manual || 0) === 1,
          item_type: Number(item.is_manual || 0) === 1 ? 'manual' : 'catalog',
          price_unknown: Number(item.is_manual || 0) === 1 && Number(item.price || 0) <= 0 ? 1 : 0,
        })),
        productsById,
        offers: activeOffers,
        offersArePrepared: true,
        eligibilityContext,
        includeTax: false,
      });
      const previewByIndex = new Map(
        (Array.isArray(preview?.items) ? preview.items : []).map((line) => [
          Number(line?.client_item_id),
          line,
        ])
      );
      return parsedItems.map((item) => {
        const line = previewByIndex.get(Number(item.line_index));
        if (!line) {
          return {
            ...item,
            line_subtotal: Math.max(0, Number(item.price || 0) * Number(item.quantity || 0)),
            line_total: Math.max(0, Number(item.price || 0) * Number(item.quantity || 0)),
            offer_discount: 0,
            manual_discount: 0,
            offer_label: null,
          };
        }
        const quantity = Math.max(1, Number(item.quantity || 0) || 1);
        const effectiveUnitPrice =
          quantity > 0 ? Math.round((Number(line.line_total || 0) / quantity) * 100) / 100 : 0;
        return {
          ...item,
          price: effectiveUnitPrice,
          line_subtotal: Math.max(0, Number(line.line_subtotal || 0)),
          line_total: Math.max(0, Number(line.line_total || 0)),
          offer_discount: Math.max(0, Number(line.auto_offer_discount || 0)),
          manual_discount: Math.max(0, Number(line.manual_discount || 0)),
          offer_label: String(line.best_offer_label || '').trim() || null,
        };
      });
    })();

    const totals = computeOrderTotals({
      parsedItems: pricedItems,
      paymentMethod: payment_method,
      normalizePaymentMethod,
      generateOrderNumber,
      ORDER_STATUS_ORDERED,
    });

    return persistOrderPlacement({
      dbRunAsync,
      dbTxAsync,
      normalizeOrderPaymentStatus,
      parsedItems: pricedItems,
      stockSnapshotByProductId,
      orderNumber: totals.orderNumber,
      userId: user_id,
      customerName: customer_name,
      customerEmail: normalizedCustomerEmail,
      customerPhone: normalizedCustomerPhone,
      shippingAddress: shipping_address,
      total: totals.total,
      createdStatus: totals.createdStatus,
      normalizedPaymentMethod: totals.normalizedPaymentMethod,
    });
  };

  return { placeOrder };
};

module.exports = { createOrderPlacement };
