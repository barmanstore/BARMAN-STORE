import { resolveMediaUrl } from '../../../../services/api';
import { getProductFallbackImage } from '../../../../utils/productImage';
import { formatCurrency, getSignedCurrencyClassName } from '../../../../utils/formatters';

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const getProductPageSize = (isMobile) => (isMobile ? 12 : 16);
const LOW_STOCK_THRESHOLD = 5;
const RESTOCK_ALERT_THRESHOLD = 70;
const CRITICAL_RESTOCK_THRESHOLD = 90;
const USAGE_HISTORY_KEY = 'barman_product_usage_v1';
const RECENTLY_BOUGHT_LIMIT = 12;
const VIRTUALIZE_GROUP_THRESHOLD = 28;
const GROUP_BY_OPTIONS = {
  category: 'category',
  brand: 'brand'
};
const LOGO_DEV_TOKEN = String(import.meta.env.VITE_LOGO_DEV_TOKEN || '').trim();
const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};
const PRODUCTS_AUTOLOAD_ROOT_MARGIN = '720px 0px';
const ABOVE_FOLD_EAGER_IMAGE_COUNT = {
  mobile: 4,
  desktop: 8
};
const DEFAULT_SORT_BY = 'popular';
const SORT_OPTIONS = ['popular', 'relevance', 'newest', 'price-asc', 'price-desc', 'stock-desc'];
const SORT_API_FALLBACK = {
  popular: 'relevance'
};
const MOBILE_TAB_OPTIONS = [
  { key: 'order-again', label: 'Order Again' },
  { key: 'best-prices', label: 'Best Prices' },
  { key: 'trending', label: 'Trending Now' },
];
const PRODUCTS_TELEMETRY_SESSION_KEY = 'barman_products_session_v1';
const PRODUCTS_AB_VARIANT_KEY = 'barman_products_ab_variant_v1';
const PRODUCTS_LIST_CACHE_PREFIX = 'barman_products_page_cache_v1';
const PRODUCTS_LIST_CACHE_TTL_MS = 90 * 1000;
const PRODUCTS_CATEGORIES_CACHE_KEY = 'barman_products_categories_cache_v1';
const PRODUCTS_CATEGORIES_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_SUGGESTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_SUGGESTIONS_MAX_ITEMS = 8;
const SEARCH_SUGGESTIONS_MIN_CHARS = 2;
const RESOLVED_MEDIA_CACHE_MAX_ITEMS = 600;
const resolvedMediaSourceCache = new Map();
const PRODUCTS_SYNONYMS = {
  milk: ['doodh'],
  curd: ['dahi', 'yogurt'],
  biscuit: ['cookie'],
  chips: ['namkeen', 'snack'],
  atta: ['flour'],
  dal: ['lentil', 'pulse'],
  rice: ['chawal'],
  detergent: ['washing', 'powder'],
  soap: ['bodywash'],
  tea: ['chai']
};
const PRODUCTS_SYNONYM_REVERSE = Object.entries(PRODUCTS_SYNONYMS).reduce((acc, [key, values]) => {
  const normalizedKey = normalizeText(key);
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return;
    if (!acc[normalizedValue]) acc[normalizedValue] = [];
    acc[normalizedValue].push(normalizedKey);
  });
  return acc;
}, {});

const normalizeSortBy = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return SORT_OPTIONS.includes(normalized) ? normalized : DEFAULT_SORT_BY;
};
const tokenizeSearchText = (value = '') => {
  return normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
};

const tokenFuzzyMatch = (queryToken, targetToken) => {
  const query = String(queryToken || '');
  const target = String(targetToken || '');
  if (!query || !target) return false;
  if (target === query) return true;
  if (target.startsWith(query) || query.startsWith(target)) return true;
  if (Math.abs(query.length - target.length) > 1 || query.length < 4 || target.length < 4) return false;
  let mismatch = 0;
  const limit = Math.min(query.length, target.length);
  for (let index = 0; index < limit; index += 1) {
    if (query[index] === target[index]) continue;
    mismatch += 1;
    if (mismatch > 1) return false;
  }
  return mismatch <= 1;
};

const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

const getCachedResolvedMediaSource = (value) => {
  const key = String(value || '').trim();
  if (!key) return '';
  return String(resolvedMediaSourceCache.get(key) || '').trim();
};

const cacheResolvedMediaSource = (source, resolvedSource) => {
  const sourceKey = String(source || '').trim();
  const resolvedKey = String(resolvedSource || '').trim();
  if (!sourceKey || !resolvedKey) return;
  if (resolvedMediaSourceCache.has(sourceKey)) {
    resolvedMediaSourceCache.delete(sourceKey);
  }
  resolvedMediaSourceCache.set(sourceKey, resolvedKey);
  if (resolvedMediaSourceCache.size <= RESOLVED_MEDIA_CACHE_MAX_ITEMS) return;
  const oldestKey = resolvedMediaSourceCache.keys().next().value;
  if (oldestKey) resolvedMediaSourceCache.delete(oldestKey);
};

const getSuggestionImageSrc = (item) => {
  const fromRow = resolveMediaUrl(item?.image);
  if (fromRow) return fromRow;
  return getProductFallbackImage(item);
};

const buildResponsiveImageSources = (src, preferredWidth = 480) => {
  const raw = String(src || '').trim();
  if (!raw || /^blob:/i.test(raw) || /^data:/i.test(raw)) {
    return { src: raw, srcSet: '', sizes: '' };
  }

  let baseUrl;
  try {
    baseUrl = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  } catch (_) {
    return { src: raw, srcSet: '', sizes: '' };
  }

  const host = String(baseUrl.hostname || '').toLowerCase();
  const isUnsplash = host.includes('unsplash.com');
  const isCloudinary = host.includes('cloudinary.com') && baseUrl.pathname.includes('/upload/');
  if (!isUnsplash && !isCloudinary) {
    return { src: baseUrl.toString(), srcSet: '', sizes: '' };
  }

  const widths = Array.from(new Set([
    Math.max(320, Math.round(preferredWidth * 0.75)),
    Math.max(420, Math.round(preferredWidth)),
    Math.max(640, Math.round(preferredWidth * 1.6))
  ])).sort((a, b) => a - b);

  const toOptimizedUrl = (width) => {
    const next = new URL(baseUrl.toString());

    // Unsplash optimization parameters
    if (isUnsplash) {
      next.searchParams.set('auto', 'format');
      next.searchParams.set('fit', 'max');
      next.searchParams.set('q', '85');
      next.searchParams.set('w', String(width));
      return next.toString();
    }

    // Cloudinary transformation in URL path
    if (isCloudinary) {
      const [left, right] = next.pathname.split('/upload/');
      next.pathname = `${left}/upload/f_auto,q_auto:good,w_${width}/${right}`;
      return next.toString();
    }
    return next.toString();
  };

  const srcSet = widths.map((width) => `${toOptimizedUrl(width)} ${width}w`).join(', ');
  const srcUrl = toOptimizedUrl(widths[0]);
  const sizes = preferredWidth >= 900
    ? '(max-width: 767px) 92vw, 840px'
    : '(max-width: 767px) 46vw, 280px';

  return { src: srcUrl, srcSet, sizes };
};

const splitHierarchyValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw || !raw.includes('->')) return { parent: raw, child: '' };
  const parts = raw.split('->').map((part) => String(part || '').trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { parent: raw, child: '' };
  return { parent: parts[0], child: parts[1] };
};

const composeHierarchyLabel = (parent, child) => {
  const parentName = String(parent || '').trim();
  const childName = String(child || '').trim();
  if (!parentName) return '';
  if (!childName) return parentName;
  return `${parentName} -> ${childName}`;
};

const getProductHierarchy = (product) => {
  const parsedCategory = splitHierarchyValue(product?.category);
  const explicitCategory = String(product?.category || '').trim();
  const explicitSubcategory = String(product?.subcategory ?? product?.sub_category ?? '').trim();
  const category = explicitCategory || parsedCategory.parent || '';
  const subcategory = explicitSubcategory || parsedCategory.child || '';
  const categoryPath = String(product?.category_path || '').trim() || composeHierarchyLabel(category, subcategory);

  const parsedBrand = splitHierarchyValue(product?.brand);
  const explicitBrand = String(product?.brand || '').trim();
  const explicitSubBrand = String(product?.sub_brand ?? product?.subBrand ?? product?.subbrand ?? '').trim();
  const brand = explicitBrand || parsedBrand.parent || '';
  const subBrand = explicitSubBrand || parsedBrand.child || '';
  const brandPath = String(product?.brand_path || '').trim() || composeHierarchyLabel(brand, subBrand);

  return { category, subcategory, categoryPath, brand, subBrand, brandPath };
};

const getFamilyKey = (product, hierarchy = null) => {
  const name = normalizeText(product?.name);
  const resolved = hierarchy || getProductHierarchy(product);
  const brand = normalizeText(resolved.brandPath || resolved.brand);
  return `${name}|${brand}`;
};

const getVariationLabel = (variation, index) => {
  const parts = [String(variation.content || '').trim(), String(variation.color || '').trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  const sku = String(variation.sku || '').trim();
  if (sku) return sku;
  return `Option ${index + 1}`;
};

const getVariationPreviewLabel = (variation) => {
  const content = String(variation?.content || '').trim();
  const color = String(variation?.color || '').trim();
  const sku = String(variation?.sku || '').trim();
  const label = [content, color].filter(Boolean).join(' · ');
  return label || sku || 'Option';
};

const safeReadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const getInitials = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const readLocalUser = () => {
  if (typeof window === 'undefined') return null;
  return safeReadJson('user', null);
};

const safeWriteJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Ignore storage write failures to keep ordering flow responsive.
  }
};

const safeReadSessionJson = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const safeWriteSessionJson = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Ignore storage write issues.
  }
};

const readSessionStorageValue = (key) => {
  try {
    return String(sessionStorage.getItem(key) || '').trim();
  } catch (_) {
    return '';
  }
};

const writeSessionStorageValue = (key, value) => {
  try {
    sessionStorage.setItem(key, String(value || ''));
  } catch (_) {
    // Ignore storage write issues.
  }
};

const createTelemetrySessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `products_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const hasActiveUserSession = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('user') || '{}');
    return Boolean(String(parsed?.token || '').trim());
  } catch (_) {
    return false;
  }
};

const buildProductsListSessionCacheKey = ({
  selectedCategory,
  query,
  sortBy,
  inStockOnly,
  pageSize
}) => {
  return [
    PRODUCTS_LIST_CACHE_PREFIX,
    normalizeText(selectedCategory || 'all') || 'all',
    normalizeText(query || ''),
    normalizeSortBy(sortBy),
    inStockOnly ? '1' : '0',
    String(Number(pageSize || 0))
  ].join('|');
};

const getUsageWindowDays = (label = '', category = '', addCount = 0) => {
  const text = `${normalizeText(label)} ${normalizeText(category)}`;
  let baseDays = 7;
  if (/(milk|dairy|egg|bread|curd|yogurt|paneer)/.test(text)) baseDays = 4;
  else if (/(rice|atta|flour|oil|sugar|salt|tea)/.test(text)) baseDays = 12;
  else if (/(biscuit|snack|noodle|personal|soap|shampoo)/.test(text)) baseDays = 9;
  const frequencyTuning = Math.min(4, Math.floor(Number(addCount || 0) / 3));
  return Math.max(3, baseDays - frequencyTuning);
};

const normalizePathTokens = (value = '') => {
  return String(value || '')
    .split('->')
    .map((part) => normalizeText(part))
    .filter(Boolean);
};

const normalizePathValue = (value = '') => normalizePathTokens(value).join(' ->');

const BRAND_LOGO_DOMAIN_HINTS = {
  amul: 'amul.com',
  nestle: 'nestle.com',
  britannia: 'britannia.co.in',
  parle: 'parleproducts.com',
  cadbury: 'cadbury.co.in',
  patanjali: 'patanjaliayurved.org',
  tata: 'tataconsumer.com',
  fortune: 'adaniwilmar.com',
  saffola: 'saffolalife.com',
  surf: 'surfexcel.in',
  colgate: 'colgate.com',
  pepsodent: 'pepsodent.in',
  dove: 'dove.com',
  lifebuoy: 'lifebuoy.co.in',
  maggi: 'maggi.in',
  nescafe: 'nescafe.com',
  horlicks: 'horlicks.in',
  tropicana: 'tropicana.com',
  coca: 'coca-cola.com',
  pepsi: 'pepsi.com',
  sprite: 'sprite.com',
  sunfeast: 'sunfeast.com',
  aashirvaad: 'aashirvaad.com',
  kellogg: 'kelloggs.com',
  himalaya: 'himalayawellness.com',
  dettol: 'dettol.co.in',
  harpic: 'harpic.com',
  lizol: 'lizol.co.in',
  whisper: 'whisper.co.in',
  stayfree: 'stayfree.in',
  pampers: 'pampers.com',
  johnson: 'jnj.com',
  nivea: 'nivea.in',
  vaseline: 'vaseline.com',
  gillette: 'gillette.com',
  pantene: 'pantene.com'
};

const resolveBrandLogoUrl = (brandName = '') => {
  const normalized = normalizeText(brandName).replace(/[^a-z0-9&\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || !LOGO_DEV_TOKEN) return '';

  let domain = BRAND_LOGO_DOMAIN_HINTS[normalized] || '';
  if (!domain) {
    const matchEntry = Object.entries(BRAND_LOGO_DOMAIN_HINTS).find(([key]) => (
      normalized.includes(key) || key.includes(normalized)
    ));
    domain = matchEntry?.[1] || '';
  }

  const baseParams = `token=${encodeURIComponent(LOGO_DEV_TOKEN)}&size=128&format=webp&fallback=monogram`;
  if (domain) {
    return `https://img.logo.dev/${domain}?${baseParams}`;
  }
  return `https://img.logo.dev/name/${encodeURIComponent(brandName)}?${baseParams}`;
};


const getDefaultCategoryIcon = (categoryName = '') => {
  const text = normalizeText(categoryName);
  if (!text || text === 'all') return '🛒';
  if (/(dairy|milk|curd|paneer|cheese|butter|egg)/.test(text)) return '🥛';
  if (/(biscuit|cookie|snack|chips|namkeen)/.test(text)) return '🍪';
  if (/(rice|grain|atta|flour|dal|pulse)/.test(text)) return '🍚';
  if (/(tea|coffee|beverage|drink|juice)/.test(text)) return '🍵';
  if (/(oil|ghee)/.test(text)) return '🫗';
  if (/(personal|care|soap|shampoo|tooth|cosmetic|beauty)/.test(text)) return '🧴';
  if (/(fruit|fresh)/.test(text)) return '🍎';
  if (/(vegetable|veggie)/.test(text)) return '🥦';
  if (/(clean|home|household|detergent)/.test(text)) return '🧽';
  if (/(baby|kids)/.test(text)) return '🧸';
  if (/(medicine|pharma|health)/.test(text)) return '💊';
  return '🧺';
};

const familyHasImage = (family) => {
  const variations = Array.isArray(family?.variations) ? family.variations : [];
  return variations.some((variation) => String(variation?.image || '').trim().length > 0);
};

const getFamilyPreviewVariation = (family, fallbackVariation = null) => {
  if (fallbackVariation) {
    const fallbackImage = String(fallbackVariation?.image || '').trim();
    if (fallbackImage) return fallbackVariation;
  }
  const variations = Array.isArray(family?.variations) ? family.variations : [];
  return variations.find((variation) => String(variation?.image || '').trim().length > 0) || fallbackVariation || variations[0] || null;
};

const getFirstAvailableVariation = (family) => {
  const variations = Array.isArray(family?.variations) ? family.variations : [];
  return variations.find((variation) => Number(variation?.stock || 0) > 0) || variations[0] || null;
};

const getFamilyCardState = (family, selectedVariation, cartQtyById = {}) => {
  const resolvedVariation = selectedVariation || getFirstAvailableVariation(family);
  if (!family || !resolvedVariation) {
    return {
      selectedVariation: null,
      previewVariation: null,
      hasMultipleVariations: false,
      optionCount: 0,
      familyInStock: false,
      familyLowStock: false,
      selectedStock: 0,
      selectedQty: 0,
      familyCartQty: 0,
      selectedLabel: '',
      previewLabels: [],
      priceValue: 0,
      mrpValue: 0,
      hasDiscount: false,
      discountPercent: 0,
      savingsValue: 0,
      showFromPrice: false,
      minPrice: 0,
      stockTone: 'out-of-stock',
      stockText: 'Out of stock',
      stockHint: 'Request item',
      metaLine: '',
      uomLabel: 'pcs',
      stockActionLabel: 'Request'
    };
  }

  const variations = Array.isArray(family.variations) ? family.variations : [];
  const hasMultipleVariations = variations.length > 1;
  const previewVariation = getFamilyPreviewVariation(family, resolvedVariation);
  const familyInStock = variations.some((variation) => Number(variation.stock || 0) > 0);
  const familyLowStock = Number(family?.totalStock || 0) > 0 && Number(family.totalStock || 0) <= LOW_STOCK_THRESHOLD;
  const familyCartQty = variations.reduce((sum, variation) => sum + Number(cartQtyById[variation.id] || 0), 0);
  const selectedQty = Number(cartQtyById[resolvedVariation.id] || 0);
  const selectedStock = Number(resolvedVariation.stock || 0);
  const selectedLowStock = selectedStock > 0 && selectedStock <= LOW_STOCK_THRESHOLD;
  const inStockOptionCount = variations.filter((variation) => Number(variation.stock || 0) > 0).length;
  const uniqueUoms = [...new Set(variations.map((variation) => String(variation.uom || 'pcs').trim()).filter(Boolean))];
  const uomLabel = uniqueUoms.length === 1 ? uniqueUoms[0] : String(resolvedVariation.uom || 'pcs').trim();
  const previewLabels = [...new Set(
    variations
      .slice(0, 3)
      .map((variation) => getVariationPreviewLabel(variation))
      .filter(Boolean)
  )];
  const priceValue = Number(resolvedVariation.price || 0);
  const mrpValue = Math.max(priceValue, Number(resolvedVariation.mrp || 0));
  const hasDiscount = mrpValue > priceValue;
  const savingsValue = hasDiscount ? (mrpValue - priceValue) : 0;
  const discountPercent = hasDiscount && mrpValue > 0
    ? Math.round((savingsValue / mrpValue) * 100)
    : 0;
  const minPrice = Number(family?.minPrice || priceValue || 0);
  const showFromPrice = hasMultipleVariations && minPrice > 0 && minPrice < priceValue;

  let stockTone = 'out-of-stock';
  let stockText = 'Out of stock';
  let stockHint = 'Request item';
  if (selectedStock > 0) {
    stockTone = selectedLowStock ? 'special-order' : 'in-stock';
    stockText = selectedLowStock ? 'Low stock' : 'Ready';
    stockHint = hasMultipleVariations
      ? `${inStockOptionCount || 1} option${inStockOptionCount === 1 ? '' : 's'} ready`
      : 'Ready to add';
  } else if (familyInStock && hasMultipleVariations) {
    stockTone = 'in-stock';
    stockText = 'Other options ready';
    stockHint = 'Open options';
  }

  return {
    selectedVariation: resolvedVariation,
    previewVariation,
    hasMultipleVariations,
    optionCount: variations.length,
    familyInStock,
    familyLowStock,
    selectedStock,
    selectedQty,
    familyCartQty,
    selectedLabel: getVariationPreviewLabel(resolvedVariation),
    previewLabels,
    priceValue,
    mrpValue,
    hasDiscount,
    discountPercent,
    savingsValue,
    showFromPrice,
    minPrice,
    stockTone,
    stockText,
    stockHint,
    metaLine: String(family.brand || family.category || '').trim(),
    uomLabel: uomLabel || 'pcs',
    stockActionLabel: selectedStock === 0 ? 'Request' : 'Add'
  };
};

export {
  normalizeText,
  getProductPageSize,
  LOW_STOCK_THRESHOLD,
  RESTOCK_ALERT_THRESHOLD,
  CRITICAL_RESTOCK_THRESHOLD,
  USAGE_HISTORY_KEY,
  RECENTLY_BOUGHT_LIMIT,
  VIRTUALIZE_GROUP_THRESHOLD,
  GROUP_BY_OPTIONS,
  LOGO_DEV_TOKEN,
  getPublicFileUrl,
  PRODUCTS_AUTOLOAD_ROOT_MARGIN,
  ABOVE_FOLD_EAGER_IMAGE_COUNT,
  DEFAULT_SORT_BY,
  SORT_OPTIONS,
  SORT_API_FALLBACK,
  MOBILE_TAB_OPTIONS,
  PRODUCTS_TELEMETRY_SESSION_KEY,
  PRODUCTS_AB_VARIANT_KEY,
  PRODUCTS_LIST_CACHE_PREFIX,
  PRODUCTS_LIST_CACHE_TTL_MS,
  PRODUCTS_CATEGORIES_CACHE_KEY,
  PRODUCTS_CATEGORIES_CACHE_TTL_MS,
  SEARCH_SUGGESTIONS_CACHE_TTL_MS,
  SEARCH_SUGGESTIONS_MAX_ITEMS,
  SEARCH_SUGGESTIONS_MIN_CHARS,
  RESOLVED_MEDIA_CACHE_MAX_ITEMS,
  PRODUCTS_SYNONYMS,
  PRODUCTS_SYNONYM_REVERSE,
  normalizeSortBy,
  tokenizeSearchText,
  tokenFuzzyMatch,
  formatCurrencyColored,
  getCachedResolvedMediaSource,
  cacheResolvedMediaSource,
  getSuggestionImageSrc,
  buildResponsiveImageSources,
  splitHierarchyValue,
  composeHierarchyLabel,
  getProductHierarchy,
  getFamilyKey,
  getVariationLabel,
  getVariationPreviewLabel,
  safeReadJson,
  getInitials,
  readLocalUser,
  safeWriteJson,
  safeReadSessionJson,
  safeWriteSessionJson,
  readSessionStorageValue,
  writeSessionStorageValue,
  createTelemetrySessionId,
  hasActiveUserSession,
  buildProductsListSessionCacheKey,
  getUsageWindowDays,
  normalizePathTokens,
  normalizePathValue,
  BRAND_LOGO_DOMAIN_HINTS,
  resolveBrandLogoUrl,
  getDefaultCategoryIcon,
  familyHasImage,
  getFamilyPreviewVariation,
  getFirstAvailableVariation,
  getFamilyCardState
};
