const VALID_OFFER_STATUSES = new Set(['active', 'inactive']);

const toPositiveInteger = (value, fallback = 0) => {
  const numeric = Math.floor(Number(value || 0));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const toMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : fallback;
};

const normalizeDateToken = (value = null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const token = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(token) ? token : null;
};

const normalizeDateTimeToken = (value = null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const toBooleanFlag = (value = false) => {
  if (value === true || value === 1) return true;
  const token = String(value || '').trim().toLowerCase();
  return token === 'true' || token === '1' || token === 'yes' || token === 'on';
};

const validateOfferPayload = async ({
  payload,
  partial = false,
  dbGetAsync,
  normalizeOfferType,
  normalizeOfferStatus,
  SUPPORTED_OFFER_TYPES,
} = {}) => {
  const errors = [];
  const body = payload && typeof payload === 'object' ? payload : {};
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const rawType = String(body.type || '').trim().toLowerCase();
  const type = normalizeOfferType(body.type);
  const rawStatus = String(body.status || 'active').trim().toLowerCase();
  const status = normalizeOfferStatus(body.status || 'active');
  const value = toMoney(body.value, 0);
  const minQuantity = toPositiveInteger(body.min_quantity, 1) || 1;
  const applyToCategory = String(body.apply_to_category || '').trim() || null;
  const applyToProduct = Number(body.apply_to_product || 0) || null;
  const buyProductId = Number(body.buy_product_id || 0) || null;
  const buyQuantity = toPositiveInteger(body.buy_quantity, 1) || 1;
  const getProductId = Number(body.get_product_id || 0) || null;
  const getQuantity = toPositiveInteger(body.get_quantity, 1) || 1;
  const startAt = normalizeDateTimeToken(body.start_at);
  const endAt = normalizeDateTimeToken(body.end_at);
  const startDate = normalizeDateToken(body.start_date);
  const endDate = normalizeDateToken(body.end_date);
  const firstOrderOnly = toBooleanFlag(body.first_order_only);

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (!name) errors.push('name is required');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'type')) {
    if (!SUPPORTED_OFFER_TYPES.has(rawType)) errors.push('type is invalid');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (!VALID_OFFER_STATUSES.has(rawStatus)) errors.push('status must be active or inactive');
  }
  if (value < 0) errors.push('value must be zero or greater');
  if (minQuantity <= 0) errors.push('min_quantity must be at least 1');
  if (body.start_date && !startDate) errors.push('start_date must be YYYY-MM-DD');
  if (body.end_date && !endDate) errors.push('end_date must be YYYY-MM-DD');
  if (body.start_at && !startAt) errors.push('start_at must be a valid datetime');
  if (body.end_at && !endAt) errors.push('end_at must be a valid datetime');
  if (startDate && endDate && endDate < startDate) {
    errors.push('end_date must be on or after start_date');
  }
  if (startAt && endAt && endAt < startAt) {
    errors.push('end_at must be on or after start_at');
  }

  if (type === 'percentage') {
    if (value <= 0 || value > 100) errors.push('percentage offers require value between 0 and 100');
    if (!applyToCategory && !applyToProduct) errors.push('percentage offers require apply_to_category or apply_to_product');
  }
  if (type === 'fixed') {
    if (value <= 0) errors.push('fixed offers require a value greater than zero');
    if (!applyToCategory && !applyToProduct) errors.push('fixed offers require apply_to_category or apply_to_product');
  }
  if (type === 'volume') {
    if (value <= 0 || value > 100) errors.push('volume offers require value between 0 and 100');
    if (minQuantity <= 1) errors.push('volume offers require min_quantity greater than 1');
    if (!applyToCategory && !applyToProduct) errors.push('volume offers require apply_to_category or apply_to_product');
  }
  if (type === 'bogo') {
    if (!buyProductId || !getProductId) errors.push('bogo offers require buy_product_id and get_product_id');
  }
  if (type === 'bundle') {
    if (!buyProductId || !getProductId) errors.push('bundle offers require buy_product_id and get_product_id');
    if (value <= 0 || value > 100) errors.push('bundle offers require value between 0 and 100');
  }

  const referencedProductIds = [applyToProduct, buyProductId, getProductId]
    .map((productId) => Number(productId || 0))
    .filter((productId) => productId > 0);
  const uniqueReferencedProductIds = [...new Set(referencedProductIds)];

  if (uniqueReferencedProductIds.length) {
    const placeholders = uniqueReferencedProductIds.map(() => '?').join(', ');
    const existingProducts = await dbGetAsync(
      `SELECT array_agg(id) AS ids
       FROM products
       WHERE id IN (${placeholders})`,
      uniqueReferencedProductIds
    );
    const existingIds = new Set(
      Array.isArray(existingProducts?.ids)
        ? existingProducts.ids.map((productId) => Number(productId || 0)).filter((productId) => productId > 0)
        : []
    );
    uniqueReferencedProductIds.forEach((productId) => {
      if (!existingIds.has(productId)) {
        errors.push(`Product ${productId} not found`);
      }
    });
  }

  return {
    errors,
    value: {
      name,
      description: description || null,
      type,
      value,
      min_quantity: minQuantity,
      apply_to_category: applyToCategory,
      apply_to_product: applyToProduct,
      buy_product_id: buyProductId,
      buy_quantity: buyQuantity,
      get_product_id: getProductId,
      get_quantity: getQuantity,
      start_date: startDate,
      end_date: endDate,
      start_at: startAt,
      end_at: endAt,
      status,
      first_order_only: firstOrderOnly,
    },
  };
};

module.exports = {
  validateOfferPayload,
};
