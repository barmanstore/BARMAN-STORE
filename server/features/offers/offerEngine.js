const ACTIVE_OFFER_STATUSES = new Set(['active']);
const SUPPORTED_OFFER_TYPES = new Set(['percentage', 'fixed', 'volume', 'bogo', 'bundle']);
const GLOBAL_OFFER_SCOPE_TOKENS = new Set(['all', '*', 'global', 'all categories', 'all category', 'storewide', 'store wide']);
const ACTIVE_OFFER_CACHE_TTL_MS = 30 * 1000;

let activeOfferCache = {
  at: 0,
  rows: [],
};

const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;
const normalizeTextToken = (value = '') => String(value || '').trim().toLowerCase();
const isTruthyFlag = (value = false) => {
  if (value === true || value === 1) return true;
  const token = normalizeTextToken(value);
  return token === 'true' || token === '1' || token === 'yes';
};
const normalizeOfferType = (value = '') => {
  const token = normalizeTextToken(value);
  if (SUPPORTED_OFFER_TYPES.has(token)) return token;
  return 'percentage';
};
const normalizeOfferStatus = (value = '') => {
  const token = normalizeTextToken(value);
  return token || 'inactive';
};
const toPositiveInteger = (value, fallback = 0) => {
  const numeric = Math.floor(Number(value || 0));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};
const toMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMoney(numeric) : fallback;
};
const clampDiscount = (discountAmount = 0, subtotal = 0) =>
  roundMoney(Math.max(0, Math.min(Number(discountAmount || 0), Number(subtotal || 0))));
const normalizeUnitToken = (value = '', fallback = 'pcs') =>
  String(value || fallback).trim().toLowerCase() || fallback;
const clampPercent = (value = 0) => Math.max(0, Math.min(100, Number(value || 0)));
const isFiniteMoney = (value) => Number.isFinite(Number(value));

const toDateToken = (value = null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const token = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(token) ? token : '';
};

const toTimestampIso = (value = null) => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
};

const getTodayDateToken = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isOfferActiveForDate = (offer = {}, dateToken = null, currentTimestamp = null) => {
  const now = currentTimestamp instanceof Date
    ? currentTimestamp
    : currentTimestamp
      ? new Date(currentTimestamp)
      : new Date();
  const resolvedDateToken = dateToken || getTodayDateToken(now);
  const currentIso = toTimestampIso(now) || now.toISOString();
  const status = normalizeOfferStatus(offer.status);
  if (!ACTIVE_OFFER_STATUSES.has(status)) return false;
  const startAt = toTimestampIso(offer.start_at);
  const endAt = toTimestampIso(offer.end_at);
  const startDate = toDateToken(offer.start_date);
  const endDate = toDateToken(offer.end_date);
  if (startAt && startAt > currentIso) return false;
  if (endAt && endAt < currentIso) return false;
  if (startDate && startDate > resolvedDateToken) return false;
  if (endDate && endDate < resolvedDateToken) return false;
  return true;
};

const getProductCategoryTokens = (product = {}) => {
  const rawTokens = [
    product?.category,
    product?.subcategory,
  ];
  const expandedTokens = [];
  rawTokens.forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    expandedTokens.push(raw);
    if (raw.includes('/')) {
      raw.split('/').map((part) => part.trim()).filter(Boolean).forEach((part) => expandedTokens.push(part));
    }
    if (raw.includes('>')) {
      raw.split('>').map((part) => part.trim()).filter(Boolean).forEach((part) => expandedTokens.push(part));
    }
  });
  return new Set(expandedTokens.map(normalizeTextToken).filter(Boolean));
};

const isSimpleScopedOfferType = (offer = {}) => {
  const type = normalizeOfferType(offer?.type);
  return type === 'percentage' || type === 'fixed' || type === 'volume';
};

const isGlobalOfferScope = (offer = {}) => {
  const scopedProductId = Number(offer?.apply_to_product || 0);
  if (scopedProductId > 0) return false;
  const scopedCategory = normalizeTextToken(offer?.apply_to_category);
  if (GLOBAL_OFFER_SCOPE_TOKENS.has(scopedCategory)) return true;
  // Backward-compatible handling for legacy simple price offers saved without a scope.
  return !scopedCategory && isSimpleScopedOfferType(offer);
};

const matchesOfferScope = (offer = {}, product = null) => {
  if (!product) return false;
  if (isGlobalOfferScope(offer)) return true;
  const productId = Number(product?.id || 0);
  const scopedProductId = Number(offer.apply_to_product || 0);
  if (scopedProductId > 0) {
    return scopedProductId === productId;
  }
  const scopedCategory = normalizeTextToken(offer.apply_to_category);
  if (scopedCategory) {
    return getProductCategoryTokens(product).has(scopedCategory);
  }
  return false;
};

const getOfferBuyProductId = (offer = {}) => Number(offer.buy_product_id || 0) || Number(offer.apply_to_product || 0) || 0;
const getOfferGetProductId = (offer = {}) => Number(offer.get_product_id || 0) || Number(offer.apply_to_product || 0) || 0;

const productMatchesOfferForBadge = (offer = {}, product = null) => {
  if (!product) return false;
  if (matchesOfferScope(offer, product)) return true;
  const productId = Number(product?.id || 0);
  return productId > 0
    && (productId === getOfferBuyProductId(offer) || productId === getOfferGetProductId(offer));
};

const getOfferLabel = (offer = {}) => {
  const type = normalizeOfferType(offer.type);
  const value = toMoney(offer.value, 0);
  const minQuantity = toPositiveInteger(offer.min_quantity, 1) || 1;
  const buyQuantity = toPositiveInteger(offer.buy_quantity, 1) || 1;
  const getQuantity = toPositiveInteger(offer.get_quantity, 1) || 1;
  let label = '';

  if (type === 'bogo') {
    label = `Buy ${buyQuantity}, get ${getQuantity} free`;
  } else if (type === 'bundle') {
    label = value > 0
      ? `Bundle save ${clampPercent(value)}%`
      : `Bundle on ${buyQuantity} + ${getQuantity}`;
  } else if (type === 'fixed') {
    label = minQuantity > 1
      ? `Buy ${minQuantity}+ save Rs ${value}`
      : `Save Rs ${value}`;
  } else if (type === 'volume') {
    label = `Buy ${minQuantity}+ save ${clampPercent(value)}%`;
  } else {
    label = minQuantity > 1
      ? `Buy ${minQuantity}+ save ${clampPercent(value)}%`
      : `${clampPercent(value)}% OFF`;
  }

  if (isTruthyFlag(offer.first_order_only)) {
    return `${label} | First order only`;
  }
  return label;
};

const getOfferPriorityScore = (offer = {}) => {
  const type = normalizeOfferType(offer.type);
  if (type === 'bogo') return 400;
  if (type === 'bundle') return 300;
  if (type === 'volume') return 200;
  if (type === 'percentage') return 100;
  if (type === 'fixed') return 90;
  return 0;
};

const sortOffersForSelection = (offers = []) => {
  return [...offers].sort((a, b) => {
    const priorityDiff = getOfferPriorityScore(b) - getOfferPriorityScore(a);
    if (priorityDiff !== 0) return priorityDiff;
    const createdAtA = Date.parse(a?.created_at || '') || 0;
    const createdAtB = Date.parse(b?.created_at || '') || 0;
    if (createdAtA !== createdAtB) return createdAtB - createdAtA;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
};

const isOfferEligibleForPricing = (offer = {}, eligibilityContext = null) => {
  if (!isTruthyFlag(offer?.first_order_only)) return true;
  return eligibilityContext?.is_first_order_customer === true;
};

const prepareOffersForEvaluation = (
  offers = [],
  {
    offersArePrepared = false,
    eligibilityContext = null,
    enforceEligibility = false,
  } = {}
) => {
  const preparedOffers = offersArePrepared
    ? (Array.isArray(offers) ? offers.filter(Boolean) : [])
    : sortOffersForSelection(
    (Array.isArray(offers) ? offers : [])
      .map(normalizeOfferRecord)
      .filter((offer) => isOfferActiveForDate(offer))
  );
  if (!enforceEligibility) return preparedOffers;
  return preparedOffers.filter((offer) => isOfferEligibleForPricing(offer, eligibilityContext));
};

const normalizeOfferRecord = (offer = {}) => ({
  ...offer,
  id: Number(offer?.id || 0) || null,
  name: String(offer?.name || '').trim() || 'Offer',
  description: String(offer?.description || '').trim(),
  type: normalizeOfferType(offer?.type),
  value: toMoney(offer?.value, 0),
  min_quantity: toPositiveInteger(offer?.min_quantity, 1) || 1,
  apply_to_category: String(offer?.apply_to_category || '').trim() || null,
  apply_to_product: Number(offer?.apply_to_product || 0) || null,
  buy_product_id: Number(offer?.buy_product_id || 0) || null,
  buy_quantity: toPositiveInteger(offer?.buy_quantity, 1) || 1,
  get_product_id: Number(offer?.get_product_id || 0) || null,
  get_quantity: toPositiveInteger(offer?.get_quantity, 1) || 1,
  start_date: toDateToken(offer?.start_date) || null,
  end_date: toDateToken(offer?.end_date) || null,
  start_at: toTimestampIso(offer?.start_at) || null,
  end_at: toTimestampIso(offer?.end_at) || null,
  status: normalizeOfferStatus(offer?.status),
  first_order_only: isTruthyFlag(offer?.first_order_only),
  label: getOfferLabel(offer),
});

const resolveOfferEligibilityContext = async (dbGetAsync, context = {}) => {
  const customerUserId = Number(
    context?.customer_user_id
    || context?.customerUserId
    || context?.user_id
    || context?.userId
    || 0
  ) || 0;
  const excludeOrderId = Number(
    context?.exclude_order_id
    || context?.excludeOrderId
    || context?.order_id
    || context?.orderId
    || 0
  ) || 0;

  if (!(customerUserId > 0) || typeof dbGetAsync !== 'function') {
    return {
      customer_user_id: customerUserId || null,
      exclude_order_id: excludeOrderId || null,
      is_first_order_customer: null,
    };
  }

  const existingOrder = excludeOrderId > 0
    ? await dbGetAsync(
      `SELECT id
       FROM orders
       WHERE user_id = ?
         AND id <> ?
       LIMIT 1`,
      [customerUserId, excludeOrderId]
    )
    : await dbGetAsync(
      `SELECT id
       FROM orders
       WHERE user_id = ?
       LIMIT 1`,
      [customerUserId]
    );

  return {
    customer_user_id: customerUserId,
    exclude_order_id: excludeOrderId || null,
    is_first_order_customer: !existingOrder,
  };
};

const getUomFamily = (baseUnit = 'pcs') => {
  const normalizedBase = normalizeUnitToken(baseUnit, 'pcs');
  if (normalizedBase === 'pcs') {
    return { normalizedBase, multipliers: { pcs: 1, dozen: 12 } };
  }
  if (normalizedBase === 'kg' || normalizedBase === 'g') {
    return { normalizedBase: 'kg', multipliers: { kg: 1, g: 0.001 } };
  }
  if (normalizedBase === 'l' || normalizedBase === 'ml') {
    return { normalizedBase: 'l', multipliers: { l: 1, ml: 0.001 } };
  }
  return null;
};

const convertQtyBetweenFamilyUnits = (qty, fromUnit, toUnit, baseUnit = 'pcs') => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const family = getUomFamily(baseUnit);
  if (!family) return null;
  const from = normalizeUnitToken(fromUnit, family.normalizedBase);
  const to = normalizeUnitToken(toUnit, family.normalizedBase);
  const fromMultiplier = family.multipliers[from];
  const toMultiplier = family.multipliers[to];
  if (!Number.isFinite(fromMultiplier) || !Number.isFinite(toMultiplier) || toMultiplier <= 0) {
    return null;
  }
  return (numericQty * fromMultiplier) / toMultiplier;
};

const getProductUnitProfile = (product = null) => {
  const sellingUnit = normalizeUnitToken(product?.uom, 'pcs');
  const baseUnit = normalizeUnitToken(product?.base_unit, sellingUnit);
  const conversionFactorRaw = Number(product?.conversion_factor ?? 1);
  const conversionFactor = Number.isFinite(conversionFactorRaw) && conversionFactorRaw > 0
    ? conversionFactorRaw
    : 1;
  return {
    sellingUnit,
    baseUnit,
    conversionFactor,
  };
};

const toPricingQty = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const profile = getProductUnitProfile(product);
  const inputUnit = normalizeUnitToken(unit, profile.sellingUnit);
  const familyConverted = convertQtyBetweenFamilyUnits(numericQty, inputUnit, profile.baseUnit, profile.baseUnit);
  if (familyConverted !== null) return familyConverted;
  if (inputUnit === profile.baseUnit) return numericQty;
  if (inputUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

const loadActiveOffers = async (dbAllAsync, { useCache = true } = {}) => {
  if (
    useCache
    && activeOfferCache.at > 0
    && (Date.now() - activeOfferCache.at) < ACTIVE_OFFER_CACHE_TTL_MS
    && Array.isArray(activeOfferCache.rows)
  ) {
    return activeOfferCache.rows;
  }

  const rows = await dbAllAsync(
    `SELECT *
     FROM offers
     WHERE status = 'active'
       AND (start_at IS NULL OR start_at <= CURRENT_TIMESTAMP)
       AND (end_at IS NULL OR end_at >= CURRENT_TIMESTAMP)
       AND (start_date IS NULL OR start_date <= CURRENT_DATE)
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
     ORDER BY created_at DESC, id DESC`
  );
  const normalized = sortOffersForSelection((Array.isArray(rows) ? rows : []).map(normalizeOfferRecord));
  activeOfferCache = {
    at: Date.now(),
    rows: normalized,
  };
  return normalized;
};

const invalidateActiveOfferCache = () => {
  activeOfferCache = {
    at: 0,
    rows: [],
  };
};

const loadProductsByIds = async (dbAllAsync, productIds = []) => {
  const uniqueProductIds = [...new Set(
    productIds
      .map((value) => Number(value || 0))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
  if (!uniqueProductIds.length) {
    return new Map();
  }
  const placeholders = uniqueProductIds.map(() => '?').join(', ');
  const rows = await dbAllAsync(
    `SELECT id, name, price, mrp, category, subcategory, uom, base_unit, conversion_factor
     FROM products
     WHERE id IN (${placeholders})`,
    uniqueProductIds
  );
  return new Map(
    (Array.isArray(rows) ? rows : [])
      .map((row) => [Number(row?.id || 0), row])
      .filter(([id]) => id > 0)
  );
};

const buildSimpleOfferCandidate = (offer = {}, line = {}) => {
  if (!line?.product || !matchesOfferScope(offer, line.product)) return null;
  const minQuantity = toPositiveInteger(offer.min_quantity, 1) || 1;
  if (Number(line.pricingQty || 0) < minQuantity) return null;

  const type = normalizeOfferType(offer.type);
  const subtotal = Number(line.lineSubtotal || 0);
  const value = toMoney(offer.value, 0);
  let discountAmount = 0;

  if (type === 'percentage' || type === 'volume') {
    discountAmount = subtotal * (clampPercent(value) / 100);
  } else if (type === 'fixed') {
    discountAmount = value * Number(line.pricingQty || 0);
  } else {
    return null;
  }

  const clampedDiscount = clampDiscount(discountAmount, subtotal);
  if (clampedDiscount <= 0) return null;
  return {
    lineIndex: line.lineIndex,
    offerId: offer.id,
    offerName: offer.name,
    offerType: type,
    label: offer.label || getOfferLabel(offer),
    discountAmount: clampedDiscount,
  };
};

const buildCrossItemOfferCandidates = (offer = {}, lines = []) => {
  const type = normalizeOfferType(offer.type);
  if (type !== 'bogo' && type !== 'bundle') return [];

  const buyProductId = getOfferBuyProductId(offer);
  const getProductId = getOfferGetProductId(offer);
  if (buyProductId <= 0 || getProductId <= 0) return [];

  const buyQuantity = toPositiveInteger(offer.buy_quantity, 1) || 1;
  const getQuantity = toPositiveInteger(offer.get_quantity, 1) || 1;
  const eligibleBuyLines = lines.filter((line) =>
    !line.skipAutoOffers && Number(line?.product?.id || 0) === buyProductId
  );
  const eligibleGetLines = lines.filter((line) =>
    !line.skipAutoOffers && Number(line?.product?.id || 0) === getProductId
  );
  if (!eligibleBuyLines.length || !eligibleGetLines.length) return [];

  const buyQtyTotal = eligibleBuyLines.reduce((sum, line) => sum + Math.floor(Number(line.pricingQty || 0)), 0);
  const getQtyTotal = eligibleGetLines.reduce((sum, line) => sum + Math.floor(Number(line.pricingQty || 0)), 0);
  let eligibleGroupCount = 0;

  if (buyProductId === getProductId) {
    const combinedThreshold = buyQuantity + getQuantity;
    eligibleGroupCount = combinedThreshold > 0 ? Math.floor(getQtyTotal / combinedThreshold) : 0;
  } else {
    eligibleGroupCount = buyQuantity > 0 ? Math.floor(buyQtyTotal / buyQuantity) : 0;
  }

  const discountedUnitsTotal = Math.min(getQtyTotal, eligibleGroupCount * getQuantity);
  if (discountedUnitsTotal <= 0) return [];

  const percentMultiplier = type === 'bundle'
    ? (clampPercent(offer.value) / 100)
    : 1;
  if (percentMultiplier <= 0) return [];

  let remainingUnits = discountedUnitsTotal;
  const candidates = [];
  for (const line of eligibleGetLines) {
    if (remainingUnits <= 0) break;
    const lineUnits = Math.floor(Number(line.pricingQty || 0));
    if (lineUnits <= 0) continue;
    const discountedUnits = Math.min(lineUnits, remainingUnits);
    remainingUnits -= discountedUnits;
    const rawDiscountAmount = discountedUnits * Number(line.unitPrice || 0) * percentMultiplier;
    const discountAmount = clampDiscount(rawDiscountAmount, Number(line.lineSubtotal || 0));
    if (discountAmount <= 0) continue;
    candidates.push({
      lineIndex: line.lineIndex,
      offerId: offer.id,
      offerName: offer.name,
      offerType: type,
      label: offer.label || getOfferLabel(offer),
      discountAmount,
      discountedUnits,
    });
  }

  return candidates;
};

const pickBestCandidateByLine = (lines = [], candidateGroups = []) => {
  const bestByLineIndex = new Map();
  candidateGroups.flat().forEach((candidate) => {
    if (!candidate || candidate.discountAmount <= 0) return;
    const existing = bestByLineIndex.get(candidate.lineIndex);
    if (!existing || Number(candidate.discountAmount || 0) > Number(existing.discountAmount || 0)) {
      bestByLineIndex.set(candidate.lineIndex, candidate);
    }
  });

  return lines.map((line) => bestByLineIndex.get(line.lineIndex) || null);
};

const previewOfferPricing = ({
  items = [],
  productsById = new Map(),
  offers = [],
  offersArePrepared = false,
  eligibilityContext = null,
  includeTax = false,
  taxRate = 0.1,
} = {}) => {
  const normalizedLines = (Array.isArray(items) ? items : []).map((item, index) => {
    const lineIndex = index;
    const productId = Number(item?.product_id || item?.productId || 0) || null;
    const product = productId ? (productsById.get(productId) || null) : null;
    const quantity = Math.max(0, Number(item?.quantity ?? item?.qty ?? 0) || 0);
    const unit = normalizeUnitToken(item?.unit || item?.uom || product?.uom || 'pcs', product?.uom || 'pcs');
    const pricingQty = product ? toPricingQty(quantity, unit, product) : quantity;
    const itemTypeToken = normalizeTextToken(item?.item_type || item?.type || (product ? 'catalog' : 'custom'));
    const itemType = itemTypeToken === 'manual' || itemTypeToken === 'custom' ? itemTypeToken : 'catalog';
    const defaultUnitPrice = product ? Math.max(0, Number(product?.price || 0)) : 0;
    const rawUnitPriceOverride = item?.unit_price_override ?? item?.price ?? item?.mrp;
    const unitPriceOverride = isFiniteMoney(rawUnitPriceOverride)
      ? Math.max(0, Number(rawUnitPriceOverride ?? 0))
      : null;
    const unitPrice = unitPriceOverride !== null ? unitPriceOverride : defaultUnitPrice;
    const lineSubtotal = roundMoney(unitPrice * pricingQty);
    const manualDiscountRequested = Math.max(0, Number(item?.manual_discount ?? item?.discount ?? 0) || 0);
    const manualDiscount = clampDiscount(manualDiscountRequested, lineSubtotal);
    const skipAutoOffers = Boolean(item?.skip_offers)
      || itemType !== 'catalog'
      || !product
      || Boolean(Number(item?.price_unknown || 0))
      || (unitPriceOverride !== null && Math.abs(unitPriceOverride - defaultUnitPrice) > 0.009);

    return {
      lineIndex,
      clientItemId: item?.client_item_id ?? item?.clientItemId ?? item?.id ?? lineIndex,
      productId,
      product,
      productName: String(item?.product_name || item?.name || product?.name || 'Item').trim() || 'Item',
      quantity,
      unit,
      pricingQty,
      itemType,
      unitPrice,
      defaultUnitPrice,
      lineSubtotal,
      manualDiscount,
      skipAutoOffers,
    };
  }).filter((line) => line.quantity > 0);

  const activeOffers = prepareOffersForEvaluation(offers, {
    offersArePrepared,
    eligibilityContext,
    enforceEligibility: true,
  });

  const candidateGroups = [];
  activeOffers.forEach((offer) => {
    const type = normalizeOfferType(offer.type);
    if (type === 'percentage' || type === 'fixed' || type === 'volume') {
      candidateGroups.push(normalizedLines.map((line) => buildSimpleOfferCandidate(offer, line)));
      return;
    }
    if (type === 'bogo' || type === 'bundle') {
      candidateGroups.push(buildCrossItemOfferCandidates(offer, normalizedLines));
    }
  });

  const bestCandidates = pickBestCandidateByLine(normalizedLines, candidateGroups);
  const lines = normalizedLines.map((line, index) => {
    const offerCandidate = bestCandidates[index];
    const autoOfferDiscount = clampDiscount(Number(offerCandidate?.discountAmount || 0), line.lineSubtotal);
    const manualDiscount = clampDiscount(line.manualDiscount, Math.max(0, line.lineSubtotal - autoOfferDiscount));
    const lineDiscountTotal = clampDiscount(autoOfferDiscount + manualDiscount, line.lineSubtotal);
    const lineTotal = roundMoney(Math.max(0, line.lineSubtotal - lineDiscountTotal));
    const effectiveUnitPrice = line.pricingQty > 0 ? roundMoney(lineTotal / line.pricingQty) : 0;
    return {
      line_index: line.lineIndex,
      client_item_id: line.clientItemId,
      product_id: line.productId,
      product_name: line.productName,
      quantity: line.quantity,
      unit: line.unit,
      pricing_qty: roundMoney(line.pricingQty),
      item_type: line.itemType,
      base_unit_price: roundMoney(line.unitPrice),
      line_subtotal: roundMoney(line.lineSubtotal),
      auto_offer_discount: autoOfferDiscount,
      manual_discount: manualDiscount,
      line_discount_total: lineDiscountTotal,
      line_total: lineTotal,
      effective_unit_price: effectiveUnitPrice,
      best_offer_id: offerCandidate?.offerId || null,
      best_offer_name: offerCandidate?.offerName || null,
      best_offer_type: offerCandidate?.offerType || null,
      best_offer_label: offerCandidate?.label || null,
    };
  });

  const baseSubtotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.line_subtotal || 0), 0));
  const autoOfferDiscountTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.auto_offer_discount || 0), 0));
  const manualDiscountTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.manual_discount || 0), 0));
  const discountTotal = roundMoney(lines.reduce((sum, line) => sum + Number(line.line_discount_total || 0), 0));
  const netSubtotal = roundMoney(Math.max(0, baseSubtotal - discountTotal));
  const normalizedTaxRate = includeTax ? Math.max(0, Number(taxRate || 0)) : 0;
  const taxAmount = roundMoney(netSubtotal * normalizedTaxRate);
  const grandTotal = roundMoney(netSubtotal + taxAmount);

  return {
    items: lines,
    summary: {
      base_subtotal: baseSubtotal,
      auto_offer_discount_total: autoOfferDiscountTotal,
      manual_discount_total: manualDiscountTotal,
      discount_total: discountTotal,
      net_subtotal: netSubtotal,
      tax_rate: normalizedTaxRate,
      tax_amount: taxAmount,
      total: grandTotal,
    },
  };
};

const getSimpleDisplayPriceForOffer = (product = {}, offer = {}) => {
  const type = normalizeOfferType(offer.type);
  if (type !== 'percentage' && type !== 'fixed') return null;
  const minQuantity = toPositiveInteger(offer.min_quantity, 1) || 1;
  if (minQuantity > 1) return null;

  const basePrice = Math.max(0, Number(product?.price || 0));
  const pricingQty = toPricingQty(1, product?.uom || 'pcs', product);
  if (!(pricingQty > 0)) return null;

  const baseSubtotal = roundMoney(basePrice * pricingQty);
  const value = toMoney(offer.value, 0);
  const rawDiscount = type === 'percentage'
    ? baseSubtotal * (clampPercent(value) / 100)
    : value * pricingQty;
  const discountAmount = clampDiscount(rawDiscount, baseSubtotal);
  const lineTotal = roundMoney(Math.max(0, baseSubtotal - discountAmount));
  return roundMoney(lineTotal / pricingQty);
};

const buildProductOfferDisplay = (product = {}, offers = [], { offersArePrepared = false } = {}) => {
  const normalizedOffers = prepareOffersForEvaluation(offers, { offersArePrepared })
    .filter((offer) => productMatchesOfferForBadge(offer, product));

  const badges = normalizedOffers.map((offer) => offer.label || getOfferLabel(offer)).filter(Boolean).slice(0, 3);
  const basePrice = Math.max(0, Number(product?.price || 0));
  let displayPrice = basePrice;
  let originalPrice = Math.max(basePrice, Number(product?.mrp || basePrice || 0));
  let priceOfferId = null;
  let priceOfferLabel = null;

  normalizedOffers.forEach((offer) => {
    if (!matchesOfferScope(offer, product)) return;
    const candidatePrice = Number(getSimpleDisplayPriceForOffer(product, offer) || basePrice);
    if (candidatePrice > 0 && candidatePrice < displayPrice) {
      displayPrice = candidatePrice;
      originalPrice = basePrice;
      priceOfferId = offer.id;
      priceOfferLabel = offer.label || getOfferLabel(offer);
    }
  });

  return {
    badges,
    has_offer: badges.length > 0,
    display_price: roundMoney(displayPrice),
    original_price: roundMoney(displayPrice < basePrice ? originalPrice : Math.max(basePrice, Number(product?.mrp || basePrice || 0))),
    savings_amount: roundMoney(Math.max(0, (displayPrice < basePrice ? originalPrice : basePrice) - displayPrice)),
    display_offer_id: priceOfferId,
    display_offer_label: priceOfferLabel,
  };
};

const decorateProductWithOffers = (product = {}, offers = [], { offersArePrepared = false } = {}) => {
  const offerDisplay = buildProductOfferDisplay(product, offers, { offersArePrepared });
  return {
    ...product,
    offer_display: offerDisplay,
    active_offer_labels: Array.isArray(offerDisplay?.badges) ? offerDisplay.badges : [],
  };
};

module.exports = {
  SUPPORTED_OFFER_TYPES,
  normalizeOfferType,
  normalizeOfferStatus,
  normalizeOfferRecord,
  isOfferActiveForDate,
  getOfferLabel,
  getProductUnitProfile,
  toPricingQty,
  loadActiveOffers,
  invalidateActiveOfferCache,
  loadProductsByIds,
  resolveOfferEligibilityContext,
  previewOfferPricing,
  buildProductOfferDisplay,
  decorateProductWithOffers,
};
