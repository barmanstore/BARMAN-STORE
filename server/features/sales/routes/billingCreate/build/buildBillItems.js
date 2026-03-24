const {
  loadActiveOffers,
  resolveOfferEligibilityContext,
  previewOfferPricing,
} = require('../../../../offers/offerEngine');

const { sanitizeBillItems } = require('./items/sanitizeItems');
const { buildLinkedFulfilledRemaining } = require('./items/linkedFulfillment');
const { buildItemFulfillmentRows } = require('./items/buildFulfillmentRows');
const { buildSalesStockSnapshot } = require('./items/buildSalesStock');

const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;
const getLinkedOrderRequestedQty = (item = {}) =>
  Math.max(0, Number(item?.requested_qty ?? item?.quantity ?? item?.qty ?? 0));
const getLinkedOrderFallbackKey = (item = {}) => {
  const productId = Number(item?.product_id || 0);
  const unitKey = String(item?.uom || item?.unit || 'pcs').trim().toLowerCase() || 'pcs';
  const requestedQty = getLinkedOrderRequestedQty(item);
  if (productId > 0) {
    return `product:${productId}:${unitKey}:${requestedQty}`;
  }
  const nameKey = String(item?.product_name || '').trim().toLowerCase();
  if (!nameKey) return '';
  return `custom:${nameKey}:${unitKey}:${requestedQty}`;
};

const buildLinkedOrderMatchers = (linkedOrderItems = []) => {
  const byId = new Map();
  const byFallbackKey = new Map();
  const duplicateFallbackKeys = new Set();

  linkedOrderItems.forEach((item) => {
    const orderItemId = Number(item?.id || 0);
    if (orderItemId > 0) {
      byId.set(orderItemId, item);
    }

    const fallbackKey = getLinkedOrderFallbackKey(item);
    if (!fallbackKey) return;
    if (byFallbackKey.has(fallbackKey)) {
      byFallbackKey.delete(fallbackKey);
      duplicateFallbackKeys.add(fallbackKey);
      return;
    }
    if (!duplicateFallbackKeys.has(fallbackKey)) {
      byFallbackKey.set(fallbackKey, item);
    }
  });

  return { byId, byFallbackKey };
};

const resolveLinkedOrderItemForBilling = ({
  item,
  linkedOrderMatchers,
  usedLinkedOrderItemIds,
  createHttpError,
}) => {
  const explicitLinkedOrderItemId = Number(item?.linked_order_item_id || 0);
  if (explicitLinkedOrderItemId > 0) {
    const matchedById = linkedOrderMatchers.byId.get(explicitLinkedOrderItemId) || null;
    if (!matchedById) {
      throw createHttpError(400, `Linked order item ${explicitLinkedOrderItemId} is invalid for this order`);
    }
    if (usedLinkedOrderItemIds.has(explicitLinkedOrderItemId)) {
      throw createHttpError(400, `Linked order item ${explicitLinkedOrderItemId} is duplicated in this bill`);
    }
    usedLinkedOrderItemIds.add(explicitLinkedOrderItemId);
    return matchedById;
  }

  const fallbackKey = getLinkedOrderFallbackKey(item);
  const matchedByFallback = fallbackKey
    ? linkedOrderMatchers.byFallbackKey.get(fallbackKey) || null
    : null;
  if (!matchedByFallback) {
    throw createHttpError(400, 'Each linked-order bill item must reference a valid order item');
  }

  const matchedOrderItemId = Number(matchedByFallback?.id || 0);
  if (matchedOrderItemId > 0) {
    if (usedLinkedOrderItemIds.has(matchedOrderItemId)) {
      throw createHttpError(400, `Linked order item ${matchedOrderItemId} is duplicated in this bill`);
    }
    usedLinkedOrderItemIds.add(matchedOrderItemId);
  }

  return matchedByFallback;
};

const buildBillItems = async (deps, context, createHttpError) => {
  const {
    dbAllAsync,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
  } = deps;
  const {
    items,
    billType,
    fulfillmentMode,
    customer,
    linkedOrderId,
    linkedOrderItems,
  } = context;

  // Explicit custom lines may be billed without product linkage across bill flows.
  const allowLineItemsWithoutProduct = true;
  const { sanitizedItems, productCache } = await sanitizeBillItems({
    deps,
    items,
    createHttpError,
    allowLineItemsWithoutProduct,
  });
  let pricedItems = [];
  if (linkedOrderId) {
      const linkedOrderMatchers = buildLinkedOrderMatchers(linkedOrderItems);
      const usedLinkedOrderItemIds = new Set();
      pricedItems = sanitizedItems.map((item) => {
        const linkedOrderItem = resolveLinkedOrderItemForBilling({
          item,
          linkedOrderMatchers,
          usedLinkedOrderItemIds,
          createHttpError,
        });
        const requestedQty = getLinkedOrderRequestedQty(linkedOrderItem);
        const lineSubtotal = roundMoney(Math.max(0, Number(linkedOrderItem?.line_subtotal || 0)));
        const offerDiscount = roundMoney(Math.max(0, Number(linkedOrderItem?.offer_discount || 0)));
        const manualDiscount = roundMoney(Math.max(0, Number(linkedOrderItem?.manual_discount || 0)));
        const storedAmount = roundMoney(Math.max(
          0,
          Number(linkedOrderItem?.total || (lineSubtotal - offerDiscount - manualDiscount) || 0)
        ));
        const totalDiscount = roundMoney(Math.min(
          lineSubtotal,
          Math.max(lineSubtotal - storedAmount, offerDiscount + manualDiscount)
        ));
        return {
          ...item,
          linked_order_item_id: Number(linkedOrderItem?.id || 0) || null,
          product_id: Number(linkedOrderItem?.product_id || 0) || null,
          product_name: String(linkedOrderItem?.product_name || item?.product_name || 'Item').trim() || 'Item',
          qty: requestedQty,
          unit: String(linkedOrderItem?.uom || item?.unit || 'pcs').trim() || 'pcs',
          mrp: requestedQty > 0
            ? roundMoney(lineSubtotal / requestedQty)
            : Math.max(0, Number(item?.mrp || 0)),
          line_subtotal: lineSubtotal,
          offer_discount: offerDiscount,
          manual_discount: manualDiscount,
          discount: totalDiscount,
          amount: storedAmount,
          offer_label: String(linkedOrderItem?.offer_label || '').trim() || null,
        };
      });
  } else {
    const activeOffers = await loadActiveOffers(dbAllAsync);
    const eligibilityContext = await resolveOfferEligibilityContext(deps.dbGetAsync, {
      customer_user_id: Number(customer?.id || 0) || null,
      exclude_order_id: Number(linkedOrderId || 0) || null,
    });
    const offerPreview = previewOfferPricing({
      items: sanitizedItems.map((item) => ({
        client_item_id: item.client_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.qty,
        qty: item.qty,
        unit: item.unit,
        unit_price_override: item.skip_offers ? item.mrp : undefined,
        manual_discount: item.manual_discount,
        skip_offers: item.skip_offers,
        item_type: item.product_id ? 'catalog' : 'custom',
      })),
      productsById: productCache,
      offers: activeOffers,
      offersArePrepared: true,
      eligibilityContext,
      includeTax: false,
    });
    const offerPreviewByClientId = new Map(
      (Array.isArray(offerPreview?.items) ? offerPreview.items : [])
        .map((line) => [String(line?.client_item_id), line])
    );
    pricedItems = sanitizedItems.map((item) => {
      const line = offerPreviewByClientId.get(String(item.client_item_id));
      if (!line) {
        const lineSubtotal = Number(item.mrp || 0) * Number(item.qty || 0);
        const manualDiscount = Math.min(lineSubtotal, Math.max(0, Number(item.manual_discount || 0)));
        return {
          ...item,
          line_subtotal: lineSubtotal,
          offer_discount: 0,
          discount: manualDiscount,
          amount: Math.max(0, lineSubtotal - manualDiscount),
          offer_label: null,
        };
      }
      return {
        ...item,
        mrp: Number(line.base_unit_price || item.mrp || 0),
        line_subtotal: Number(line.line_subtotal || 0),
        offer_discount: Number(line.auto_offer_discount || 0),
        manual_discount: Number(line.manual_discount || item.manual_discount || 0),
        discount: Number(line.line_discount_total || 0),
        amount: Number(line.line_total || 0),
        offer_label: String(line.best_offer_label || '').trim() || null,
      };
    });
  }

  const linkedFulfilledRemaining = buildLinkedFulfilledRemaining({ linkedOrderItems });

  const itemFulfillmentRows = buildItemFulfillmentRows({
    sanitizedItems: pricedItems,
    productCache,
    linkedOrderId,
    fulfillmentMode,
    linkedFulfilledRemaining,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
  });

  const { shouldApplySalesStock, salesQtyByProduct } = buildSalesStockSnapshot({
    billType,
    linkedOrderId,
    itemFulfillmentRows,
  });

  return {
    itemFulfillmentRows,
    shouldApplySalesStock,
    salesQtyByProduct,
  };
};

module.exports = { buildBillItems };
