import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import Fuse from 'fuse.js';
import { resolveMediaSourceForDisplay } from '../../../services/api';
import { productService } from '../../../services/productService';
import { categoryService } from '../../../services/categoryService';
import { getProductImageSrc, getProductFallbackImage } from '../../../utils/productImage';
import { formatCurrency } from '../../../utils/formatters';
import useIsMobile from '../../../hooks/useIsMobile';
import * as info from '../../../shared/info.js';
import ProductsDesktopView from './components/ProductsDesktopView';
import ProductsMobileView from './components/ProductsMobileView';
import useProductsRenderers from './hooks/useProductsRenderers.jsx';
import useProductSearchSuggestions from './hooks/useProductSearchSuggestions';
import useProductsTelemetry from './hooks/useProductsTelemetry';
import useProductsSearchHandlers from './hooks/useProductsSearchHandlers';
import {
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
  getCachedResolvedMediaSource,
  cacheResolvedMediaSource,
  getSuggestionImageSrc,
  buildResponsiveImageSources,
  splitHierarchyValue,
  composeHierarchyLabel,
  getProductHierarchy,
  getFamilyKey,
  safeReadJson,
  getInitials,
  readLocalUser,
  safeWriteJson,
  safeReadSessionJson,
  safeWriteSessionJson,
  hasActiveUserSession,
  buildProductsListSessionCacheKey,
  getUsageWindowDays,
  normalizePathTokens,
  normalizePathValue,
  BRAND_LOGO_DOMAIN_HINTS,
  resolveBrandLogoUrl,
  familyHasImage,
  getFamilyPreviewVariation,
  getFirstAvailableVariation,
  getFamilyCardState
} from './utils/productHelpers.jsx';
import './Products.css';

function Products({
  setCartCount,
  notifications = [],
  unreadNotificationCount = 0,
  onResolveNotificationHref = () => '/profile',
  onMarkNotificationRead = () => {},
}) {
  const isMobile = useIsMobile();
  const productsPageRef = useRef(null);
  const mobileHeaderRef = useRef(null);
  const controlsRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initialSearchQuery = String(searchParams.get('q') || '');
  const initialGroupBy = searchParams.get('group') === GROUP_BY_OPTIONS.brand
    ? GROUP_BY_OPTIONS.brand
    : GROUP_BY_OPTIONS.category;
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recentlyBought, setRecentlyBought] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [searchInputValue, setSearchInputValue] = useState(initialSearchQuery);
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(initialSearchQuery);
  const deferredAppliedSearchQuery = useDeferredValue(appliedSearchQuery);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchSuggestionsEnabled, setSearchSuggestionsEnabled] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [localUser, setLocalUser] = useState(() => readLocalUser());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState('');
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
  const [activeMobileTab, setActiveMobileTab] = useState(MOBILE_TAB_OPTIONS[0].key);
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
  const logoImage = getPublicFileUrl(info.LOGO_URL || 'logo.png');
  const storeTitle = String(info.TITLE || 'Store').trim() || 'Store';
  const productPageSize = getProductPageSize(isMobile);
  const serverCategoryFilter = groupBy === GROUP_BY_OPTIONS.category ? selectedCategory : 'all';
  const suggestionFuse = useMemo(() => {
    if (!products.length) return null;
    return new Fuse(products, {
      keys: ['name', 'brand', 'category', 'subcategory', 'content', 'uom'],
      threshold: 0.3,
      includeScore: false,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [products]);

  const getLocalSuggestions = useCallback((query) => {
    const trimmedQuery = String(query || '').trim();
    if (!suggestionFuse || trimmedQuery.length < SEARCH_SUGGESTIONS_MIN_CHARS) return [];
    const results = suggestionFuse.search(trimmedQuery, {
      limit: SEARCH_SUGGESTIONS_MAX_ITEMS * 2,
    });
    const items = [];
    const seen = new Set();
    results.forEach((result) => {
      if (!result?.item || items.length >= SEARCH_SUGGESTIONS_MAX_ITEMS) return;
      const item = result.item;
      const id = Number(item.id || 0);
      const name = String(item.name || '').trim();
      const brand = String(item.brand || '').trim();
      const key = id ? `id:${id}` : `${normalizeText(name)}|${normalizeText(brand)}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id,
        name: name || 'Product',
        brand,
        size: String(item.content || item.uom || '').trim(),
        price: Number(item.price || 0),
        mrp: Number(item.mrp || 0),
        image: String(item.image || '').trim(),
        category: String(item.category || '').trim(),
        stock: Number(item.stock || 0),
      });
    });
    return items;
  }, [suggestionFuse]);

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
    if (!isMobile || typeof window === 'undefined') return undefined;
    const pageNode = productsPageRef.current;
    const headerNode = mobileHeaderRef.current;
    if (!pageNode || !headerNode) return undefined;

    const updateHeaderHeight = () => {
      const nextHeight = Math.ceil(headerNode.getBoundingClientRect().height || 0);
      pageNode.style.setProperty('--mobile-shop-header-height', `${Math.max(0, nextHeight)}px`);
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    let resizeObserver;
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(() => updateHeaderHeight());
      resizeObserver.observe(headerNode);
    }

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      if (resizeObserver) resizeObserver.disconnect();
      pageNode.style.removeProperty('--mobile-shop-header-height');
    };
  }, [isMobile]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (isMobile) {
      document.body.classList.add('mobile-shop-active');
    } else {
      document.body.classList.remove('mobile-shop-active');
    }
    return () => {
      document.body.classList.remove('mobile-shop-active');
    };
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncUser = () => setLocalUser(readLocalUser());
    window.addEventListener('storage', syncUser);
    window.addEventListener('user-updated', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('user-updated', syncUser);
    };
  }, []);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [localUser?.profile_image]);

  useEffect(() => {
    let cancelled = false;
    let revokeUrl = null;
    const run = async () => {
      if (avatarLoadFailed || !localUser?.profile_image) {
        setAvatarSrc('');
        return;
      }
      const resolved = await resolveMediaSourceForDisplay(localUser.profile_image);
      if (cancelled) {
        if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
        return;
      }
      setAvatarSrc(resolved.src || '');
      revokeUrl = resolved.revoke ? resolved.src : null;
    };
    run();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [localUser?.profile_image, avatarLoadFailed]);

  useEffect(() => {
    setSelectedSubcategory('all');
  }, [selectedCategory]);

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

  useProductSearchSuggestions({
    searchInputValue,
    searchSuggestionsEnabled,
    getLocalSuggestions,
    normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_CACHE_TTL_MS,
    SEARCH_SUGGESTIONS_MAX_ITEMS,
    searchSuggestionsCacheRef,
    searchSuggestionsRequestRef,
    searchSuggestionsAbortRef,
    setSearchSuggestions,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
    setIsLoadingSuggestions,
    showSearchSuggestions,
    activeSuggestionIndex,
    searchSuggestionsLength: searchSuggestions.length,
  });

  const trackProductsEvent = useProductsTelemetry({
    productsTelemetryRef,
    groupBy,
    sortBy,
    inStockOnly,
    isMobile,
    searchParams,
  });

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

      const data = await productService.list(params, { signal: controller.signal });
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
      const data = await categoryService.list();
      const items = Array.isArray(data) ? data : [];
      setCategories(items);
      safeWriteSessionJson(PRODUCTS_CATEGORIES_CACHE_KEY, { items, at: Date.now() });
    } catch (fetchError) {
      console.error('Error fetching categories:', fetchError);
    }
  };

  const fetchRecentlyBought = async () => {
    try {
      const data = await productService.recentlyBought({ limit: RECENTLY_BOUGHT_LIMIT });
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

  const mobileRootCategories = useMemo(() => {
    if (effectiveCategories.length === 0) return [];
    const roots = effectiveCategories.filter((category) => (
      category.parent_id === null || category.parent_id === undefined || category.parent_id === '' || category.parent_id === 0
    ));
    const base = roots.length > 0 ? roots : effectiveCategories;
    return [...base].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [effectiveCategories]);

  const mobileSubcategories = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (!selected || selected === 'all') return [];
    const selectedNode = effectiveCategories.find((category) => (
      normalizeText(category.name) === selected
    ));
    let subcategories = [];

    if (selectedNode) {
      subcategories = effectiveCategories.filter((category) => (
        String(category.parent_id) === String(selectedNode.id)
      ));
    }

    if (subcategories.length === 0) {
      const fallbackSet = new Set();
      productFamilies.forEach((family) => {
        const parsed = splitHierarchyValue(family.categoryPath || family.category);
        const parent = normalizeText(parsed.parent || family.category);
        if (parent !== selected) return;
        const child = String(parsed.child || family.subcategory || '').trim();
        if (child) fallbackSet.add(child);
      });
      subcategories = Array.from(fallbackSet).map((name) => ({
        id: name,
        name,
        parent_id: selectedNode?.id ?? null,
        icon: '',
        image: '',
        image_width: null,
        image_height: null
      }));
    }

    return subcategories
      .filter((entry) => entry?.name)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [selectedCategory, effectiveCategories, productFamilies]);

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

  const mobileFilteredFamilies = useMemo(() => {
    if (!isMobile) return filteredFamilies;
    const selected = normalizeText(selectedSubcategory);
    if (!selected || selected === 'all') return filteredFamilies;
    return filteredFamilies.filter((family) => {
      const parsed = splitHierarchyValue(family.categoryPath || family.category);
      const child = normalizeText(parsed.child || family.subcategory);
      return child === selected;
    });
  }, [filteredFamilies, selectedSubcategory, isMobile]);

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

  const popularFamilies = useMemo(() => {
    if (!mobileFilteredFamilies.length) return [];
    const now = Date.now();
    const scored = mobileFilteredFamilies.map((family, index) => {
      const history = usageHistory[family.id] || {};
      const addCount = Number(history.addCount || 0);
      const lastAddedAt = Date.parse(history.lastAddedAt || '');
      const recencyScore = Number.isFinite(lastAddedAt)
        ? Math.max(0, 22 - ((now - lastAddedAt) / 86400000))
        : 0;
      const stockBoost = Number(family.totalStock || 0) > 0 ? 6 : 0;
      const score = (addCount * 12) + recencyScore + stockBoost - (index * 0.02);
      return { family, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.family);
  }, [mobileFilteredFamilies, usageHistory]);

  const bestPriceFamilies = useMemo(() => {
    if (!mobileFilteredFamilies.length) return [];
    return [...mobileFilteredFamilies]
      .sort((a, b) => Number(a.minPrice || 0) - Number(b.minPrice || 0))
      .slice(0, 8);
  }, [mobileFilteredFamilies]);

  const trendingFamilies = useMemo(() => {
    if (quickAddFamilies.length >= 6) return quickAddFamilies.slice(0, 8);
    if (!mobileFilteredFamilies.length) return [];
    const scored = mobileFilteredFamilies.map((family, index) => {
      const history = usageHistory[family.id] || {};
      const addCount = Number(history.addCount || 0);
      const score = (addCount * 9) + (Number(family.totalStock || 0) > 0 ? 5 : 0) - (index * 0.02);
      return { family, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.family);
  }, [quickAddFamilies, mobileFilteredFamilies, usageHistory]);

  const mobileTabFamilies = useMemo(() => ({
    'order-again': repeatOrderFamilies,
    'best-prices': bestPriceFamilies,
    trending: trendingFamilies
  }), [repeatOrderFamilies, bestPriceFamilies, trendingFamilies]);

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

  const mobileOffers = useMemo(() => {
    const cards = [
      {
        id: 'fresh-picks',
        title: 'Fresh Picks Today',
        subtitle: 'Daily essentials delivered fast',
        action: 'Shop now',
        tone: 'fresh'
      },
      {
        id: 'value-deals',
        title: 'Value Deals',
        subtitle: 'Save more on kitchen staples',
        action: 'Browse deals',
        tone: 'value'
      },
      {
        id: 'snack-time',
        title: 'Snack Time',
        subtitle: 'Bites, biscuits, and tea-time picks',
        action: 'Add to basket',
        tone: 'snack'
      }
    ];

    if (comboSuggestions.length > 0) {
      const combo = comboSuggestions[0];
      cards.unshift({
        id: `combo-${combo.id}`,
        title: combo.title,
        subtitle: combo.subtitle,
        action: 'Add combo',
        tone: 'combo',
        combo
      });
    }

    return cards;
  }, [comboSuggestions]);

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
  const {
    renderFamilyCard,
    renderQuickAddTile,
    renderMobileProductCard,
    renderCategoryChipLabel,
  } = useProductsRenderers({
    isMobile,
    activeDesktopFamilyId,
    visibleFamilyIndexById,
    eagerImageBudget,
    getSelectedVariation,
    getFamilyCardState,
    cartQtyById,
    openFamilyDetails,
    addToCart,
    decreaseFromCart,
    handleSelectVariation,
    buttonStatus,
    swipeAddedFamilyId,
    quickTileDidSwipeRef,
    handleQuickTileTouchStart,
    handleQuickTileTouchEnd,
    formatCurrency,
    LOW_STOCK_THRESHOLD,
  });

  const handleMobileCategorySelect = useCallback((categoryName) => {
    const next = String(categoryName || '').trim() || 'all';
    setSelectedCategory(next);
    setSelectedSubcategory('all');
    if (groupBy !== GROUP_BY_OPTIONS.category) {
      setGroupBy(GROUP_BY_OPTIONS.category);
    }
  }, [groupBy]);

  const handleMobileSubcategorySelect = useCallback((subcategoryName) => {
    const next = String(subcategoryName || '').trim() || 'all';
    setSelectedSubcategory(next);
  }, []);

  const {
    commitSearchQuery,
    selectSearchSuggestion,
    clearSearchQuery,
    handleMobileSearchChange,
    handleMobileSearchFocus,
    handleMobileSearchKeyDown,
    handleDesktopSearchChange,
    handleDesktopSearchFocus,
    handleDesktopSearchKeyDown,
  } = useProductsSearchHandlers({
    searchInputValue,
    setSearchInputValue,
    setSearchSuggestionsEnabled,
    setSearchSuggestions,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
    setAppliedSearchQuery,
    showSearchSuggestions,
    searchSuggestions,
    activeSuggestionIndex,
    SEARCH_SUGGESTIONS_MIN_CHARS,
    trackProductsEvent,
  });

  const handleMobileOfferAction = useCallback((offer) => {
    if (!offer) return;
    if (offer.combo) {
      handleAddCombo(offer.combo);
      return;
    }
    if (offer.category) {
      handleMobileCategorySelect(offer.category);
      return;
    }
    if (typeof document !== 'undefined') {
      const target = document.getElementById('mobile-popular-section');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [handleMobileCategorySelect, handleAddCombo]);

  const handleMobileScrollTo = useCallback((targetId) => {
    if (typeof document === 'undefined') return;
    const node = document.getElementById(targetId);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    if (location.hash === '#top-picks') {
      handleMobileScrollTo('mobile-popular-section');
    }
  }, [isMobile, location.hash, handleMobileScrollTo]);

  const smartSectionsProps = {
    repeatOrderFamilies,
    recentlyBoughtFamilies,
    handleRepeatOrder,
    getSelectedVariation,
    getFamilyPreviewVariation,
    smartRestockItems,
    handleRestockAll,
    addToCart,
    quickAddFamilies,
    renderQuickAddTile,
    comboSuggestions,
    handleAddCombo,
  };

  const activeTabFamilies = mobileTabFamilies[activeMobileTab] || [];
  const isLoggedIn = Boolean(
    localUser?.id
    || String(localUser?.token || '').trim()
    || String(localUser?.supabase_session?.access_token || '').trim()
    || String(localUser?.email || '').trim()
    || String(localUser?.phone || '').trim()
  );
  const profileHref = isLoggedIn ? '/profile' : '/login';
  const profileImageSrc = !avatarLoadFailed ? avatarSrc : '';
  const profileName = String(localUser?.name || '').trim();
  const profileInitials = profileName ? getInitials(profileName) : '';
  const isAdminUser = normalizeText(localUser?.role) === 'admin';
  const disableMobileLogoLink = !isAdminUser;

  if (!isMobile && loading && products.length === 0) {
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

  if (isMobile) {
    return (
      <ProductsMobileView
        productsPageRef={productsPageRef}
        mobileHeaderRef={mobileHeaderRef}
        logoImage={logoImage}
        storeTitle={storeTitle}
        disableMobileLogoLink={disableMobileLogoLink}
        profileHref={profileHref}
        profileImageSrc={profileImageSrc}
        profileName={profileName}
        profileInitials={profileInitials}
        onAvatarError={() => setAvatarLoadFailed(true)}
        searchInputValue={searchInputValue}
        handleMobileSearchChange={handleMobileSearchChange}
        handleMobileSearchFocus={handleMobileSearchFocus}
        handleMobileSearchKeyDown={handleMobileSearchKeyDown}
        showSearchSuggestions={showSearchSuggestions}
        searchSuggestions={searchSuggestions}
        searchSuggestionsListId={searchSuggestionsListId}
        activeSuggestionIndex={activeSuggestionIndex}
        setActiveSuggestionIndex={setActiveSuggestionIndex}
        selectSearchSuggestion={selectSearchSuggestion}
        clearSearchQuery={clearSearchQuery}
        isLoadingSuggestions={isLoadingSuggestions}
        SEARCH_SUGGESTIONS_MAX_ITEMS={SEARCH_SUGGESTIONS_MAX_ITEMS}
        getSuggestionImageSrc={getSuggestionImageSrc}
        getProductFallbackImage={getProductFallbackImage}
        formatCurrency={formatCurrency}
        selectedCategory={selectedCategory}
        handleMobileCategorySelect={handleMobileCategorySelect}
        mobileRootCategories={mobileRootCategories}
        normalizeText={normalizeText}
        renderCategoryChipLabel={renderCategoryChipLabel}
        loading={loading}
        productsLength={products.length}
        notice={notice}
        error={error}
        mobileSubcategories={mobileSubcategories}
        selectedSubcategory={selectedSubcategory}
        handleMobileSubcategorySelect={handleMobileSubcategorySelect}
        mobileOffers={mobileOffers}
        handleMobileOfferAction={handleMobileOfferAction}
        repeatOrderFamilies={repeatOrderFamilies}
        recentlyBoughtFamilies={recentlyBoughtFamilies}
        handleRepeatOrder={handleRepeatOrder}
        openFamilyDetails={openFamilyDetails}
        getSelectedVariation={getSelectedVariation}
        getFamilyPreviewVariation={getFamilyPreviewVariation}
        popularFamilies={popularFamilies}
        renderMobileProductCard={renderMobileProductCard}
        smartRestockItems={smartRestockItems}
        handleRestockAll={handleRestockAll}
        addToCart={addToCart}
        quickAddFamilies={quickAddFamilies}
        MOBILE_TAB_OPTIONS={MOBILE_TAB_OPTIONS}
        activeMobileTab={activeMobileTab}
        setActiveMobileTab={setActiveMobileTab}
        activeTabFamilies={activeTabFamilies}
        productsHasMore={productsHasMore}
        productsLoadTriggerRef={productsLoadTriggerRef}
        isLoadingMore={isLoadingMore}
        loadMoreProductsRef={loadMoreProductsRef}
        cartItemCount={cartItemCount}
        handleMobileScrollTo={handleMobileScrollTo}
        activeMobileFamily={activeMobileFamily}
        setActiveMobileFamilyId={setActiveMobileFamilyId}
        handleSelectVariation={handleSelectVariation}
        decreaseFromCart={decreaseFromCart}
        cartQtyById={cartQtyById}
        buttonStatus={buttonStatus}
      />
    );
  }

  return (
    <ProductsDesktopView
      productsPageRef={productsPageRef}
      loading={loading}
      productsLength={products.length}
      notice={notice}
      error={error}
      cartItemCount={cartItemCount}
      controlsRef={controlsRef}
      searchInputRef={searchInputRef}
      searchInputValue={searchInputValue}
      onSearchInputChange={handleDesktopSearchChange}
      onSearchFocus={handleDesktopSearchFocus}
      onSearchKeyDown={handleDesktopSearchKeyDown}
      clearSearchQuery={clearSearchQuery}
      showSearchSuggestions={showSearchSuggestions}
      searchSuggestions={searchSuggestions}
      searchSuggestionsListId={searchSuggestionsListId}
      activeSuggestionIndex={activeSuggestionIndex}
      onHoverSuggestion={setActiveSuggestionIndex}
      onSelectSuggestion={selectSearchSuggestion}
      getSuggestionImageSrc={getSuggestionImageSrc}
      getProductFallbackImage={getProductFallbackImage}
      formatCurrency={formatCurrency}
      maxSuggestionItems={SEARCH_SUGGESTIONS_MAX_ITEMS}
      isLoadingSuggestions={isLoadingSuggestions}
      cartPreviewTotal={cartPreviewTotal}
      isMobile={isMobile}
      setShowMobileFilters={setShowMobileFilters}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      sortBy={sortBy}
      setSortBy={setSortBy}
      inStockOnly={inStockOnly}
      setInStockOnly={setInStockOnly}
      GROUP_BY_OPTIONS={GROUP_BY_OPTIONS}
      activeFilterOptions={activeFilterOptions}
      selectedCategory={selectedCategory}
      setSelectedCategory={setSelectedCategory}
      renderCategoryChipLabel={renderCategoryChipLabel}
      normalizeText={normalizeText}
      visibleFamilies={visibleFamilies}
      groupedVisibleFamilies={groupedVisibleFamilies}
      renderFamilyCard={renderFamilyCard}
      estimatedGridColumns={estimatedGridColumns}
      VIRTUALIZE_GROUP_THRESHOLD={VIRTUALIZE_GROUP_THRESHOLD}
      hasMoreProducts={hasMoreProducts}
      isLoadingMore={isLoadingMore}
      productsLoadTriggerRef={productsLoadTriggerRef}
      loadMoreProductsRef={loadMoreProductsRef}
      filteredFamilies={filteredFamilies}
      commitSearchQuery={commitSearchQuery}
      DEFAULT_SORT_BY={DEFAULT_SORT_BY}
      showMobileFilters={showMobileFilters}
      smartSectionsProps={smartSectionsProps}
    />
  );
}

export default Products;

