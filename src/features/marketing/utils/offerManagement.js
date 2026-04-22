const SIMPLE_SCOPE_TYPES = new Set(['percentage', 'fixed', 'volume']);
const ADVANCED_PRODUCT_RULE_TYPES = new Set(['bogo', 'bundle']);
const VALUE_TYPES = new Set(['percentage', 'fixed', 'volume', 'bundle']);
const MIN_QTY_TYPES = new Set(['percentage', 'fixed', 'volume']);

export const TABLE_FILTERS = ['all', 'active', 'scheduled', 'expired', 'inactive'];
export const SCHEDULE_MODES = ['none', 'date', 'datetime'];

export const OFFER_TYPE_META = {
  percentage: {
    label: 'Percentage Discount',
    description: 'Discount a product or category by a percentage.',
    valueLabel: 'Discount %',
    valueHint: 'Enter a percentage between 1 and 100.',
    minQuantityHint: 'Minimum quantity needed before the discount starts.',
    scopeHint: 'Use ALL for storewide offers, or target a category or product.',
  },
  fixed: {
    label: 'Fixed Discount',
    description: 'Deduct a fixed rupee amount from the matching item.',
    valueLabel: 'Discount Amount',
    valueHint: 'Enter the rupee amount to subtract from each matching item.',
    minQuantityHint:
      'Set a higher quantity only if the discount should start after that threshold.',
    scopeHint: 'Use ALL for storewide offers, or target a category or product.',
  },
  volume: {
    label: 'Volume Discount',
    description: 'Give a percentage discount only after a quantity threshold.',
    valueLabel: 'Discount %',
    valueHint: 'Enter a percentage between 1 and 100.',
    minQuantityHint: 'Volume offers need a quantity above 1.',
    scopeHint: 'Target a category or product for quantity-based promotions.',
  },
  bogo: {
    label: 'Buy X Get Y',
    description: 'Reward one product when another product is purchased.',
    valueLabel: 'Value',
    valueHint: 'BOGO does not use a value field. The get product is treated as the reward.',
    minQuantityHint: 'BOGO uses buy/get quantities instead of minimum quantity.',
    scopeHint: 'Choose the buy and get products in Advanced Rules.',
  },
  bundle: {
    label: 'Bundle Discount',
    description: 'Discount a paired product when both products are in the basket.',
    valueLabel: 'Bundle Discount %',
    valueHint: 'Enter a percentage between 1 and 100 for the bundle reward.',
    minQuantityHint: 'Bundle offers use buy/get quantities instead of minimum quantity.',
    scopeHint: 'Choose the paired products in Advanced Rules.',
  },
};

export const createEmptyForm = () => ({
  name: '',
  description: '',
  type: 'percentage',
  value: 10,
  min_quantity: 1,
  apply_to_category: 'ALL',
  apply_to_product: null,
  buy_product_id: null,
  buy_quantity: 1,
  get_product_id: null,
  get_quantity: 1,
  schedule_mode: 'none',
  start_date: '',
  end_date: '',
  start_at: '',
  end_at: '',
  status: 'active',
  first_order_only: false,
});

export const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase();

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const formatNumericValue = (value = 0) => {
  const numeric = toFiniteNumber(value, 0);
  if (Number.isInteger(numeric)) return String(numeric);
  return String(Number(numeric.toFixed(2)))
    .replace(/\.0+$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
};

export const normalizeDateTimeInputToIso = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const formatDateTimeForInput = (value = null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export const formatDateToken = (value = '') => {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : '';
};

export const extractCategoryNames = (items = []) =>
  [
    ...new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item?.name || item?.category || item?.title || '').trim())
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right));

export const isSimpleScopeType = (type = '') => SIMPLE_SCOPE_TYPES.has(normalizeText(type));
export const usesAdvancedProductRules = (type = '') =>
  ADVANCED_PRODUCT_RULE_TYPES.has(normalizeText(type));
export const usesValueField = (type = '') => VALUE_TYPES.has(normalizeText(type));
export const usesMinQuantity = (type = '') => MIN_QTY_TYPES.has(normalizeText(type));

export const getScheduleMode = (source = {}) => {
  const explicitMode = normalizeText(source?.schedule_mode || '');
  if (SCHEDULE_MODES.includes(explicitMode)) return explicitMode;
  if (String(source?.start_at || '').trim() || String(source?.end_at || '').trim())
    return 'datetime';
  if (String(source?.start_date || '').trim() || String(source?.end_date || '').trim())
    return 'date';
  return 'none';
};

export const applyScheduleModeToForm = (form = {}, nextMode = 'none') => {
  if (nextMode === 'datetime') {
    const derivedStart =
      String(form?.start_at || '').trim() ||
      (formatDateToken(form?.start_date) ? `${formatDateToken(form.start_date)}T00:00` : '');
    const derivedEnd =
      String(form?.end_at || '').trim() ||
      (formatDateToken(form?.end_date) ? `${formatDateToken(form.end_date)}T23:59` : '');
    return {
      ...form,
      schedule_mode: 'datetime',
      start_date: '',
      end_date: '',
      start_at: derivedStart,
      end_at: derivedEnd,
    };
  }

  if (nextMode === 'date') {
    return {
      ...form,
      schedule_mode: 'date',
      start_date: formatDateToken(form?.start_date) || formatDateToken(form?.start_at),
      end_date: formatDateToken(form?.end_date) || formatDateToken(form?.end_at),
      start_at: '',
      end_at: '',
    };
  }

  return {
    ...form,
    schedule_mode: 'none',
    start_date: '',
    end_date: '',
    start_at: '',
    end_at: '',
  };
};

export const normalizeOfferForm = (form = {}) => {
  const type = normalizeText(form.type || 'percentage') || 'percentage';
  const scopeType = isSimpleScopeType(type);
  const advancedType = usesAdvancedProductRules(type);
  const scheduleMode = getScheduleMode(form);

  return {
    name: String(form.name || '').trim(),
    description: String(form.description || '').trim(),
    type,
    value: usesValueField(type) ? Math.max(0, toFiniteNumber(form.value, 0)) : 0,
    min_quantity: usesMinQuantity(type)
      ? Math.max(1, toFiniteNumber(form.min_quantity, 1) || 1)
      : 1,
    apply_to_category: scopeType ? String(form.apply_to_category || '').trim() || null : null,
    apply_to_product: scopeType ? toFiniteNumber(form.apply_to_product, 0) || null : null,
    buy_product_id: advancedType ? toFiniteNumber(form.buy_product_id, 0) || null : null,
    buy_quantity: advancedType ? Math.max(1, toFiniteNumber(form.buy_quantity, 1) || 1) : 1,
    get_product_id: advancedType ? toFiniteNumber(form.get_product_id, 0) || null : null,
    get_quantity: advancedType ? Math.max(1, toFiniteNumber(form.get_quantity, 1) || 1) : 1,
    schedule_mode: scheduleMode,
    start_date: scheduleMode === 'date' ? formatDateToken(form.start_date) || null : null,
    end_date: scheduleMode === 'date' ? formatDateToken(form.end_date) || null : null,
    start_at: scheduleMode === 'datetime' ? normalizeDateTimeInputToIso(form.start_at) : null,
    end_at: scheduleMode === 'datetime' ? normalizeDateTimeInputToIso(form.end_at) : null,
    status: normalizeText(form.status || 'active') || 'active',
    first_order_only: Boolean(form.first_order_only),
  };
};

export const mapOfferToForm = (offer = {}) => {
  const scheduleMode = getScheduleMode(offer);
  return {
    name: String(offer?.name || '').trim(),
    description: String(offer?.description || '').trim(),
    type: String(offer?.type || 'percentage').trim() || 'percentage',
    value: toFiniteNumber(offer?.value, 0),
    min_quantity: Math.max(1, toFiniteNumber(offer?.min_quantity, 1) || 1),
    apply_to_category: String(offer?.apply_to_category || '').trim(),
    apply_to_product: toFiniteNumber(offer?.apply_to_product, 0) || null,
    buy_product_id: toFiniteNumber(offer?.buy_product_id, 0) || null,
    buy_quantity: Math.max(1, toFiniteNumber(offer?.buy_quantity, 1) || 1),
    get_product_id: toFiniteNumber(offer?.get_product_id, 0) || null,
    get_quantity: Math.max(1, toFiniteNumber(offer?.get_quantity, 1) || 1),
    schedule_mode: scheduleMode,
    start_date: scheduleMode === 'date' ? formatDateToken(offer?.start_date) : '',
    end_date: scheduleMode === 'date' ? formatDateToken(offer?.end_date) : '',
    start_at: scheduleMode === 'datetime' ? formatDateTimeForInput(offer?.start_at) : '',
    end_at: scheduleMode === 'datetime' ? formatDateTimeForInput(offer?.end_at) : '',
    status: String(offer?.status || 'active').trim() || 'active',
    first_order_only: Boolean(Number(offer?.first_order_only || 0) || offer?.first_order_only),
  };
};

const buildHumanScopeLabel = (offer = {}) => {
  const category = String(offer.apply_to_category || '').trim();
  const productId = Number(offer.apply_to_product || 0) || null;

  if (productId) return `product #${productId}`;
  if (normalizeText(category) === 'all') return 'storewide';
  if (category) return `${category} items`;
  return 'the selected scope';
};

export const buildScopeSummary = (offer = {}) => {
  if (isSimpleScopeType(offer.type)) {
    const category = String(offer.apply_to_category || '').trim();
    const productId = Number(offer.apply_to_product || 0) || null;
    if (productId) return `Product #${productId}`;
    if (normalizeText(category) === 'all') return 'All categories';
    if (category) return `Category: ${category}`;
    return 'Scope required';
  }

  const buyProductId = Number(offer.buy_product_id || 0) || null;
  const getProductId = Number(offer.get_product_id || 0) || null;
  if (buyProductId || getProductId) {
    return [
      buyProductId ? `Buy #${buyProductId} x${Number(offer.buy_quantity || 1) || 1}` : '',
      getProductId ? `Get #${getProductId} x${Number(offer.get_quantity || 1) || 1}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
  return 'Rule required';
};

export const buildValueSummary = (offer = {}) => {
  const type = normalizeText(offer.type);
  const value = Number(offer.value || 0);
  const minQuantity = Number(offer.min_quantity || 1) || 1;
  const firstOrderOnly = Boolean(Number(offer.first_order_only || 0) || offer.first_order_only);
  const fragments = [];

  if (type === 'percentage' || type === 'volume' || type === 'bundle') {
    fragments.push(`${formatNumericValue(value)}% OFF`);
  } else if (type === 'fixed') {
    fragments.push(`Rs ${formatNumericValue(value)} OFF`);
  } else if (type === 'bogo') {
    fragments.push(
      `Buy ${Number(offer.buy_quantity || 1) || 1} get ${Number(offer.get_quantity || 1) || 1}`
    );
  }

  if (usesMinQuantity(type) && minQuantity > 1) fragments.push(`Min ${minQuantity}`);
  if (firstOrderOnly) fragments.push('First order only');
  return fragments.join(' | ') || '-';
};

export const getOfferScheduleRange = (offer = {}) => {
  const startAt = offer?.start_at ? Date.parse(offer.start_at) : Number.NaN;
  const endAt = offer?.end_at ? Date.parse(offer.end_at) : Number.NaN;
  const startDate = offer?.start_date ? Date.parse(`${offer.start_date}T00:00:00`) : Number.NaN;
  const endDate = offer?.end_date ? Date.parse(`${offer.end_date}T23:59:59`) : Number.NaN;

  return {
    start: Number.isFinite(startAt)
      ? startAt
      : Number.isFinite(startDate)
        ? startDate
        : Number.NEGATIVE_INFINITY,
    end: Number.isFinite(endAt)
      ? endAt
      : Number.isFinite(endDate)
        ? endDate
        : Number.POSITIVE_INFINITY,
  };
};

export const getOfferLifecycleStatus = (offer = {}) => {
  if (normalizeText(offer.status || 'active') !== 'active') return 'inactive';
  const now = Date.now();
  const { start, end } = getOfferScheduleRange(offer);
  if (Number.isFinite(start) && start > now) return 'scheduled';
  if (Number.isFinite(end) && end < now) return 'expired';
  return 'active';
};

export const getLifecycleMeta = (status = '') => {
  switch (status) {
    case 'active':
      return { label: 'Live', tone: 'success' };
    case 'scheduled':
      return { label: 'Scheduled', tone: 'pending' };
    case 'expired':
      return { label: 'Expired', tone: 'danger' };
    default:
      return { label: 'Inactive', tone: 'muted' };
  }
};

export const formatDateTimeLabel = (value = null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
};

export const buildScheduleSummary = (offer = {}) => {
  const scheduleMode = getScheduleMode(offer);
  if (scheduleMode === 'datetime') {
    const parts = [
      offer.start_at ? `Starts ${formatDateTimeLabel(offer.start_at)}` : '',
      offer.end_at ? `Ends ${formatDateTimeLabel(offer.end_at)}` : '',
    ].filter(Boolean);
    return parts.join(' | ') || 'No schedule restrictions';
  }

  if (scheduleMode === 'date') {
    const parts = [
      offer.start_date ? `From ${offer.start_date}` : '',
      offer.end_date ? `To ${offer.end_date}` : '',
    ].filter(Boolean);
    return parts.join(' | ') || 'No schedule restrictions';
  }

  return 'No schedule restrictions';
};

export const getOfferValidationIssues = (source = {}) => {
  const payload = normalizeOfferForm(source);
  const issues = [];

  if (!payload.name) issues.push('Offer name is required.');
  if (!payload.type) issues.push('Offer type is required.');
  if (usesValueField(payload.type) && Number(payload.value || 0) <= 0) {
    issues.push('Value must be greater than zero.');
  }
  if (
    (payload.type === 'percentage' || payload.type === 'volume' || payload.type === 'bundle') &&
    Number(payload.value || 0) > 100
  ) {
    issues.push('Percentage-based offers must stay between 1 and 100.');
  }
  if (payload.type === 'volume' && Number(payload.min_quantity || 1) <= 1) {
    issues.push('Volume offers require a minimum quantity above 1.');
  }
  if (isSimpleScopeType(payload.type) && !payload.apply_to_category && !payload.apply_to_product) {
    issues.push('Choose a category, ALL, or a product for this offer.');
  }
  if (payload.type === 'bogo' && (!payload.buy_product_id || !payload.get_product_id)) {
    issues.push('BOGO offers require both buy and get products.');
  }
  if (payload.type === 'bundle' && (!payload.buy_product_id || !payload.get_product_id)) {
    issues.push('Bundle offers require both linked products.');
  }
  if (
    payload.schedule_mode === 'date' &&
    payload.start_date &&
    payload.end_date &&
    payload.end_date < payload.start_date
  ) {
    issues.push('End date must be on or after the start date.');
  }
  if (
    payload.schedule_mode === 'datetime' &&
    payload.start_at &&
    payload.end_at &&
    payload.end_at < payload.start_at
  ) {
    issues.push('End time must be on or after the start time.');
  }

  return issues;
};

export const buildOfferPreviewText = (source = {}) => {
  const payload = normalizeOfferForm(source);
  const humanScope = buildHumanScopeLabel(payload);
  const scheduleSummary = buildScheduleSummary(payload);
  const scheduleText = scheduleSummary === 'No schedule restrictions' ? '' : `${scheduleSummary}.`;
  const name = payload.name || 'This offer';

  if (payload.type === 'bogo') {
    return `${name}: buy ${payload.buy_quantity} of product #${payload.buy_product_id || '?'} and get ${payload.get_quantity} of product #${payload.get_product_id || '?'}. ${payload.first_order_only ? 'First-order customers only. ' : ''}${scheduleText}`.trim();
  }

  if (payload.type === 'bundle') {
    return `${name}: save ${formatNumericValue(payload.value)}% when product #${payload.buy_product_id || '?'} and product #${payload.get_product_id || '?'} are purchased together. ${payload.first_order_only ? 'First-order customers only. ' : ''}${scheduleText}`.trim();
  }

  if (payload.type === 'fixed') {
    return `${name}: get Rs ${formatNumericValue(payload.value)} OFF ${Number(payload.min_quantity || 1) > 1 ? `after buying ${payload.min_quantity}+ items ` : ''}on ${humanScope}. ${payload.first_order_only ? 'First-order customers only. ' : ''}${scheduleText}`.trim();
  }

  if (payload.type === 'volume') {
    return `${name}: save ${formatNumericValue(payload.value)}% after buying ${payload.min_quantity}+ items from ${humanScope}. ${payload.first_order_only ? 'First-order customers only. ' : ''}${scheduleText}`.trim();
  }

  return `${name}: save ${formatNumericValue(payload.value)}% on ${humanScope}. ${payload.first_order_only ? 'First-order customers only. ' : ''}${scheduleText}`.trim();
};

export const getOfferStrengthMeta = (source = {}) => {
  const offer = normalizeOfferForm(source);
  const value = Number(offer.value || 0);

  if (offer.type === 'bogo') {
    return {
      label: 'Strong offer',
      tone: 'strong',
      description: 'Rule-based reward with a clear giveaway.',
    };
  }

  let score = 1;
  if (offer.type === 'fixed') {
    score = value >= 150 ? 3 : value >= 50 ? 2 : 1;
  } else if (offer.type === 'bundle') {
    score = value >= 20 ? 3 : value >= 10 ? 2 : 1;
  } else {
    score = value >= 25 ? 3 : value >= 10 ? 2 : 1;
    if (offer.type === 'volume' && Number(offer.min_quantity || 1) >= 4) {
      score = Math.max(1, score - 1);
    }
  }

  if (score >= 3) {
    return {
      label: 'Strong offer',
      tone: 'strong',
      description: 'The customer benefit is large and easy to notice.',
    };
  }

  if (score === 2) {
    return {
      label: 'Good offer',
      tone: 'good',
      description: 'Clear value without feeling too aggressive.',
    };
  }

  return {
    label: 'Light offer',
    tone: 'light',
    description: 'Useful, but the shopper may need stronger messaging to care.',
  };
};

export const scheduleRangesOverlap = (left = {}, right = {}) => {
  const a = getOfferScheduleRange(left);
  const b = getOfferScheduleRange(right);
  return a.start <= b.end && b.start <= a.end;
};

export const offersScopeOverlap = (draft = {}, existing = {}) => {
  if (isSimpleScopeType(draft.type) && isSimpleScopeType(existing.type)) {
    const draftCategory = normalizeText(draft.apply_to_category);
    const existingCategory = normalizeText(existing.apply_to_category);
    const draftProduct = Number(draft.apply_to_product || 0) || 0;
    const existingProduct = Number(existing.apply_to_product || 0) || 0;

    if (draftCategory === 'all' || existingCategory === 'all') return true;
    if (draftProduct > 0 && existingProduct > 0 && draftProduct === existingProduct) return true;
    if (draftCategory && existingCategory && draftCategory === existingCategory) return true;
    return false;
  }

  if (usesAdvancedProductRules(draft.type) && usesAdvancedProductRules(existing.type)) {
    const draftBuy = Number(draft.buy_product_id || 0) || 0;
    const draftGet = Number(draft.get_product_id || 0) || 0;
    const existingBuy = Number(existing.buy_product_id || 0) || 0;
    const existingGet = Number(existing.get_product_id || 0) || 0;
    return (draftBuy > 0 && draftBuy === existingBuy) || (draftGet > 0 && draftGet === existingGet);
  }

  return false;
};

export const getPotentialConflictWarnings = (form = {}, offers = [], editingId = null) => {
  const draft = normalizeOfferForm(form);
  const draftIssues = getOfferValidationIssues(draft);
  if (draftIssues.length > 0) return [];

  return (Array.isArray(offers) ? offers : [])
    .filter((offer) => Number(offer?.id || 0) !== Number(editingId || 0))
    .filter((offer) => getOfferLifecycleStatus(offer) !== 'inactive')
    .filter((offer) => scheduleRangesOverlap(draft, offer))
    .filter((offer) => offersScopeOverlap(draft, offer))
    .slice(0, 3)
    .map((offer) => `${offer.name || 'Offer'} may overlap with this scope and schedule.`);
};

export const filterOffersByStatus = (offers = [], filter = 'all') => {
  if (filter === 'all') return Array.isArray(offers) ? offers : [];
  return (Array.isArray(offers) ? offers : []).filter(
    (offer) => getOfferLifecycleStatus(offer) === filter
  );
};
