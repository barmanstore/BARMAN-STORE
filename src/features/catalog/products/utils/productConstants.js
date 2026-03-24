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
const PRODUCTS_AUTOLOAD_ROOT_MARGIN = '720px 0px';
const ABOVE_FOLD_EAGER_IMAGE_COUNT = {
  mobile: 4,
  desktop: 8
};
const DEFAULT_SORT_BY = 'popular';
const SORT_OPTIONS = ['popular', 'relevance', 'newest', 'price-asc', 'price-desc', 'discount-desc', 'stock-desc'];
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
const PRODUCTS_LIST_CACHE_PREFIX = 'barman_products_page_cache_v2';
const PRODUCTS_LIST_CACHE_TTL_MS = 15 * 1000;
const PRODUCTS_CATEGORIES_CACHE_KEY = 'barman_products_categories_cache_v1';
const PRODUCTS_CATEGORIES_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_SUGGESTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_SUGGESTIONS_MAX_ITEMS = 8;
const SEARCH_SUGGESTIONS_MIN_CHARS = 2;
const RESOLVED_MEDIA_CACHE_MAX_ITEMS = 600;

export {
  getProductPageSize,
  LOW_STOCK_THRESHOLD,
  RESTOCK_ALERT_THRESHOLD,
  CRITICAL_RESTOCK_THRESHOLD,
  USAGE_HISTORY_KEY,
  RECENTLY_BOUGHT_LIMIT,
  VIRTUALIZE_GROUP_THRESHOLD,
  GROUP_BY_OPTIONS,
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
};
