const toMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getProductOfferDisplay = (product = null) => {
  const offerDisplay = product?.offer_display;
  if (!offerDisplay || typeof offerDisplay !== 'object') return null;
  return offerDisplay;
};

const getProductDisplayPrice = (product = null) => {
  const offerDisplay = getProductOfferDisplay(product);
  const candidate = toMoney(offerDisplay?.display_price, NaN);
  if (Number.isFinite(candidate) && candidate >= 0) return candidate;
  return Math.max(0, toMoney(product?.price, 0));
};

const getProductOriginalPrice = (product = null) => {
  const offerDisplay = getProductOfferDisplay(product);
  const displayPrice = getProductDisplayPrice(product);
  const candidate = toMoney(offerDisplay?.original_price, NaN);
  if (Number.isFinite(candidate) && candidate > displayPrice) return candidate;
  const mrp = Math.max(0, toMoney(product?.mrp, 0));
  return mrp > displayPrice ? mrp : displayPrice;
};

const getProductOfferLabel = (product = null) => {
  const offerDisplay = getProductOfferDisplay(product);
  const explicitLabel = String(offerDisplay?.display_offer_label || '').trim();
  if (explicitLabel) return explicitLabel;
  const labels = Array.isArray(product?.active_offer_labels)
    ? product.active_offer_labels
    : Array.isArray(offerDisplay?.badges)
      ? offerDisplay.badges
      : [];
  return String(labels[0] || '').trim();
};

const getProductOfferBadges = (product = null) => {
  const offerDisplay = getProductOfferDisplay(product);
  const labels = Array.isArray(offerDisplay?.badges)
    ? offerDisplay.badges
    : Array.isArray(product?.active_offer_labels)
      ? product.active_offer_labels
      : [];
  return labels.map((label) => String(label || '').trim()).filter(Boolean);
};

const getPreviewLineMap = (preview = null) => {
  const lines = Array.isArray(preview?.items) ? preview.items : [];
  return new Map(
    lines.map((line) => [String(line?.client_item_id ?? line?.line_index ?? ''), line])
  );
};

export {
  getProductOfferDisplay,
  getProductDisplayPrice,
  getProductOriginalPrice,
  getProductOfferLabel,
  getProductOfferBadges,
  getPreviewLineMap,
};
