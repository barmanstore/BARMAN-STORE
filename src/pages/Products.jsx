import { memo, useState, useEffect, useMemo, useRef, useCallback, useDeferredValue, useLayoutEffect, startTransition } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Filter, Search, SlidersHorizontal, ShoppingCart, RotateCcw, Sparkles, X } from 'lucide-react';
import { analyticsApi, productsApi, categoriesApi, resolveMediaSourceForDisplay, resolveMediaUrl } from '../services/api';
import { getProductImageSrc, getProductFallbackImage } from '../utils/productImage';
import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import './Products.css';

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

const formatPriceTag = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '0/';
  const normalized = Number.isInteger(amount)
    ? String(amount)
    : String(Number(amount.toFixed(2))).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  return `${normalized}/`;
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

function BrandFilterVisual({ logo, name }) {
  const [failed, setFailed] = useState(false);
  const resolvedName = String(name || '').trim() || 'Brand';
  const resolvedLogo = resolveMediaUrl(logo);
  if (!resolvedLogo || failed) {
    return <span className="brand-chip-name">{resolvedName}</span>;
  }
  return (
    <img
      src={resolvedLogo}
      alt={resolvedName}
      className="brand-chip-logo"
      width={34}
      height={34}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

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

function SafeProductImage({ src, alt, className, fallbackProduct, width, height, ...rest }) {
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    const cached = getCachedResolvedMediaSource(src);
    return cached || resolveMediaUrl(src) || src || getProductFallbackImage(fallbackProduct);
  });
  const isDetailImage = String(className || '').includes('detail-mobile-image');
  const preferredWidth = isDetailImage ? 960 : 520;
  const explicitWidth = Math.max(16, Math.round(Number(width || (isDetailImage ? 960 : 400))));
  const explicitHeight = Math.max(16, Math.round(Number(height || (isDetailImage ? 600 : 400))));
  const decodeMode = String(rest.loading || '').toLowerCase() === 'eager' ? 'sync' : 'async';
  const responsiveSources = useMemo(
    () => buildResponsiveImageSources(resolvedSrc, preferredWidth),
    [resolvedSrc, preferredWidth]
  );

  useEffect(() => {
    let mounted = true;
    let objectUrlToRevoke = '';

    const load = async () => {
      if (!src) {
        if (mounted) setResolvedSrc(getProductFallbackImage(fallbackProduct));
        return;
      }
      const cachedSrc = getCachedResolvedMediaSource(src);
      if (cachedSrc) {
        if (mounted) setResolvedSrc(cachedSrc);
        return;
      }
      if (mounted) setResolvedSrc(resolveMediaUrl(src) || src);
      try {
        const resolved = await resolveMediaSourceForDisplay(src);
        if (!mounted) {
          if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
          return;
        }
        if (resolved.revoke && resolved.src) objectUrlToRevoke = resolved.src;
        const nextSrc = resolved.src || getProductFallbackImage(fallbackProduct);
        if (resolved.src) cacheResolvedMediaSource(src, resolved.src);
        setResolvedSrc(nextSrc);
      } catch (_) {
        if (mounted) setResolvedSrc(getProductFallbackImage(fallbackProduct));
      }
    };

    load();
    return () => {
      mounted = false;
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    };
  }, [src, fallbackProduct]);

  return (
    <img
      src={responsiveSources.src || resolvedSrc}
      srcSet={responsiveSources.srcSet || undefined}
      sizes={responsiveSources.sizes || undefined}
      alt={alt}
      className={className}
      width={explicitWidth}
      height={explicitHeight}
      {...rest}
      decoding={decodeMode}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.srcset = '';
        event.currentTarget.sizes = '';
        event.currentTarget.src = getProductFallbackImage(fallbackProduct);
      }}
    />
  );
}

function ProductDetailView({
  family,
  selectedVariationId,
  onSelectVariation,
  onIncreaseQty,
  onDecreaseQty,
  cartQtyById,
  buttonStatus,
  showImage = false
}) {
  const selectedVariation = family.variations.find((v) => v.id === selectedVariationId) || getFirstAvailableVariation(family);
  if (!selectedVariation) return null;
  const hasMultipleVariations = family.variations.length > 1;
  const labelSeen = new Set();
  const variationChoices = family.variations.map((variation, idx) => {
    let label = getVariationLabel(variation, idx);
    const key = normalizeText(label);
    if (labelSeen.has(key)) {
      label = `${label} (${idx + 1})`;
    }
    labelSeen.add(key);
    return { variation, label };
  });

  const selectedQty = Number(cartQtyById[selectedVariation.id] || 0);
  const selectedStock = Number(selectedVariation.stock || 0);
  const isSpecialOrder = selectedStock > 0 && selectedStock <= LOW_STOCK_THRESHOLD;
  const isMaxed = false;
  const canIncreaseQty = true;
  const added = buttonStatus[selectedVariation.id] === 'added';

  return (
    <div className="product-detail-view" onClick={(event) => event.stopPropagation()} role="presentation">
      {showImage && (
        <div className="detail-mobile-image-wrap">
          <SafeProductImage
            src={selectedVariation.image}
            alt={family.name}
            className="detail-mobile-image"
            fallbackProduct={selectedVariation.raw}
          />
        </div>
      )}
      <p className="detail-description">{family.description || 'No additional description available.'}</p>
      {hasMultipleVariations ? (
        <div className="variation-list">
          {variationChoices.map(({ variation, label }) => {
            const isActive = variation.id === selectedVariation.id;
            return (
              <button
                key={variation.id}
                type="button"
                className={`variation-chip ${isActive ? 'active' : ''}`}
                onClick={() => onSelectVariation(family.id, variation.id)}
              >
                <span>{label}</span>
                <strong>{formatCurrency(Number(variation.price || 0))}</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="single-variation-row">
          <span>{variationChoices[0]?.label}</span>
          <strong>{formatCurrency(Number(selectedVariation.price || 0))}</strong>
        </div>
      )}

      <div className="detail-selected-meta">
        <div className="detail-price-line">
          <span>{formatCurrencyColored(Number(selectedVariation.price || 0))}</span>
          <small>/ {selectedVariation.uom || 'pcs'}</small>
        </div>
        {selectedVariation.mrp && Number(selectedVariation.mrp) > Number(selectedVariation.price) && (
          <small className="mrp-price">MRP: {formatCurrency(selectedVariation.mrp)}</small>
        )}
        <div className="detail-stock-line">
          <span className={selectedStock > 0 ? (isSpecialOrder ? 'special-order' : 'in-stock') : 'out-of-stock'}>
            {selectedStock > 0 ? (isSpecialOrder ? 'Special Order' : 'In stock') : 'Out of stock'}
          </span>
          {isSpecialOrder ? <small>Limited stock. May take longer.</small> : null}
        </div>
      </div>

      <button
        type="button"
        className="add-to-cart-btn detail-add-btn"
        onClick={() => onIncreaseQty(family, selectedVariation)}
        disabled={!canIncreaseQty}
      >
        <Plus size={14} />
        {selectedStock === 0
          ? (added ? 'Requested!' : 'Request item')
          : isMaxed
            ? 'Max in cart'
            : added
              ? 'Added!'
              : 'Add to cart'}
      </button>
      <div className="detail-counter-row">
        <button
          type="button"
          className="qty-step-btn"
          onClick={() => onDecreaseQty(selectedVariation)}
          disabled={selectedQty <= 0}
        >
          -
        </button>
        <span className="qty-step-value">{selectedQty}</span>
        <button
          type="button"
          className="qty-step-btn"
          onClick={() => onIncreaseQty(family, selectedVariation)}
          disabled={!canIncreaseQty}
        >
          +
        </button>
      </div>
    </div>
  );
}

const FamilyProductCard = memo(function FamilyProductCard({
  family,
  cardState,
  variant = 'default',
  isAddedState = false,
  animationDelay = '0s',
  onOpenDetails,
  onAdd,
  onDecrease,
  detailContent = null,
  onTouchStart,
  onTouchEnd,
  showMetaLine = true,
  showSwipeHint = false,
  imageLoading = 'lazy',
  imageFetchPriority = 'auto'
}) {
  const {
    selectedVariation,
    previewVariation,
    hasMultipleVariations,
    optionCount,
    familyLowStock,
    selectedStock,
    selectedQty,
    familyCartQty,
    selectedLabel,
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
    metaLine,
    uomLabel,
    stockActionLabel
  } = cardState;

  if (!selectedVariation) return null;

  const detailLabel = hasMultipleVariations ? `Options (${optionCount})` : 'Details';

  return (
    <article
      className={`product-card family-card fade-in-up glass-product-card glass-product-card--${variant} ${familyLowStock ? 'low-stock-card' : 'high-stock-card'} ${isAddedState ? 'is-added' : ''}`}
      style={{ animationDelay }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        className="product-card-hero"
        onClick={onOpenDetails}
        aria-label={`View ${family.name}`}
      >
        <div className="glass-oval-frame">
          <div className="glass-oval-frame-inner">
            <SafeProductImage
              src={previewVariation?.image}
              alt={family.name}
              className="glass-product-image"
              loading={imageLoading}
              fetchPriority={imageFetchPriority}
              fallbackProduct={previewVariation?.raw || selectedVariation.raw}
              width={variant === 'compact' ? 288 : 320}
              height={variant === 'compact' ? 224 : 280}
            />
          </div>
          <div className="glass-frame-sheen" aria-hidden="true" />
        </div>
        <div className="card-badges">
          <span className="price-corner-tag">{formatPriceTag(priceValue)}</span>
          {hasMultipleVariations ? (
            <span className="card-option-pill">{optionCount} options</span>
          ) : null}
          {hasDiscount ? (
            <span className="card-discount-pill">{Math.max(1, discountPercent)}% OFF</span>
          ) : null}
        </div>
      </button>

      <div className="product-card-body">
        <div className="product-card-copy">
          <div className="product-title-row">
            <h3 className="product-name">{family.name}</h3>
            {isAddedState ? <span className="card-added-pill">Added</span> : null}
          </div>

          {showMetaLine && metaLine ? <p className="product-meta-line">{metaLine}</p> : null}

          <button
            type="button"
            className={`card-variation-chip ${hasMultipleVariations ? 'has-options' : 'single-option'}`}
            onClick={onOpenDetails}
          >
            <span>{selectedLabel}</span>
            {hasMultipleVariations ? <strong>Change</strong> : null}
          </button>

          {previewLabels.length > 1 ? (
            <div className="product-variation-preview">
              {previewLabels.map((label, index) => (
                <span key={`${family.id}-preview-${index}`} className="variation-preview-tag">{label}</span>
              ))}
            </div>
          ) : null}

          <div className="product-price-line glass-price-line">
            <strong>{formatCurrencyColored(priceValue)}</strong>
            <small>/ {uomLabel || 'pcs'}</small>
          </div>

          {hasDiscount ? (
            <div className="card-price-meta">
              <small className="mrp-price">MRP {formatCurrency(mrpValue)}</small>
              <small className="save-price">Save {formatCurrency(savingsValue)}</small>
            </div>
          ) : null}

          {showFromPrice ? (
            <small className="card-from-price">From {formatCurrency(minPrice)}</small>
          ) : null}
        </div>

        <div className="product-footer compact card-footer-stack">
          <div className="product-stock">
            <span className={stockTone}>{stockText}</span>
            <small className="cart-qty-indicator">
              {familyCartQty > 0 ? `Cart ${familyCartQty}` : stockHint}
            </small>
          </div>

          <div className="card-action-row">
            <button
              type="button"
              className="card-view-btn"
              onClick={onOpenDetails}
            >
              {detailLabel}
            </button>

            {selectedQty > 0 ? (
              <div className="card-qty-counter">
                <button
                  type="button"
                  className="qty-step-btn"
                  onClick={() => onDecrease(selectedVariation)}
                  aria-label={`Decrease ${family.name}`}
                >
                  -
                </button>
                <span className="qty-step-value">{selectedQty}</span>
                <button
                  type="button"
                  className="qty-step-btn"
                  onClick={() => onAdd(family, selectedVariation)}
                  aria-label={`Increase ${family.name}`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="add-to-cart-btn"
                onClick={() => onAdd(family, selectedVariation)}
              >
                <Plus size={14} />
                {selectedStock === 0 ? stockActionLabel : 'Add'}
              </button>
            )}
          </div>

          {showSwipeHint ? (
            <span className="quick-add-swipe-hint">{isAddedState ? 'Added' : 'Swipe card to quick add'}</span>
          ) : null}
        </div>

        {detailContent}
      </div>
    </article>
  );
});

function VirtualizedFamilyGrid({
  families,
  renderFamilyCard,
  estimatedColumns = 2,
  estimatedCardHeight = 290,
  shouldVirtualize = false
}) {
  const hostRef = useRef(null);
  const itemRefs = useRef(new Map());
  const [isNearViewport, setIsNearViewport] = useState(!shouldVirtualize);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.max(0, Math.min((families?.length || 1) - 1, 15)) });
  const cols = Math.max(1, Number(estimatedColumns || 1));
  const rowHeight = Math.max(160, Number(estimatedCardHeight || 290));
  const totalItems = Math.max(0, Number(families?.length || 0));
  const totalRows = Math.max(1, Math.ceil(totalItems / cols));
  const [rowHeights, setRowHeights] = useState(() => Array.from({ length: totalRows }, () => rowHeight));
  const rowOffsets = useMemo(() => {
    const offsets = new Array(totalRows + 1);
    offsets[0] = 0;
    for (let index = 0; index < totalRows; index += 1) {
      offsets[index + 1] = offsets[index] + Math.max(120, Number(rowHeights[index] || rowHeight));
    }
    return offsets;
  }, [rowHeights, totalRows, rowHeight]);
  const totalHeight = Math.max(110, rowOffsets[totalRows] || (totalRows * rowHeight));
  const startRowIndex = Math.floor(Math.max(0, visibleRange.start) / cols);
  const virtualWindowOffset = rowOffsets[startRowIndex] || 0;

  const findRowIndexAtOffset = (offsetPx) => {
    if (totalRows <= 1) return 0;
    let low = 0;
    let high = totalRows - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((rowOffsets[mid + 1] || 0) <= offsetPx) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  };

  useEffect(() => {
    setVisibleRange({ start: 0, end: Math.max(0, Math.min(totalItems - 1, 15)) });
  }, [totalItems]);

  useEffect(() => {
    setRowHeights((prev) => Array.from({ length: totalRows }, (_, index) => (
      Math.max(120, Number(prev[index] || rowHeight))
    )));
  }, [totalRows, rowHeight, cols]);

  useEffect(() => {
    if (!shouldVirtualize) {
      setIsNearViewport(true);
      return undefined;
    }
    const node = hostRef.current;
    if (!node || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      setIsNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsNearViewport(Boolean(entry?.isIntersecting));
      },
      { root: null, rootMargin: '1200px 0px 1200px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldVirtualize]);

  useEffect(() => {
    if (!shouldVirtualize || !isNearViewport) return undefined;
    const node = hostRef.current;
    if (!node || typeof window === 'undefined') return undefined;
    let frameId = 0;
    const overscanRows = 3;

    const computeRange = () => {
      frameId = 0;
      const componentTop = window.scrollY + node.getBoundingClientRect().top;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const visibleTopPx = Math.max(0, viewportTop - componentTop);
      const visibleBottomPx = Math.min(totalHeight, viewportBottom - componentTop);
      const startRow = Math.max(0, findRowIndexAtOffset(visibleTopPx) - overscanRows);
      const endRow = Math.min(totalRows - 1, findRowIndexAtOffset(Math.max(0, visibleBottomPx)) + overscanRows);
      const nextStart = Math.max(0, startRow * cols);
      const nextEnd = Math.min(totalItems - 1, ((endRow + 1) * cols) - 1);
      setVisibleRange((prev) => {
        if (prev.start === nextStart && prev.end === nextEnd) return prev;
        return { start: nextStart, end: nextEnd };
      });
    };

    const scheduleCompute = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(computeRange);
    };

    scheduleCompute();
    window.addEventListener('scroll', scheduleCompute, { passive: true });
    window.addEventListener('resize', scheduleCompute);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', scheduleCompute);
      window.removeEventListener('resize', scheduleCompute);
    };
  }, [shouldVirtualize, isNearViewport, totalRows, totalHeight, cols, totalItems, rowOffsets]);

  useLayoutEffect(() => {
    if (!shouldVirtualize || !isNearViewport || totalItems === 0) return undefined;

    const measureVisibleRows = () => {
      const measuredByRow = new Map();
      itemRefs.current.forEach((node, indexKey) => {
        const absoluteIndex = Number(indexKey);
        if (!node || absoluteIndex < visibleRange.start || absoluteIndex > visibleRange.end) return;
        const measuredHeight = Math.ceil(node.getBoundingClientRect().height || 0);
        if (!measuredHeight) return;
        const rowIndex = Math.floor(absoluteIndex / cols);
        measuredByRow.set(rowIndex, Math.max(measuredByRow.get(rowIndex) || 0, measuredHeight));
      });
      if (measuredByRow.size === 0) return;

      setRowHeights((prev) => {
        let changed = false;
        const next = prev.length === totalRows
          ? [...prev]
          : Array.from({ length: totalRows }, (_, index) => Math.max(120, Number(prev[index] || rowHeight)));
        measuredByRow.forEach((measuredHeight, rowIndex) => {
          const stableHeight = Math.max(120, measuredHeight);
          if (Math.abs(Number(next[rowIndex] || rowHeight) - stableHeight) > 1) {
            next[rowIndex] = stableHeight;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };

    measureVisibleRows();
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') return undefined;
    const observer = new window.ResizeObserver(() => measureVisibleRows());
    itemRefs.current.forEach((node, indexKey) => {
      const absoluteIndex = Number(indexKey);
      if (node && absoluteIndex >= visibleRange.start && absoluteIndex <= visibleRange.end) {
        observer.observe(node);
      }
    });
    return () => observer.disconnect();
  }, [shouldVirtualize, isNearViewport, totalItems, visibleRange.start, visibleRange.end, cols, totalRows, rowHeight]);

  if (!shouldVirtualize) {
    return (
      <div ref={hostRef} className="virtual-grid-host">
        <div className="group-products-grid">
          {families.map((family) => renderFamilyCard(family))}
        </div>
      </div>
    );
  }

  if (!isNearViewport) {
    return (
      <div ref={hostRef} className="virtual-grid-host">
        <div className="virtual-grid-placeholder" style={{ height: `${totalHeight}px` }} aria-hidden="true" />
      </div>
    );
  }

  const windowedFamilies = families.slice(visibleRange.start, visibleRange.end + 1);

  return (
    <div ref={hostRef} className="virtual-grid-host">
      <div className="virtual-grid-window" style={{ height: `${totalHeight}px` }}>
        <div
          className="group-products-grid virtual-grid-windowed-content"
          style={{ transform: `translateY(${virtualWindowOffset}px)` }}
        >
          {windowedFamilies.map((family, index) => {
            const absoluteIndex = visibleRange.start + index;
            return (
              <div
                key={family.id || family.name || absoluteIndex}
                className="virtual-grid-item"
                ref={(node) => {
                  if (node) {
                    itemRefs.current.set(absoluteIndex, node);
                  } else {
                    itemRefs.current.delete(absoluteIndex);
                  }
                }}
              >
                {renderFamilyCard(family)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Products({ setCartCount }) {
  const isMobile = useIsMobile();
  const productsPageRef = useRef(null);
  const controlsRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearchQuery = String(searchParams.get('q') || '');
  const initialGroupBy = searchParams.get('group') === GROUP_BY_OPTIONS.brand
    ? GROUP_BY_OPTIONS.brand
    : GROUP_BY_OPTIONS.category;
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recentlyBought, setRecentlyBought] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [searchInputValue, setSearchInputValue] = useState(initialSearchQuery);
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(initialSearchQuery);
  const deferredAppliedSearchQuery = useDeferredValue(appliedSearchQuery);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchSuggestionsEnabled, setSearchSuggestionsEnabled] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [sortBy, setSortBy] = useState(normalizeSortBy(searchParams.get('sort')));
  const [groupBy, setGroupBy] = useState(initialGroupBy);
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('stock') === '1');
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState([]);
  const [productsPage, setProductsPage] = useState(0);
  const [productsHasMore, setProductsHasMore] = useState(true);
  const [buttonStatus, setButtonStatus] = useState({});
  const [notice, setNotice] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [activeDesktopFamilyId, setActiveDesktopFamilyId] = useState(null);
  const [activeMobileFamilyId, setActiveMobileFamilyId] = useState(null);
  const [selectedVariationByFamily, setSelectedVariationByFamily] = useState({});
  const [usageHistory, setUsageHistory] = useState({});
  const [swipeAddedFamilyId, setSwipeAddedFamilyId] = useState('');
  const quickTileTouchStartRef = useRef({});
  const quickTileDidSwipeRef = useRef({});
  const loadMoreProductsRef = useRef(() => {});
  const productsLoadTriggerRef = useRef(null);
  const latestProductsRequestRef = useRef(0);
  const productsLoadingMoreRef = useRef(false);
  const productsAbortControllerRef = useRef(null);
  const productsTelemetryRef = useRef({
    sessionId: '',
    abVariant: 'control',
    lastEventAt: {}
  });
  const searchSuggestionsCacheRef = useRef(new Map());
  const searchSuggestionsRequestRef = useRef(0);
  const searchSuggestionsAbortRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchSuggestionsListId = 'products-search-suggestions-list';
  const productPageSize = getProductPageSize(isMobile);
  const serverCategoryFilter = groupBy === GROUP_BY_OPTIONS.category ? selectedCategory : 'all';

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const pageNode = productsPageRef.current;
    const controlsNode = controlsRef.current;
    if (!pageNode || !controlsNode) return undefined;

    const updateStickyMetrics = () => {
      const controlsHeight = Math.ceil(controlsNode.getBoundingClientRect().height || 0);
      pageNode.style.setProperty('--products-controls-height', `${Math.max(0, controlsHeight)}px`);
    };

    updateStickyMetrics();
    window.addEventListener('resize', updateStickyMetrics);
    let resizeObserver;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => updateStickyMetrics());
      resizeObserver.observe(controlsNode);
    }

    return () => {
      window.removeEventListener('resize', updateStickyMetrics);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let recentlyBoughtTimer = 0;
    fetchCategories();
    if (hasActiveUserSession()) {
      recentlyBoughtTimer = window.setTimeout(() => {
        fetchRecentlyBought();
      }, 450);
    }
    loadCart();
    setUsageHistory(safeReadJson(USAGE_HISTORY_KEY, {}));
    return () => {
      if (recentlyBoughtTimer) window.clearTimeout(recentlyBoughtTimer);
    };
  }, []);

  useEffect(() => {
    const query = String(searchInputValue || '').trim();
    if (searchSuggestionsAbortRef.current) {
      searchSuggestionsAbortRef.current.abort();
      searchSuggestionsAbortRef.current = null;
    }

    if (!searchSuggestionsEnabled) {
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
      setIsLoadingSuggestions(false);
      return undefined;
    }

    if (query.length < SEARCH_SUGGESTIONS_MIN_CHARS) {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
      setIsLoadingSuggestions(false);
      return undefined;
    }

    const cacheKey = normalizeText(query);
    const cacheRecord = searchSuggestionsCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cacheRecord && (now - Number(cacheRecord.at || 0)) < SEARCH_SUGGESTIONS_CACHE_TTL_MS) {
      setSearchSuggestions(cacheRecord.items);
      setShowSearchSuggestions(cacheRecord.items.length > 0);
      setActiveSuggestionIndex(-1);
      setIsLoadingSuggestions(false);
      return undefined;
    }

    const requestId = searchSuggestionsRequestRef.current + 1;
    searchSuggestionsRequestRef.current = requestId;
    setIsLoadingSuggestions(true);
    const controller = new AbortController();
    searchSuggestionsAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const payload = await productsApi.suggest({
          q: query,
          limit: SEARCH_SUGGESTIONS_MAX_ITEMS
        }, { signal: controller.signal });
        if (requestId !== searchSuggestionsRequestRef.current) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        searchSuggestionsCacheRef.current.set(cacheKey, { items, at: Date.now() });
        setSearchSuggestions(items);
        setShowSearchSuggestions(items.length > 0);
        setActiveSuggestionIndex(-1);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (requestId !== searchSuggestionsRequestRef.current) return;
        setSearchSuggestions([]);
        setShowSearchSuggestions(false);
      } finally {
        if (requestId === searchSuggestionsRequestRef.current) {
          setIsLoadingSuggestions(false);
        }
        if (searchSuggestionsAbortRef.current === controller) {
          searchSuggestionsAbortRef.current = null;
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (searchSuggestionsAbortRef.current === controller) {
        searchSuggestionsAbortRef.current = null;
      }
    };
  }, [searchInputValue, searchSuggestionsEnabled]);

  useEffect(() => {
    if (!showSearchSuggestions || activeSuggestionIndex < 0) return;
    const activeNode = document.getElementById(`products-search-suggestion-${activeSuggestionIndex}`);
    if (!activeNode || typeof activeNode.scrollIntoView !== 'function') return;
    activeNode.scrollIntoView({ block: 'nearest' });
  }, [showSearchSuggestions, activeSuggestionIndex, searchSuggestions.length]);

  const trackProductsEvent = useCallback((eventName, payload = {}, options = {}) => {
    if (typeof window === 'undefined') return;
    const name = String(eventName || '').trim();
    if (!name) return;
    const sessionId = String(productsTelemetryRef.current.sessionId || '').trim();
    if (!sessionId) return;
    const throttleMs = Math.max(0, Number(options.throttleMs || 0));
    const throttleKey = String(options.throttleKey || name);
    const now = Date.now();
    if (throttleMs > 0) {
      const previous = Number(productsTelemetryRef.current.lastEventAt[throttleKey] || 0);
      if (now - previous < throttleMs) return;
      productsTelemetryRef.current.lastEventAt[throttleKey] = now;
    }
    analyticsApi.heartbeat({
      session_id: sessionId,
      path: '/products',
      product_event: {
        name,
        at: new Date().toISOString(),
        session_id: sessionId,
        ab_variant: productsTelemetryRef.current.abVariant,
        ...payload
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const existingSessionId = readSessionStorageValue(PRODUCTS_TELEMETRY_SESSION_KEY);
    const nextSessionId = existingSessionId || createTelemetrySessionId();
    if (!existingSessionId) writeSessionStorageValue(PRODUCTS_TELEMETRY_SESSION_KEY, nextSessionId);
    const queryVariant = String(searchParams.get('ab') || '').trim().toLowerCase();
    let storedVariant = '';
    try {
      storedVariant = String(localStorage.getItem(PRODUCTS_AB_VARIANT_KEY) || '').trim().toLowerCase();
    } catch (_) {
      storedVariant = '';
    }
    const resolvedVariant = queryVariant || storedVariant || 'control';
    if (queryVariant && queryVariant !== storedVariant) {
      try {
        localStorage.setItem(PRODUCTS_AB_VARIANT_KEY, queryVariant);
      } catch (_) {
        // Ignore storage write issues.
      }
    }
    productsTelemetryRef.current.sessionId = nextSessionId;
    productsTelemetryRef.current.abVariant = resolvedVariant;
    trackProductsEvent('products_page_view', {
      group_by: groupBy,
      sort_by: sortBy,
      stock_only: inStockOnly ? 1 : 0,
      device: isMobile ? 'mobile' : 'desktop'
    }, { throttleMs: 2000, throttleKey: 'products_page_view' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trackProductsEvent('products_search_changed', {
      query_length: String(appliedSearchQuery || '').trim().length,
      has_query: appliedSearchQuery ? 1 : 0
    }, { throttleMs: 1200, throttleKey: 'products_search_changed' });
  }, [appliedSearchQuery, trackProductsEvent]);

  useEffect(() => {
    const nextCategory = searchParams.get('category') || 'all';
    const nextQuery = String(searchParams.get('q') || '');
    const nextSortBy = normalizeSortBy(searchParams.get('sort'));
    const nextGroupBy = searchParams.get('group') === GROUP_BY_OPTIONS.brand
      ? GROUP_BY_OPTIONS.brand
      : GROUP_BY_OPTIONS.category;
    const nextInStockOnly = searchParams.get('stock') === '1';

    setSelectedCategory((prev) => (prev === nextCategory ? prev : nextCategory));
    setSearchInputValue((prev) => (prev === nextQuery ? prev : nextQuery));
    setAppliedSearchQuery((prev) => (prev === nextQuery ? prev : nextQuery));
    setSortBy((prev) => (prev === nextSortBy ? prev : nextSortBy));
    setGroupBy((prev) => (prev === nextGroupBy ? prev : nextGroupBy));
    setInStockOnly((prev) => (prev === nextInStockOnly ? prev : nextInStockOnly));
    setSearchSuggestionsEnabled(false);
    setShowSearchSuggestions(false);
    setActiveSuggestionIndex(-1);
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const previous = params.toString();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    else params.delete('category');
    if (appliedSearchQuery) params.set('q', appliedSearchQuery);
    else params.delete('q');
    if (sortBy !== DEFAULT_SORT_BY) params.set('sort', sortBy);
    else params.delete('sort');
    if (groupBy !== GROUP_BY_OPTIONS.category) params.set('group', groupBy);
    else params.delete('group');
    if (inStockOnly) params.set('stock', '1');
    else params.delete('stock');
    if (params.toString() !== previous) {
      setSearchParams(params, { replace: true, preventScrollReset: true });
    }
  }, [selectedCategory, appliedSearchQuery, sortBy, groupBy, inStockOnly, searchParams, setSearchParams]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!showSearchSuggestions) return;
      const root = searchInputRef.current;
      if (!root) return;
      if (root.contains(event.target)) return;
      setSearchSuggestionsEnabled(false);
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [showSearchSuggestions]);

  useEffect(() => {
    if (!swipeAddedFamilyId) return undefined;
    const timer = setTimeout(() => setSwipeAddedFamilyId(''), 850);
    return () => clearTimeout(timer);
  }, [swipeAddedFamilyId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return undefined;
    const metrics = { lcp: 0, cls: 0, inp: 0 };
    let lcpObserver;
    let clsObserver;
    let inpObserver;
    let flushed = false;

    const flushVitals = () => {
      if (flushed) return;
      flushed = true;
      const sessionId = String(productsTelemetryRef.current.sessionId || '').trim();
      if (!sessionId) return;
      analyticsApi.heartbeat({
        session_id: sessionId,
        path: '/products',
        web_vitals: {
          session_id: sessionId,
          ab_variant: productsTelemetryRef.current.abVariant,
          lcp_ms: Math.round(Number(metrics.lcp || 0)),
          inp_ms: Math.round(Number(metrics.inp || 0)),
          cls: Number((metrics.cls || 0).toFixed(4)),
          captured_at: new Date().toISOString()
        }
      }).catch(() => {});
    };

    try {
      lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry?.startTime) metrics.lcp = Math.max(metrics.lcp, lastEntry.startTime);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {}

    try {
      clsObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput && Number.isFinite(entry.value)) {
            metrics.cls += entry.value;
          }
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}

    try {
      inpObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          const duration = Number(entry.duration || 0);
          if (duration > metrics.inp) metrics.inp = duration;
        });
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch (_) {}

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushVitals();
    };

    window.addEventListener('pagehide', flushVitals);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      lcpObserver?.disconnect();
      clsObserver?.disconnect();
      inpObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushVitals);
      flushVitals();
    };
  }, []);

  const fetchProductsPage = async ({ page, append, requestId, cacheKey = '' }) => {
    const controller = new AbortController();
    productsAbortControllerRef.current = controller;
    try {
      const serverSortBy = SORT_API_FALLBACK[sortBy] || sortBy;
      const params = {
        page: String(page),
        page_size: String(productPageSize),
        sort: serverSortBy,
      };
      if (serverCategoryFilter !== 'all') params.category = serverCategoryFilter;
      if (appliedSearchQuery) params.name = appliedSearchQuery;
      if (inStockOnly) params.in_stock = 'true';

      const data = await productsApi.getAll(params, { signal: controller.signal });
      if (requestId !== latestProductsRequestRef.current) return;

      const nextItems = Array.isArray(data)
        ? data
        : (Array.isArray(data?.items) ? data.items : []);
      const nextPagination = Array.isArray(data) ? null : (data?.pagination || null);
      const nextPage = Number(nextPagination?.page || page || 1);
      const nextHasMore = Boolean(nextPagination?.has_more);

      setProducts((prev) => {
        const merged = append ? [...prev, ...nextItems] : nextItems;
        if (!append && cacheKey) {
          safeWriteSessionJson(cacheKey, {
            items: merged,
            page: nextPage,
            has_more: nextHasMore,
            at: Date.now()
          });
        }
        return merged;
      });
      setProductsPage(nextPage);
      setProductsHasMore(nextHasMore);
      setError('');
    } catch (fetchError) {
      if (fetchError?.name === 'AbortError') return;
      if (requestId !== latestProductsRequestRef.current) return;
      console.error('Error fetching products:', fetchError);
      setError('Failed to load products. Please refresh and try again.');
      if (!append) {
        setProductsHasMore(false);
      } else {
        setProductsHasMore(false);
      }
    } finally {
      if (requestId !== latestProductsRequestRef.current) return;
      productsLoadingMoreRef.current = false;
      setLoading(false);
      setIsLoadingMore(false);
      if (productsAbortControllerRef.current === controller) {
        productsAbortControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (productsAbortControllerRef.current) {
      productsAbortControllerRef.current.abort();
      productsAbortControllerRef.current = null;
    }
    const cacheKey = buildProductsListSessionCacheKey({
      selectedCategory: serverCategoryFilter,
      query: appliedSearchQuery,
      sortBy,
      inStockOnly,
      pageSize: productPageSize
    });
    const cached = safeReadSessionJson(cacheKey, null);
    const isCacheFresh = Number(cached?.at || 0) > 0
      && (Date.now() - Number(cached?.at || 0)) < PRODUCTS_LIST_CACHE_TTL_MS
      && Array.isArray(cached?.items);
    if (isCacheFresh) {
      setProducts(cached.items);
      setProductsPage(Math.max(1, Number(cached?.page || 1)));
      setProductsHasMore(Boolean(cached?.has_more));
      setError('');
      setLoading(false);
    } else {
      setProducts((prev) => prev);
      setError('');
      setLoading(true);
    }
    const requestId = latestProductsRequestRef.current + 1;
    latestProductsRequestRef.current = requestId;
    productsLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    fetchProductsPage({ page: 1, append: false, requestId, cacheKey });
    return () => {
      if (productsAbortControllerRef.current) {
        productsAbortControllerRef.current.abort();
        productsAbortControllerRef.current = null;
      }
    };
  }, [serverCategoryFilter, appliedSearchQuery, sortBy, inStockOnly, productPageSize]);

  const fetchCategories = async () => {
    const cached = safeReadSessionJson(PRODUCTS_CATEGORIES_CACHE_KEY, null);
    const hasFreshCache = Number(cached?.at || 0) > 0
      && (Date.now() - Number(cached?.at || 0)) < PRODUCTS_CATEGORIES_CACHE_TTL_MS
      && Array.isArray(cached?.items);
    if (hasFreshCache) {
      setCategories(cached.items);
    }
    try {
      const data = await categoriesApi.getAll();
      const items = Array.isArray(data) ? data : [];
      setCategories(items);
      safeWriteSessionJson(PRODUCTS_CATEGORIES_CACHE_KEY, { items, at: Date.now() });
    } catch (fetchError) {
      console.error('Error fetching categories:', fetchError);
    }
  };

  const fetchRecentlyBought = async () => {
    try {
      const data = await productsApi.getRecentlyBought({ limit: RECENTLY_BOUGHT_LIMIT });
      setRecentlyBought(Array.isArray(data) ? data : []);
    } catch (_) {
      setRecentlyBought([]);
    }
  };

  const loadCart = () => {
    try {
      const savedCart = localStorage.getItem('barman_cart');
      if (!savedCart) return;
      const parsed = JSON.parse(savedCart);
      const cartData = Array.isArray(parsed) ? parsed : [];
      setCart(cartData);
      setCartCount(cartData.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    } catch (cartError) {
      console.error('Invalid cart data in localStorage, resetting cart', cartError);
      localStorage.removeItem('barman_cart');
      setCart([]);
      setCartCount(0);
    }
  };

  const cartQtyById = useMemo(() => {
    return cart.reduce((acc, item) => {
      acc[item.id] = Number(item.quantity || 0);
      return acc;
    }, {});
  }, [cart]);

  const productFamilies = useMemo(() => {
    const familyMap = new Map();
    products.forEach((product) => {
      const hierarchy = getProductHierarchy(product);
      const key = getFamilyKey(product, hierarchy);
      const variationSignature = [
        normalizeText(product?.name),
        normalizeText(hierarchy.brandPath || hierarchy.brand),
        Number(product?.price || 0).toFixed(2),
        Number(product?.mrp || product?.price || 0).toFixed(2),
        normalizeText(product?.content),
        normalizeText(product?.color)
      ].join('|');

      if (!familyMap.has(key)) {
        familyMap.set(key, {
          id: key,
          key,
          name: String(product.name || 'Product').trim() || 'Product',
          brand: hierarchy.brandPath || hierarchy.brand || '',
          brandRoot: hierarchy.brand || '',
          subBrand: hierarchy.subBrand || '',
          category: hierarchy.category || '',
          subcategory: hierarchy.subcategory || '',
          categoryPath: hierarchy.categoryPath || hierarchy.category || '',
          categoryIds: new Set(),
          description: String(product.description || '').trim(),
          variations: []
        });
      }
      const family = familyMap.get(key);
      const productCategoryId = Number(product?.category_id || 0);
      if (Number.isInteger(productCategoryId) && productCategoryId > 0) {
        family.categoryIds.add(productCategoryId);
      }
      const existingVariation = family.variations.find((variation) => variation.signature === variationSignature);
      if (existingVariation) {
        existingVariation.stock = Number(existingVariation.stock || 0) + Number(product.stock || 0);
        if (!existingVariation.description && product.description) {
          existingVariation.description = String(product.description || '').trim();
        }
      } else {
        family.variations.push({
          id: product.id,
          signature: variationSignature,
          name: String(product.name || '').trim(),
          brand: hierarchy.brandPath || hierarchy.brand || '',
          brandRoot: hierarchy.brand || '',
          subBrand: hierarchy.subBrand || '',
          category: hierarchy.categoryPath || hierarchy.category || '',
          categoryRoot: hierarchy.category || '',
          subcategory: hierarchy.subcategory || '',
          description: String(product.description || '').trim(),
          color: String(product.color || '').trim(),
          content: String(product.content || '').trim(),
          sku: String(product.sku || '').trim(),
          price: Number(product.price || 0),
          mrp: Number(product.mrp || 0),
          stock: Number(product.stock || 0),
          uom: String(product.uom || 'pcs').trim(),
          image: getProductImageSrc(product),
          raw: product
        });
      }
      if (!family.description && product.description) {
        family.description = String(product.description || '').trim();
      }
      if (!family.category && hierarchy.category) {
        family.category = hierarchy.category;
      }
      if (!family.categoryPath && hierarchy.categoryPath) {
        family.categoryPath = hierarchy.categoryPath;
      }
      if (!family.brand && (hierarchy.brandPath || hierarchy.brand)) {
        family.brand = hierarchy.brandPath || hierarchy.brand;
      }
      if (!family.brandRoot && hierarchy.brand) {
        family.brandRoot = hierarchy.brand;
      }
      if (!family.subBrand && hierarchy.subBrand) {
        family.subBrand = hierarchy.subBrand;
      }
      if (!family.subcategory && hierarchy.subcategory) {
        family.subcategory = hierarchy.subcategory;
      }
    });

    return [...familyMap.values()].map((family) => {
      const sortedVariations = [...family.variations].sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return String(a.content || '').localeCompare(String(b.content || ''));
      });
      const searchHaystack = [
        family.name,
        family.brand,
        family.brandRoot,
        family.subBrand,
        family.category,
        family.subcategory,
        family.categoryPath,
        family.description,
        ...sortedVariations.map((variation) => `${variation.content} ${variation.color} ${variation.sku}`)
      ]
        .map((value) => normalizeText(value))
        .join(' ');
      const searchTokens = Array.from(new Set(tokenizeSearchText(searchHaystack))).slice(0, 96);
      const minPrice = sortedVariations.reduce((min, variation) => Math.min(min, Number(variation.price || 0)), Infinity);
      const totalStock = sortedVariations.reduce((sum, variation) => sum + Number(variation.stock || 0), 0);
      const categoryIds = Array.from(family.categoryIds || [])
        .map((value) => Number(value || 0))
        .filter((value) => Number.isInteger(value) && value > 0);
      return {
        ...family,
        categoryIds,
        variations: sortedVariations,
        searchHaystack,
        searchTokens,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
        totalStock
      };
    });
  }, [products]);

  const effectiveCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories
        .map((category) => ({
          id: category.id || category.name,
          name: String(category.name || '').trim(),
          parent_id: category.parent_id ?? null,
          icon: String(category.icon || '').trim(),
          image: String(category.image || '').trim(),
          image_width: Number(category.image_width || 0) || null,
          image_height: Number(category.image_height || 0) || null,
        }))
        .filter((category) => category.name);
    }

    const unique = Array.from(new Set(
      productFamilies
        .map((family) => {
          const parsed = splitHierarchyValue(family.categoryPath || family.category);
          return String(parsed.parent || family.category || '').trim();
        })
        .filter(Boolean)
    ));
    return unique.map((name) => ({
      id: name,
      name,
      parent_id: null,
      icon: '',
      image: '',
      image_width: null,
      image_height: null
    }));
  }, [categories, productFamilies]);

  const effectiveBrands = useMemo(() => {
    const byName = new Map();
    productFamilies.forEach((family) => {
      const parsed = splitHierarchyValue(family.brandPath || family.brandRoot || family.brand);
      const rootName = String(parsed.parent || family.brandRoot || family.brand || '').trim();
      if (!rootName) return;
      const key = normalizeText(rootName);
      if (byName.has(key)) return;
      byName.set(key, {
        id: key,
        name: rootName,
        parent_id: null,
        icon: '',
        image: resolveBrandLogoUrl(rootName),
        image_width: 34,
        image_height: 34
      });
    });
    return [...byName.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [productFamilies]);

  const activeFilterOptions = useMemo(
    () => (groupBy === GROUP_BY_OPTIONS.brand ? effectiveBrands : effectiveCategories),
    [groupBy, effectiveBrands, effectiveCategories]
  );

  const categoryPathScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.category) return new Set();
    const scope = new Set();

    if (effectiveCategories.length > 0) {
      const byId = new Map(effectiveCategories.map((item) => [String(item.id), item]));
      const childIdsByParent = new Map();
      effectiveCategories.forEach((item) => {
        const parentId = item.parent_id;
        if (parentId === null || parentId === undefined || parentId === '') return;
        const parentKey = String(parentId);
        if (!childIdsByParent.has(parentKey)) childIdsByParent.set(parentKey, []);
        childIdsByParent.get(parentKey).push(String(item.id));
      });

      const seedIds = effectiveCategories
        .filter((item) => normalizeText(item.name) === selected)
        .map((item) => String(item.id));
      const queue = [...seedIds];
      const visited = new Set();
      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);
        const pathTokens = [];
        const pathSeen = new Set();
        let cursor = currentId;
        while (cursor && !pathSeen.has(cursor)) {
          pathSeen.add(cursor);
          const node = byId.get(cursor);
          if (!node?.name) break;
          pathTokens.unshift(normalizeText(node.name));
          const parent = node.parent_id;
          if (parent === null || parent === undefined || parent === '') break;
          cursor = String(parent);
        }
        if (pathTokens.length > 0) {
          for (let start = 0; start < pathTokens.length; start += 1) {
            const normalizedPath = pathTokens.slice(start).join(' ->');
            if (normalizedPath) scope.add(normalizedPath);
          }
        }
        (childIdsByParent.get(currentId) || []).forEach((childId) => {
          if (!visited.has(childId)) queue.push(childId);
        });
      }
    }

    if (scope.size === 0) scope.add(selected);

    return scope;
  }, [selectedCategory, groupBy, effectiveCategories]);

  const categoryNameScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.category) return new Set();
    const scope = new Set([selected]);
    if (effectiveCategories.length === 0) return scope;

    const childIdsByParent = new Map();
    effectiveCategories.forEach((item) => {
      const parentId = item.parent_id;
      if (parentId === null || parentId === undefined || parentId === '') return;
      const parentKey = String(parentId);
      if (!childIdsByParent.has(parentKey)) childIdsByParent.set(parentKey, []);
      childIdsByParent.get(parentKey).push(String(item.id));
    });

    const selectedIds = effectiveCategories
      .filter((item) => normalizeText(item.name) === selected)
      .map((item) => String(item.id));

    const queue = [...selectedIds];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const node = effectiveCategories.find((item) => String(item.id) === current);
      if (node?.name) scope.add(normalizeText(node.name));
      (childIdsByParent.get(current) || []).forEach((childId) => {
        if (!visited.has(childId)) queue.push(childId);
      });
    }

    return scope;
  }, [selectedCategory, groupBy, effectiveCategories]);

  const categoryIdScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.category || effectiveCategories.length === 0) return new Set();

    const childIdsByParent = new Map();
    effectiveCategories.forEach((item) => {
      const parentId = item.parent_id;
      if (parentId === null || parentId === undefined || parentId === '') return;
      const parentKey = String(parentId);
      if (!childIdsByParent.has(parentKey)) childIdsByParent.set(parentKey, []);
      childIdsByParent.get(parentKey).push(Number(item.id));
    });

    const selectedIds = effectiveCategories
      .filter((item) => normalizeText(item.name) === selected)
      .map((item) => Number(item.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const scope = new Set();
    const queue = [...selectedIds];
    const visited = new Set();
    while (queue.length > 0) {
      const current = Number(queue.shift() || 0);
      if (!Number.isInteger(current) || current <= 0 || visited.has(current)) continue;
      visited.add(current);
      scope.add(current);
      (childIdsByParent.get(String(current)) || []).forEach((childId) => {
        if (!visited.has(childId)) queue.push(childId);
      });
    }
    return scope;
  }, [selectedCategory, groupBy, effectiveCategories]);

  const brandPathScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.brand) return new Set();
    const scope = new Set();
    activeFilterOptions.forEach((option) => {
      if (normalizeText(option?.name) !== selected) return;
      const basePath = normalizePathValue(option?.name || '');
      if (basePath) scope.add(basePath);
    });
    if (scope.size === 0) scope.add(selected);
    return scope;
  }, [selectedCategory, groupBy, activeFilterOptions]);

  const filteredFamilies = useMemo(() => {
    const query = normalizeText(deferredAppliedSearchQuery);
    const selected = normalizeText(selectedCategory);
    const brandPathScopes = Array.from(brandPathScopeSet);
    const categoryPathScopes = Array.from(categoryPathScopeSet);
    const queryTokens = tokenizeSearchText(query);
    const queryTokenGroups = queryTokens.map((token) => {
      const directVariants = Array.isArray(PRODUCTS_SYNONYMS[token]) ? PRODUCTS_SYNONYMS[token] : [];
      const reverseVariants = Array.isArray(PRODUCTS_SYNONYM_REVERSE[token]) ? PRODUCTS_SYNONYM_REVERSE[token] : [];
      return Array.from(new Set([token, ...directVariants, ...reverseVariants].map((value) => normalizeText(value)).filter(Boolean)));
    });

    const getQueryMatchScore = (family) => {
      if (!query) return 0;
      const haystack = String(family.searchHaystack || '');
      const name = normalizeText(family.name);
      let score = 0;
      if (haystack.includes(query)) score += 24;
      if (name.startsWith(query)) score += 16;
      else if (name.includes(query)) score += 10;
      const tokens = Array.isArray(family.searchTokens) ? family.searchTokens : [];
      queryTokenGroups.forEach((group) => {
        const matched = group.some((candidate) => tokens.some((token) => tokenFuzzyMatch(candidate, token)));
        if (matched) score += 9;
      });
      return score;
    };

    let list = productFamilies.filter((family) => {
      const inStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
      if (selected !== 'all') {
        if (groupBy === GROUP_BY_OPTIONS.brand) {
          const familyBrandPath = normalizePathValue(family.brandPath || family.brandRoot || family.brand);
          const familyBrandRoot = normalizeText(family.brandRoot || splitHierarchyValue(family.brandPath || '').parent || family.brand);
          const matchesBrandPath = brandPathScopes.some((scopePath) => (
            familyBrandPath === scopePath || familyBrandPath.startsWith(`${scopePath} ->`)
          ));
          const matchesBrandRoot = familyBrandRoot === selected;
          if (!matchesBrandPath && !matchesBrandRoot) return false;
        } else {
          const familyCategoryIds = Array.isArray(family.categoryIds) ? family.categoryIds : [];
          const hasCategoryIds = familyCategoryIds.length > 0;
          const matchesCategoryIdTree = categoryIdScopeSet.size > 0
            && familyCategoryIds.some((id) => categoryIdScopeSet.has(Number(id)));
          if (hasCategoryIds) {
            if (!matchesCategoryIdTree) return false;
          } else if (categoryIdScopeSet.size > 0) {
            const familyCategoryPath = normalizePathValue(family.categoryPath || composeHierarchyLabel(family.category, family.subcategory));
            const matchesCategoryPath = categoryPathScopes.some((scopePath) => (
              familyCategoryPath === scopePath || familyCategoryPath.startsWith(`${scopePath} ->`)
            ));
            const familyCategoryTokens = new Set([
              ...normalizePathTokens(familyCategoryPath),
              normalizeText(family.category),
              normalizeText(family.subcategory)
            ].filter(Boolean));
            const matchesCategoryNameScope = Array.from(familyCategoryTokens).some((token) => categoryNameScopeSet.has(token));
            if (!matchesCategoryPath && !matchesCategoryNameScope) return false;
          } else {
            const familyCategoryPath = normalizePathValue(family.categoryPath || composeHierarchyLabel(family.category, family.subcategory));
            const matchesCategoryPath = categoryPathScopes.some((scopePath) => (
              familyCategoryPath === scopePath || familyCategoryPath.startsWith(`${scopePath} ->`)
            ));
            const familyCategoryRoot = normalizeText(family.category || splitHierarchyValue(family.categoryPath || '').parent);
            const familyCategoryTokens = new Set([
              ...normalizePathTokens(familyCategoryPath),
              familyCategoryRoot,
              normalizeText(family.subcategory)
            ].filter(Boolean));
            const matchesCategoryNameScope = Array.from(familyCategoryTokens).some((token) => categoryNameScopeSet.has(token));
            if (!matchesCategoryPath && !matchesCategoryNameScope) return false;
          }
        }
      }
      if (inStockOnly && !inStock) return false;
      if (!query) return true;
      if (String(family.searchHaystack || '').includes(query)) return true;
      if (queryTokenGroups.length === 0) return false;
      const tokens = Array.isArray(family.searchTokens) ? family.searchTokens : [];
      return queryTokenGroups.every((group) => (
        group.some((candidate) => tokens.some((token) => tokenFuzzyMatch(candidate, token)))
      ));
    });

    const getPopularityScore = (family) => {
      const history = usageHistory[family.id] || {};
      const addCount = Number(history.addCount || 0);
      const lastAddedAt = Date.parse(history.lastAddedAt || '');
      const daysSince = Number.isFinite(lastAddedAt)
        ? Math.max(0, (Date.now() - lastAddedAt) / 86400000)
        : 999;
      const hasDiscount = family.variations.some((variation) => Number(variation.mrp || variation.price || 0) > Number(variation.price || 0));
      const inStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
      const stockScore = inStock ? Math.min(18, Number(family.totalStock || 0) * 0.35) : -24;
      const recencyScore = Number.isFinite(lastAddedAt) ? Math.max(0, 22 - (daysSince * 2.6)) : 0;
      const discountScore = hasDiscount ? 6 : 0;
      const frequencyScore = Math.min(36, addCount * 8);
      return stockScore + recencyScore + discountScore + frequencyScore;
    };

    const sorters = {
      'price-asc': (a, b) => Number(a.minPrice || 0) - Number(b.minPrice || 0),
      'price-desc': (a, b) => Number(b.minPrice || 0) - Number(a.minPrice || 0),
      'stock-desc': (a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0),
      newest: (a, b) => Number(Math.max(...b.variations.map((variation) => Number(variation.id || 0)))) - Number(Math.max(...a.variations.map((variation) => Number(variation.id || 0)))),
      popular: (a, b) => {
        const aScore = getPopularityScore(a);
        const bScore = getPopularityScore(b);
        if (aScore !== bScore) return bScore - aScore;
        if (query) {
          const queryScoreDiff = getQueryMatchScore(b) - getQueryMatchScore(a);
          if (queryScoreDiff !== 0) return queryScoreDiff;
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
      },
      relevance: (a, b) => {
        if (!query) return String(a.name || '').localeCompare(String(b.name || ''));
        const queryScoreDiff = getQueryMatchScore(b) - getQueryMatchScore(a);
        if (queryScoreDiff !== 0) return queryScoreDiff;
        return normalizeText(a.name).localeCompare(normalizeText(b.name));
      }
    };

    const sortFn = sorters[sortBy] || sorters.relevance;
    list = [...list].sort((a, b) => {
      const aHasImage = familyHasImage(a) ? 1 : 0;
      const bHasImage = familyHasImage(b) ? 1 : 0;
      if (aHasImage !== bHasImage) return bHasImage - aHasImage;
      return sortFn(a, b);
    });
    return list;
  }, [productFamilies, deferredAppliedSearchQuery, selectedCategory, sortBy, inStockOnly, groupBy, categoryPathScopeSet, categoryIdScopeSet, categoryNameScopeSet, brandPathScopeSet, usageHistory]);

  useEffect(() => {
    setSelectedCategory('all');
  }, [groupBy]);

  useEffect(() => {
    if (selectedCategory === 'all') return;
    const exists = activeFilterOptions.some((option) => normalizeText(option.name) === normalizeText(selectedCategory));
    if (!exists) setSelectedCategory('all');
  }, [selectedCategory, activeFilterOptions]);

  useEffect(() => {
    setSelectedVariationByFamily((prev) => {
      const next = { ...prev };
      let changed = false;
      filteredFamilies.forEach((family) => {
        if (!family.variations.length) return;
        const current = next[family.id];
        const stillExists = family.variations.some((variation) => variation.id === current);
        if (!current || !stillExists) {
          const fallbackVariation = getFirstAvailableVariation(family);
          if (fallbackVariation?.id) {
            next[family.id] = fallbackVariation.id;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [filteredFamilies]);

  const visibleFamilies = filteredFamilies;
  const hasMoreProducts = productsHasMore;

  loadMoreProductsRef.current = () => {
    if (loading || isLoadingMore || productsLoadingMoreRef.current || !productsHasMore) return;
    trackProductsEvent('products_load_more', {
      current_page: Number(productsPage || 0),
      next_page: Number(productsPage || 0) + 1
    }, { throttleMs: 600, throttleKey: 'products_load_more' });
    const nextRequestId = latestProductsRequestRef.current;
    productsLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    fetchProductsPage({
      page: productsPage + 1,
      append: true,
      requestId: nextRequestId,
    });
  };

  useEffect(() => {
    if (loading) return;
    if (filteredFamilies.length !== 0) return;
    trackProductsEvent('products_no_results', {
      query_length: String(appliedSearchQuery || '').trim().length,
      category: selectedCategory,
      sort_by: sortBy,
      stock_only: inStockOnly ? 1 : 0
    }, { throttleMs: 1600, throttleKey: 'products_no_results' });
  }, [loading, filteredFamilies.length, appliedSearchQuery, selectedCategory, sortBy, inStockOnly, trackProductsEvent]);

  useEffect(() => {
    if (loading || isLoadingMore || !productsHasMore) return undefined;
    const node = productsLoadTriggerRef.current;
    if (!node || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          loadMoreProductsRef.current();
        }
      },
      { root: null, rootMargin: PRODUCTS_AUTOLOAD_ROOT_MARGIN, threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, isLoadingMore, productsHasMore, productsPage, serverCategoryFilter, appliedSearchQuery, sortBy, inStockOnly, productPageSize]);

  const visibleFamilyIndexById = useMemo(() => {
    return visibleFamilies.reduce((acc, family, index) => {
      acc[family.id] = index;
      return acc;
    }, {});
  }, [visibleFamilies]);

  const groupedVisibleFamilies = useMemo(() => {
    const topGroups = [];
    const topGroupMap = new Map();

    visibleFamilies.forEach((family) => {
      const topName = groupBy === GROUP_BY_OPTIONS.brand
        ? (String(family.brandRoot || '').trim() || 'Unbranded')
        : (String(family.category || '').trim() || 'General');
      const subName = groupBy === GROUP_BY_OPTIONS.brand
        ? (String(family.subBrand || '').trim() || 'General')
        : (String(family.subcategory || '').trim() || 'General');
      const topKey = normalizeText(topName) || '__group__';
      if (!topGroupMap.has(topKey)) {
        topGroupMap.set(topKey, {
          key: topKey,
          name: topName,
          total: 0,
          subGroups: [],
          subGroupMap: new Map()
        });
        topGroups.push(topGroupMap.get(topKey));
      }
      const topGroup = topGroupMap.get(topKey);
      topGroup.total += 1;

      const subKey = `${topKey}::${normalizeText(subName) || 'general'}`;
      if (!topGroup.subGroupMap.has(subKey)) {
        const nextSubGroup = {
          key: subKey,
          name: subName,
          total: 0,
          families: []
        };
        topGroup.subGroupMap.set(subKey, nextSubGroup);
        topGroup.subGroups.push(nextSubGroup);
      }
      const subGroup = topGroup.subGroupMap.get(subKey);
      subGroup.total += 1;
      subGroup.families.push(family);
    });

    return topGroups.map((group) => ({
      key: group.key,
      name: group.name,
      total: group.total,
      subGroups: group.subGroups
    }));
  }, [visibleFamilies, groupBy]);

  const getSelectedVariation = (family) => {
    const selectedId = selectedVariationByFamily[family.id];
    return family.variations.find((variation) => variation.id === selectedId) || getFirstAvailableVariation(family);
  };

  const handleSelectVariation = useCallback((familyId, variationId) => {
    setSelectedVariationByFamily((prev) => ({ ...prev, [familyId]: variationId }));
  }, []);

  const persistCart = useCallback((nextCart) => {
    setCart(nextCart);
    safeWriteJson('barman_cart', nextCart);
    setCartCount(nextCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
  }, [setCartCount]);

  const markVariationIdsAsAdded = useCallback((variationIds = []) => {
    const uniqueIds = [...new Set(variationIds.map((value) => Number(value || 0)).filter((value) => value > 0))];
    if (!uniqueIds.length) return;
    setButtonStatus((prev) => {
      const next = { ...prev };
      uniqueIds.forEach((id) => {
        next[id] = 'added';
      });
      return next;
    });
    setTimeout(() => {
      setButtonStatus((prev) => {
        const next = { ...prev };
        uniqueIds.forEach((id) => {
          next[id] = '';
        });
        return next;
      });
    }, 900);
  }, []);

  const recordUsageEntries = useCallback((entries = []) => {
    if (!entries.length) return;
    setUsageHistory((prev) => {
      const next = { ...prev };
      const nowIso = new Date().toISOString();
      entries.forEach(({ family, variation, quantity }) => {
        const familyId = String(family?.id || '').trim();
        if (!familyId || !variation) return;
        const existing = next[familyId] || {};
        next[familyId] = {
          familyId,
          familyName: String(family?.name || existing.familyName || '').trim() || 'Product',
          category: String(family?.category || variation?.category || existing.category || '').trim(),
          variationId: Number(variation.id || existing.variationId || 0),
          addCount: Number(existing.addCount || 0) + 1,
          totalQty: Number(existing.totalQty || 0) + Math.max(1, Number(quantity || 1)),
          lastAddedAt: nowIso
        };
      });
      safeWriteJson(USAGE_HISTORY_KEY, next);
      return next;
    });
  }, []);

  const buildCartWithAdditions = (baseCart, entries = []) => {
    let nextCart = Array.isArray(baseCart) ? [...baseCart] : [];
    let requestCount = 0;
    const appliedEntries = [];

    entries.forEach(({ family, variation, quantity }) => {
      if (!family || !variation) return;
      const qtyToAdd = Math.max(1, Number(quantity || 1));
      const productStock = Math.max(0, Number(variation.stock || 0));
      const existingIndex = nextCart.findIndex((item) => Number(item.id || 0) === Number(variation.id || 0));

      if (existingIndex >= 0) {
        const existingItem = nextCart[existingIndex];
        const nextQuantity = Number(existingItem.quantity || 0) + qtyToAdd;
        const nextOutOfStock = (productStock <= 0 || nextQuantity > productStock) ? 1 : 0;
        nextCart[existingIndex] = {
          ...existingItem,
          quantity: nextQuantity,
          out_of_stock_request: nextOutOfStock,
        };
        if (nextOutOfStock) requestCount += 1;
      } else {
        const outOfStockRequest = (productStock <= 0 || qtyToAdd > productStock) ? 1 : 0;
        nextCart = [
          ...nextCart,
          {
            id: variation.id,
            name: family.name,
            brand: family.brand,
            category: variation.category,
            content: variation.content,
            color: variation.color,
            image: variation.image,
            price: Number(variation.price || 0),
            stock: productStock,
            uom: variation.uom || 'pcs',
            quantity: qtyToAdd,
            out_of_stock_request: outOfStockRequest,
          }
        ];
        if (outOfStockRequest) requestCount += 1;
      }

      appliedEntries.push({ family, variation, quantity: qtyToAdd });
    });

    return { nextCart, requestCount, appliedEntries };
  };

  const addEntriesToCart = useCallback((entries = [], options = {}) => {
    const validEntries = entries.filter((entry) => entry?.family && entry?.variation);
    if (!validEntries.length) return;

    const persistedCart = safeReadJson('barman_cart', cart);
    const baseCart = Array.isArray(persistedCart) ? persistedCart : cart;
    const { nextCart, requestCount, appliedEntries } = buildCartWithAdditions(baseCart, validEntries);
    if (!appliedEntries.length) return;
    persistCart(nextCart);
    recordUsageEntries(appliedEntries);
    markVariationIdsAsAdded(appliedEntries.map((entry) => entry.variation.id));
    trackProductsEvent('products_add_to_cart', {
      entry_count: appliedEntries.length,
      total_qty: appliedEntries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
      request_mode_items: requestCount,
      source: String(options?.source || 'catalog')
    }, { throttleMs: 220, throttleKey: 'products_add_to_cart' });

    if (options?.markSwipeFamilyId) {
      setSwipeAddedFamilyId(String(options.markSwipeFamilyId));
    }

    if (requestCount > 0) {
      setNotice({
        type: 'info',
        message: requestCount > 1
          ? `${requestCount} items are in request mode due to low stock.`
          : 'Added as a requested item. Billing team will confirm availability.',
      });
    }
  }, [cart, persistCart, recordUsageEntries, markVariationIdsAsAdded, trackProductsEvent]);

  const addToCart = useCallback((family, variation, quantity = 1) => {
    addEntriesToCart([{ family, variation, quantity }], { source: 'catalog_add' });
  }, [addEntriesToCart]);

  const decreaseFromCart = useCallback((variation) => {
    if (!variation) return;
    const existingItem = cart.find((item) => Number(item.id || 0) === Number(variation.id || 0));
    if (!existingItem) return;

    const nextQty = Math.max(0, Number(existingItem.quantity || 0) - 1);
    const newCart = nextQty === 0
      ? cart.filter((item) => Number(item.id || 0) !== Number(variation.id || 0))
      : cart.map((item) => (Number(item.id || 0) === Number(variation.id || 0) ? { ...item, quantity: nextQty } : item));

    persistCart(newCart);
  }, [cart, persistCart]);

  const handleQuickTileTouchStart = (family, event) => {
    const startX = Number(event?.touches?.[0]?.clientX || 0);
    if (!family?.id || !startX) return;
    quickTileTouchStartRef.current[family.id] = startX;
    quickTileDidSwipeRef.current[family.id] = false;
  };

  const handleQuickTileTouchEnd = (family, event) => {
    if (!family?.id) return;
    const startX = Number(quickTileTouchStartRef.current[family.id] || 0);
    delete quickTileTouchStartRef.current[family.id];
    const endX = Number(event?.changedTouches?.[0]?.clientX || 0);
    const deltaX = endX - startX;
    if (deltaX < 56) return;
    const variation = getSelectedVariation(family);
    quickTileDidSwipeRef.current[family.id] = true;
    addEntriesToCart([{ family, variation }], { markSwipeFamilyId: family.id, source: 'quick_swipe' });
  };

  const openFamilyDetails = useCallback((familyId) => {
    trackProductsEvent('products_open_detail', {
      family_id: String(familyId || ''),
      device: isMobile ? 'mobile' : 'desktop'
    }, { throttleMs: 240, throttleKey: `products_open_detail_${familyId}` });
    if (isMobile) {
      setActiveMobileFamilyId(familyId);
      return;
    }
    setActiveDesktopFamilyId((prev) => (prev === familyId ? null : familyId));
  }, [isMobile, trackProductsEvent]);

  const activeMobileFamily = useMemo(
    () => filteredFamilies.find((family) => family.id === activeMobileFamilyId) || null,
    [filteredFamilies, activeMobileFamilyId]
  );

  const familyById = useMemo(
    () => new Map(productFamilies.map((family) => [family.id, family])),
    [productFamilies]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cart]
  );

  const cartPreviewTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0),
    [cart]
  );

  const familyByVariationId = useMemo(() => {
    const byVariation = new Map();
    productFamilies.forEach((family) => {
      family.variations.forEach((variation) => {
        byVariation.set(Number(variation.id || 0), family);
      });
    });
    return byVariation;
  }, [productFamilies]);

  const recentlyBoughtFamilies = useMemo(() => {
    const seen = new Set();
    const rows = Array.isArray(recentlyBought) ? recentlyBought : [];
    const list = [];
    rows.forEach((row) => {
      const productId = Number(row?.product_id || row?.product?.id || 0);
      const family = familyByVariationId.get(productId);
      if (!family) return;
      if (seen.has(family.id)) return;
      seen.add(family.id);
      list.push(family);
    });
    return list;
  }, [recentlyBought, familyByVariationId]);

  const quickAddFamilies = useMemo(() => {
    const sourceList = selectedCategory !== 'all' ? filteredFamilies : productFamilies;
    if (!sourceList.length) return [];
    const now = Date.now();
    const scored = sourceList.map((family, index) => {
      const history = usageHistory[family.id] || {};
      const addCount = Number(history.addCount || 0);
      const lastAddedAt = Date.parse(history.lastAddedAt || '');
      const daysSince = Number.isFinite(lastAddedAt) ? Math.max(0, (now - lastAddedAt) / 86400000) : 30;
      const inStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
      const score = (addCount * 12) + (inStock ? 15 : 0) + (daysSince < 5 ? 6 : 0) - (index * 0.015);
      return { family, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, isMobile ? 8 : 10)
      .map((entry) => entry.family);
  }, [selectedCategory, filteredFamilies, productFamilies, usageHistory, isMobile]);

  const repeatOrderFamilies = useMemo(() => {
    if (recentlyBoughtFamilies.length > 0) return recentlyBoughtFamilies.slice(0, 6);
    if (!quickAddFamilies.length) return [];
    return quickAddFamilies.slice(0, 4);
  }, [recentlyBoughtFamilies, quickAddFamilies]);

  const smartRestockItems = useMemo(() => {
    const now = Date.now();
    return Object.values(usageHistory)
      .map((entry) => {
        const family = familyById.get(entry.familyId);
        if (!family) return null;
        const selectedVariation = getSelectedVariation(family);
        if (!selectedVariation) return null;
        const lastAddedAt = Date.parse(entry.lastAddedAt || '');
        if (!Number.isFinite(lastAddedAt)) return null;
        const daysSince = Math.max(0, (now - lastAddedAt) / 86400000);
        const usageWindowDays = getUsageWindowDays(family.name, family.category, entry.addCount);
        const depletionPercent = Math.min(100, Math.round((daysSince / usageWindowDays) * 100));
        if (depletionPercent < RESTOCK_ALERT_THRESHOLD) return null;
        return {
          id: family.id,
          family,
          variation: selectedVariation,
          depletionPercent,
          usageWindowDays,
          daysSince: Number(daysSince.toFixed(1)),
          tone: depletionPercent >= CRITICAL_RESTOCK_THRESHOLD ? 'critical' : 'warning'
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.depletionPercent - a.depletionPercent)
      .slice(0, isMobile ? 4 : 6);
  }, [usageHistory, familyById, isMobile, selectedVariationByFamily]);

  const comboSuggestions = useMemo(() => {
    const pickByKeywords = (keywords = []) => {
      const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword));
      return quickAddFamilies.find((family) => {
        const haystack = `${family.name} ${family.category} ${family.brand}`.toLowerCase();
        return normalizedKeywords.some((keyword) => haystack.includes(keyword));
      });
    };

    const comboTemplates = [
      {
        id: 'breakfast-combo',
        title: 'Breakfast Combo',
        subtitle: 'Milk + Bread + Eggs',
        matchers: [['milk', 'dairy'], ['bread'], ['egg']]
      },
      {
        id: 'tea-time-pack',
        title: 'Tea Time Pack',
        subtitle: 'Tea + Biscuit + Sugar',
        matchers: [['tea'], ['biscuit', 'cookie'], ['sugar']]
      }
    ];

    const combos = comboTemplates.map((template) => {
      const items = template.matchers
        .map((group) => pickByKeywords(group))
        .filter(Boolean)
        .filter((family, index, arr) => arr.findIndex((item) => item.id === family.id) === index)
        .slice(0, 3);
      if (items.length < 2) return null;
      const subtotal = items.reduce((sum, family) => sum + Number(getSelectedVariation(family)?.price || 0), 0);
      const saveAmount = Math.max(2, Math.round(subtotal * 0.08));
      return {
        id: template.id,
        title: template.title,
        subtitle: template.subtitle,
        items,
        subtotal,
        saveAmount,
        finalPrice: Math.max(0, subtotal - saveAmount)
      };
    }).filter(Boolean);

    if (combos.length > 0) return combos;

    if (quickAddFamilies.length >= 3) {
      const fallbackItems = quickAddFamilies.slice(0, 3);
      const subtotal = fallbackItems.reduce((sum, family) => sum + Number(getSelectedVariation(family)?.price || 0), 0);
      return [{
        id: 'smart-bundle',
        title: 'Smart Basket',
        subtitle: fallbackItems.map((family) => family.name).join(' + '),
        items: fallbackItems,
        subtotal,
        saveAmount: Math.max(1, Math.round(subtotal * 0.05)),
        finalPrice: Math.max(0, subtotal - Math.max(1, Math.round(subtotal * 0.05)))
      }];
    }

    return [];
  }, [quickAddFamilies, selectedVariationByFamily]);

  const addFamilyPackToCart = (families = [], options = {}) => {
    const entries = families
      .map((family) => ({ family, variation: getSelectedVariation(family), quantity: 1 }))
      .filter((entry) => entry.variation);
    addEntriesToCart(entries, options);
  };

  const handleRepeatOrder = () => {
    addFamilyPackToCart(repeatOrderFamilies, { source: 'repeat_order' });
  };

  const handleRestockAll = () => {
    const entries = smartRestockItems.map((item) => ({
      family: item.family,
      variation: item.variation,
      quantity: 1
    }));
    addEntriesToCart(entries, { source: 'restock_all' });
  };

  const handleAddCombo = (combo) => {
    if (!combo?.items?.length) return;
    addFamilyPackToCart(combo.items, { source: `combo_${String(combo.id || 'unknown')}` });
  };

  const estimatedGridColumns = isMobile ? 2 : 4;
  const eagerImageBudget = isMobile ? ABOVE_FOLD_EAGER_IMAGE_COUNT.mobile : ABOVE_FOLD_EAGER_IMAGE_COUNT.desktop;

  const renderFamilyCard = (family) => {
    const selectedVariation = getSelectedVariation(family);
    const isActiveDesktop = !isMobile && activeDesktopFamilyId === family.id;
    const animationIndex = Number(visibleFamilyIndexById[family.id] || 0);
    const shouldPrioritizeImage = animationIndex < eagerImageBudget;
    const cardState = getFamilyCardState(family, selectedVariation, cartQtyById);
    if (!cardState.selectedVariation) return null;

    return (
      <FamilyProductCard
        key={family.id}
        family={family}
        cardState={cardState}
        variant="default"
        animationDelay={`${animationIndex * 0.04}s`}
        onOpenDetails={() => openFamilyDetails(family.id)}
        onAdd={addToCart}
        onDecrease={decreaseFromCart}
        showMetaLine={!isMobile}
        imageLoading={shouldPrioritizeImage ? 'eager' : 'lazy'}
        imageFetchPriority={shouldPrioritizeImage ? 'high' : 'low'}
        detailContent={isActiveDesktop ? (
          <ProductDetailView
            family={family}
            selectedVariationId={cardState.selectedVariation.id}
            onSelectVariation={handleSelectVariation}
            onIncreaseQty={addToCart}
            onDecreaseQty={decreaseFromCart}
            cartQtyById={cartQtyById}
            buttonStatus={buttonStatus}
            showImage={false}
          />
        ) : null}
      />
    );
  };

  const renderQuickAddTile = (family) => {
    const selectedVariation = getSelectedVariation(family);
    const cardState = getFamilyCardState(family, selectedVariation, cartQtyById);
    const isSwipeAdded = swipeAddedFamilyId === family.id;
    const isButtonAdded = buttonStatus[cardState.selectedVariation?.id] === 'added';
    const isAddedState = isSwipeAdded || isButtonAdded;
    if (!cardState.selectedVariation) return null;

    return (
      <FamilyProductCard
        key={family.id}
        family={family}
        cardState={cardState}
        variant="compact"
        isAddedState={isAddedState}
        onTouchStart={(event) => handleQuickTileTouchStart(family, event)}
        onTouchEnd={(event) => handleQuickTileTouchEnd(family, event)}
        onOpenDetails={() => {
          if (quickTileDidSwipeRef.current[family.id]) {
            quickTileDidSwipeRef.current[family.id] = false;
            return;
          }
          openFamilyDetails(family.id);
        }}
        onAdd={addToCart}
        onDecrease={decreaseFromCart}
        showMetaLine={false}
        showSwipeHint
        imageLoading="lazy"
        imageFetchPriority="low"
      />
    );
  };

  const renderCategoryChipLabel = (category, mode = 'category') => {
    if (mode === 'brand') {
      return <BrandFilterVisual logo={category?.image} name={category?.name} />;
    }

    const hasImage = String(category?.image || '').trim().length > 0;
    const hasIcon = String(category?.icon || '').trim().length > 0;
    const iconText = hasIcon ? String(category.icon || '').trim() : getDefaultCategoryIcon(category?.name);
    const width = Math.max(16, Math.round(Number(category?.image_width || 18)));
    const height = Math.max(16, Math.round(Number(category?.image_height || 18)));
    return (
      <>
        {hasImage ? (
          <img
            src={resolveMediaUrl(category.image)}
            alt=""
            className="category-chip-image"
            width={width}
            height={height}
            loading="lazy"
          />
        ) : (
          <span className="category-chip-icon">{iconText}</span>
        )}
        <span className="category-chip-label">{category.name}</span>
      </>
    );
  };

  const renderSmartSections = () => (
    <section className="products-secondary-sections">
      <header className="products-secondary-section-title">
        <h2>Smart Picks For You</h2>
        <p>Reorder faster with personalized shortcuts.</p>
      </header>

      {repeatOrderFamilies.length > 0 && (
        <section className="products-feature-block repeat-order-block">
          <div className="feature-block-header">
            <h2><RotateCcw size={16} /> 1-Tap Repeat Order</h2>
            <button type="button" className="feature-action-btn" onClick={handleRepeatOrder}>
              Repeat Order
            </button>
          </div>
          <small className="repeat-order-caption">
            {recentlyBoughtFamilies.length > 0 ? 'From your recently bought products' : 'From your quick-add history'}
          </small>
          <div className="repeat-order-grid horizontal-group-row">
            {repeatOrderFamilies.map((family) => {
              const selectedVariation = getSelectedVariation(family);
              const previewVariation = getFamilyPreviewVariation(family, selectedVariation);
              return (
                <article key={`repeat-${family.id}`} className="repeat-order-item">
                  <div className="repeat-order-thumb" aria-hidden="true">
                    <SafeProductImage
                      src={previewVariation?.image}
                      alt=""
                      className="repeat-order-thumb-img"
                      loading="lazy"
                      fallbackProduct={previewVariation?.raw || selectedVariation?.raw}
                      width={42}
                      height={42}
                    />
                  </div>
                  <span className="repeat-order-name">{family.name}</span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="products-feature-block restock-block">
        <div className="feature-block-header">
          <h2><Sparkles size={16} /> Smart Restock</h2>
          <button
            type="button"
            className="feature-action-btn"
            onClick={handleRestockAll}
            disabled={smartRestockItems.length === 0}
          >
            Restock All
          </button>
        </div>
        {smartRestockItems.length === 0 ? (
          <p className="feature-empty">
            Add a few items to unlock restock prediction.
          </p>
        ) : (
          <div className="restock-list horizontal-group-row">
            {smartRestockItems.map((item) => (
              <article key={item.id} className="restock-item">
                <div className="restock-item-top">
                  <div className="restock-item-media" aria-hidden="true">
                    <SafeProductImage
                      src={item.variation?.image}
                      alt=""
                      className="restock-item-media-img"
                      loading="lazy"
                      fallbackProduct={item.variation?.raw}
                      width={46}
                      height={46}
                    />
                  </div>
                  <div className="restock-item-head">
                    <strong>{item.family.name}</strong>
                    <span>{item.depletionPercent}% low</span>
                  </div>
                </div>
                <div className={`restock-progress ${item.tone}`}>
                  <span style={{ width: `${item.depletionPercent}%` }} />
                </div>
                <div className="restock-item-footer">
                  <small>{item.daysSince}d ago</small>
                  <button type="button" onClick={() => addToCart(item.family, item.variation)}>+ Restock</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {quickAddFamilies.length > 0 && (
        <section className="products-feature-block quick-add-block">
          <div className="feature-block-header">
            <h2>Quick Add</h2>
            <small>Swipe or tap to add</small>
          </div>
          <div className="quick-add-grid horizontal-group-row">
            {quickAddFamilies.map((family) => renderQuickAddTile(family))}
          </div>
        </section>
      )}

      {comboSuggestions.length > 0 && (
        <section className="products-feature-block combo-block">
          <div className="feature-block-header">
            <h2>Combo Deals</h2>
          </div>
          <div className="combo-list horizontal-group-row">
            {comboSuggestions.map((combo) => (
              <article key={combo.id} className="combo-card">
                <h3>{combo.title}</h3>
                <p>{combo.subtitle}</p>
                <div className="combo-price-row">
                  <strong>{formatCurrency(combo.finalPrice)}</strong>
                  <span>Save {formatCurrency(combo.saveAmount)}</span>
                </div>
                <button type="button" onClick={() => handleAddCombo(combo)}>Add Combo</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );

  const commitSearchQuery = useCallback((value = searchInputValue) => {
    const nextValue = String(value || '').trim().slice(0, 80);
    setSearchInputValue(nextValue);
    setSearchSuggestionsEnabled(false);
    setSearchSuggestions([]);
    setShowSearchSuggestions(false);
    setActiveSuggestionIndex(-1);
    startTransition(() => {
      setAppliedSearchQuery(nextValue);
    });
  }, [searchInputValue]);

  const selectSearchSuggestion = useCallback((suggestion) => {
    const label = String(suggestion?.name || '').trim();
    if (!label) return;
    commitSearchQuery(label);
    trackProductsEvent('products_search_suggestion_select', {
      suggestion_id: Number(suggestion?.id || 0),
      suggestion_name: label
    }, { throttleMs: 200, throttleKey: 'products_search_suggestion_select' });
  }, [commitSearchQuery, trackProductsEvent]);

  const clearSearchQuery = useCallback(() => {
    commitSearchQuery('');
  }, [commitSearchQuery]);

  if (loading && products.length === 0) {
    const skeletonCount = isMobile ? 6 : 8;
    return (
      <div className="products-page">
        <div className="products-skeleton-header shimmer-skeleton" aria-hidden="true" />
        <div className="products-skeleton-controls shimmer-skeleton" aria-hidden="true" />
        <div className="products-skeleton-grid" aria-hidden="true">
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <div key={`product-skeleton-${index}`} className="product-skeleton-card shimmer-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="products-page" ref={productsPageRef}>
      {loading && products.length > 0 ? (
        <div className="products-refresh-banner" aria-live="polite">
          Updating products...
        </div>
      ) : null}
      {notice && (
        <div className={`products-notice ${notice.type === 'error' ? 'error' : 'info'}`}>
          {notice.message}
        </div>
      )}

      <div className="products-header fade-in-up">
        <div className="products-header-main">
          <div>
            <h1>Daily Needs, Fast</h1>
            <p>Restock, repeat, and quick add in seconds.</p>
          </div>
          <Link to="/cart" className="products-cart-pill" aria-label="Open cart">
            <ShoppingCart size={16} />
            <span>{cartItemCount}</span>
          </Link>
        </div>
      </div>

      {error && <div className="products-error">{error}</div>}

      <div className="products-controls sticky-controls slide-in-left" ref={controlsRef}>
        <div className="search-row">
          <div className="search-input-wrap" ref={searchInputRef}>
            <Search size={18} />
            <input
              id="products-search-input"
              name="search"
              type="text"
              placeholder="Search milk, rice, biscuit..."
              value={searchInputValue}
              onChange={(event) => {
                const nextValue = String(event.target.value || '').slice(0, 80);
                const trimmedValue = nextValue.trim();
                setSearchInputValue(nextValue);
                if (!trimmedValue) {
                  setSearchSuggestionsEnabled(false);
                  setSearchSuggestions([]);
                  setShowSearchSuggestions(false);
                  setActiveSuggestionIndex(-1);
                  startTransition(() => {
                    setAppliedSearchQuery('');
                  });
                  return;
                }
                setSearchSuggestionsEnabled(trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS);
                setShowSearchSuggestions(trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS);
              }}
              onFocus={() => {
                const trimmedValue = String(searchInputValue || '').trim();
                const shouldEnable = trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS;
                setSearchSuggestionsEnabled(shouldEnable);
                if (shouldEnable && searchSuggestions.length > 0) setShowSearchSuggestions(true);
              }}
              onKeyDown={(event) => {
                if (!showSearchSuggestions || searchSuggestions.length === 0) {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitSearchQuery();
                  } else if (event.key === 'Escape') {
                    setShowSearchSuggestions(false);
                  }
                  return;
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveSuggestionIndex((prev) => {
                    const next = prev + 1;
                    return next >= searchSuggestions.length ? 0 : next;
                  });
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveSuggestionIndex((prev) => {
                    if (prev <= 0) return searchSuggestions.length - 1;
                    return prev - 1;
                  });
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
                    selectSearchSuggestion(searchSuggestions[activeSuggestionIndex]);
                  } else {
                    commitSearchQuery();
                  }
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setShowSearchSuggestions(false);
                  setActiveSuggestionIndex(-1);
                }
              }}
              aria-label="Search products"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSearchSuggestions && searchSuggestions.length > 0}
              aria-controls={searchSuggestionsListId}
              aria-activedescendant={
                activeSuggestionIndex >= 0 ? `products-search-suggestion-${activeSuggestionIndex}` : undefined
              }
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
            />
            {searchInputValue ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={clearSearchQuery}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
            {isLoadingSuggestions ? <span className="search-suggest-loading" aria-live="polite">Loading</span> : null}
            {showSearchSuggestions && searchSuggestions.length > 0 ? (
              <div id={searchSuggestionsListId} className="search-suggestions" role="listbox" aria-label="Search suggestions">
                {searchSuggestions.slice(0, SEARCH_SUGGESTIONS_MAX_ITEMS).map((item, index) => (
                  <button
                    type="button"
                    id={`products-search-suggestion-${index}`}
                    key={`suggestion-${item.id}-${index}`}
                    className={`search-suggestion-item ${index === activeSuggestionIndex ? 'active' : ''}`}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    onClick={() => selectSearchSuggestion(item)}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                  >
                    <div className="search-suggestion-leading" aria-hidden="true">
                      <img
                        src={getSuggestionImageSrc(item)}
                        alt=""
                        className="search-suggestion-thumb"
                        width={34}
                        height={34}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = getProductFallbackImage(item);
                        }}
                      />
                    </div>
                    <div className="search-suggestion-main">
                      {item.brand ? <strong>{item.brand}</strong> : null}
                      <span>{item.name}</span>
                    </div>
                    <div className="search-suggestion-meta">
                      {item.size ? <small>{item.size}</small> : null}
                      <small>{formatCurrency(item.price)}</small>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="products-control-summary">
          <span>{cartItemCount} items in cart</span>
          <strong>{formatCurrency(cartPreviewTotal)}</strong>
        </div>

        {isMobile ? (
          <div className="mobile-filter-launch-row">
            <button type="button" className="mobile-filter-btn" onClick={() => setShowMobileFilters(true)}>
              <Filter size={16} /> Filters & Sort
            </button>
            <label className="stock-only-toggle">
              <input
                id="products-stock-only-mobile"
                name="stock_only"
                type="checkbox"
                checked={inStockOnly}
                onChange={(event) => setInStockOnly(event.target.checked)}
              />
              In-stock only
            </label>
          </div>
        ) : (
          <div className="desktop-sort-row">
            <div className="sort-group">
              <Filter size={16} />
              <select
                id="products-group-by"
                name="group_by"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value)}
                aria-label="Group products"
              >
                <option value={GROUP_BY_OPTIONS.category}>Group: Category {'->'} Sub-category</option>
                <option value={GROUP_BY_OPTIONS.brand}>Group: Brand {'->'} Sub-brand</option>
              </select>
            </div>
            <div className="sort-group">
              <SlidersHorizontal size={16} />
              <select
                id="products-sort-by"
                name="sort_by"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                aria-label="Sort products"
              >
                <option value="popular">Popular for you</option>
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="stock-desc">Stock: High to Low</option>
              </select>
            </div>
            <label className="stock-only-toggle">
              <input
                id="products-stock-only-desktop"
                name="stock_only"
                type="checkbox"
                checked={inStockOnly}
                onChange={(event) => setInStockOnly(event.target.checked)}
              />
              In-stock only
            </label>
          </div>
        )}
      </div>

      <div className="products-category-strip sticky-category-strip">
        <button
          type="button"
          className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          {renderCategoryChipLabel(
            { name: 'All', icon: '🛒', image: '' },
            groupBy === GROUP_BY_OPTIONS.brand ? 'brand' : 'category'
          )}
        </button>
        {activeFilterOptions.map((category) => (
          <button
            type="button"
            key={category.id}
            className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${normalizeText(selectedCategory) === normalizeText(category.name) ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category.name)}
            aria-label={category.name}
          >
            {renderCategoryChipLabel(category, groupBy === GROUP_BY_OPTIONS.brand ? 'brand' : 'category')}
          </button>
        ))}
      </div>

      <div className="result-summary" aria-live="polite">
        <span>
          {visibleFamilies.length} product groups
        </span>
      </div>

      <div className="products-grouped-list">
        {groupedVisibleFamilies.map((topGroup) => (
          <section key={topGroup.key} className="products-group-section">
            <header className="products-group-header">
              <h2>{topGroup.name}</h2>
              <span>{topGroup.total}</span>
            </header>
            <div className="products-subgroups-wrap">
              {topGroup.subGroups.map((subGroup) => (
                <div key={subGroup.key} className="products-subgroup">
                  <div className="products-subgroup-header">
                    <h3>{subGroup.name}</h3>
                    <span>{subGroup.total}</span>
                  </div>
                  <VirtualizedFamilyGrid
                    families={subGroup.families}
                    renderFamilyCard={renderFamilyCard}
                    estimatedColumns={estimatedGridColumns}
                    shouldVirtualize={subGroup.families.length >= VIRTUALIZE_GROUP_THRESHOLD}
                    estimatedCardHeight={isMobile ? 248 : 326}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {hasMoreProducts && (
        <div className="load-more-wrap">
          <div ref={productsLoadTriggerRef} className="products-infinite-sentinel" aria-hidden="true" />
          <span className="load-more-status">
            {isLoadingMore ? 'Loading more products...' : 'More products load automatically as you scroll.'}
          </span>
          <button type="button" className="load-more-btn" onClick={() => loadMoreProductsRef.current()}>
            Load Now
          </button>
        </div>
      )}

      {!loading && filteredFamilies.length === 0 && (
        <div className="no-products">
          <p>No products matched your filters.</p>
          <button
            type="button"
            className="reset-filters-btn"
            onClick={() => {
              setSelectedCategory('all');
              commitSearchQuery('');
              setSortBy(DEFAULT_SORT_BY);
              setGroupBy(GROUP_BY_OPTIONS.category);
              setInStockOnly(false);
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {filteredFamilies.length > 0 ? renderSmartSections() : null}

      {isMobile && (
        <MobileBottomSheet
          open={showMobileFilters}
          onClose={() => setShowMobileFilters(false)}
          title="Filter Products"
          className="products-filter-sheet"
        >
          <div className="filter-row">
            <div className="filter-header">
              <Filter size={18} />
              <span>{groupBy === GROUP_BY_OPTIONS.brand ? 'Brand' : 'Category'}</span>
            </div>
            <div className="category-buttons">
              <button
                type="button"
                className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                {renderCategoryChipLabel(
                  { name: 'All', icon: '🛒', image: '' },
                  groupBy === GROUP_BY_OPTIONS.brand ? 'brand' : 'category'
                )}
              </button>
              {activeFilterOptions.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${normalizeText(selectedCategory) === normalizeText(category.name) ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category.name)}
                  aria-label={category.name}
                >
                  {renderCategoryChipLabel(category, groupBy === GROUP_BY_OPTIONS.brand ? 'brand' : 'category')}
                </button>
              ))}
            </div>
          </div>

          <div className="sort-row">
            <div className="sort-group">
              <Filter size={16} />
              <select
                id="products-group-by-mobile"
                name="group_by"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value)}
                aria-label="Group products"
              >
                <option value={GROUP_BY_OPTIONS.category}>Group: Category {'->'} Sub-category</option>
                <option value={GROUP_BY_OPTIONS.brand}>Group: Brand {'->'} Sub-brand</option>
              </select>
            </div>
          </div>

          <div className="sort-row">
            <div className="sort-group">
              <SlidersHorizontal size={16} />
              <select
                id="products-sort-by-mobile"
                name="sort_by"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                aria-label="Sort products"
              >
                <option value="popular">Popular for you</option>
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="stock-desc">Stock: High to Low</option>
              </select>
            </div>
          </div>
        </MobileBottomSheet>
      )}

      {isMobile && activeMobileFamily && (
        <MobileBottomSheet
          open={!!activeMobileFamily}
          onClose={() => setActiveMobileFamilyId(null)}
          title={activeMobileFamily.name}
          className="products-detail-sheet"
        >
          <ProductDetailView
            family={activeMobileFamily}
            selectedVariationId={getSelectedVariation(activeMobileFamily)?.id}
            onSelectVariation={handleSelectVariation}
            onIncreaseQty={addToCart}
            onDecreaseQty={decreaseFromCart}
            cartQtyById={cartQtyById}
            buttonStatus={buttonStatus}
            showImage
          />
        </MobileBottomSheet>
      )}
    </div>
  );
}

export default Products;
