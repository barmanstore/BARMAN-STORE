const { normalizeUomToken } = require('./normalizeUom');

const parseOrderItems = ({ items, parseBooleanEnv }) => {
  const parsedItems = items.map((it, index) => {
    const parsedProductId = Number(it?.product_id ?? it?.id ?? 0);
    const productId = Number.isFinite(parsedProductId) && parsedProductId > 0
      ? Math.trunc(parsedProductId)
      : null;
    let quantity = Number(it?.quantity || 0);
    const providedName = String(it?.product_name || it?.name || '').trim();
    const quantityLabel = String(it?.quantity_label || it?.qty_text || '').trim();
    const itemType = String(it?.item_type || '').trim().toLowerCase();
    const manualHint = parseBooleanEnv(it?.is_manual, false) || itemType === 'manual';
    const isManual = manualHint || !productId;
    if ((!Number.isFinite(quantity) || quantity <= 0) && quantityLabel) {
      const quantityFromLabel = Number(String(quantityLabel).match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
      if (Number.isFinite(quantityFromLabel) && quantityFromLabel > 0) {
        quantity = quantityFromLabel;
      }
    }
    const rawPrice = Number(it?.price);
    const priceUnknownHint = parseBooleanEnv(it?.price_unknown, false) || parseBooleanEnv(it?.unknown_price, false);
    let price = Number.isFinite(rawPrice) ? rawPrice : NaN;
    if (isManual && (priceUnknownHint || !Number.isFinite(price) || price < 0)) {
      price = 0;
    }
    return {
      line_index: index,
      // Keep backward compatibility for older schemas where product_id can still be NOT NULL.
      // product_id=0 is treated as manual everywhere in this codebase.
      product_id: isManual ? 0 : productId,
      product_name: providedName,
      quantity,
      price,
      is_manual: isManual ? 1 : 0,
      uom: normalizeUomToken(it?.uom, 'pcs'),
    };
  });

  if (parsedItems.some((it) => it.quantity <= 0 || !Number.isFinite(it.quantity))) {
    throw new Error('Invalid order items');
  }
  if (parsedItems.some((it) => it.price < 0 || !Number.isFinite(it.price))) {
    throw new Error('Invalid order items');
  }
  if (parsedItems.some((it) => it.is_manual === 1 && !it.product_name)) {
    throw new Error('Manual order items must include a product name');
  }

  return parsedItems;
};

module.exports = { parseOrderItems };
