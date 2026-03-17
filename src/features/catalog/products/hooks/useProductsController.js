import { useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { getProductFallbackImage } from '../../../../utils/productImage';
import { formatCurrency } from '../../../../utils/formatters';
import useIsMobile from '../../../../hooks/useIsMobile';
import * as info from '../../../../shared/info.js';
import useProductsRenderers from './useProductsRenderers.jsx';
import useProductSearchSuggestions from './useProductSearchSuggestions';
import useProductsTelemetry from './useProductsTelemetry';
import useProductsSearchHandlers from './useProductsSearchHandlers';
import useProductsLocalSuggestions from './useProductsLocalSuggestions';
import useProductsLayoutEffects from './useProductsLayoutEffects';
import useProductsDataFetch from './useProductsDataFetch';
import useProductsUserProfile from './useProductsUserProfile';
import useProductsBootstrap from './useProductsBootstrap';
import useProductsSearchParamsSync from './useProductsSearchParamsSync';
import useProductsUiEffects from './useProductsUiEffects';
import useProductsVitals from './useProductsVitals';
import useProductsCatalogFilters from './useProductsCatalogFilters';
import useProductsState from './useProductsState';
import useProductsFamilyGroups from './useProductsFamilyGroups';
import useProductsFilterScopes from './useProductsFilterScopes';
import useProductsRecommendations from './useProductsRecommendations';
import buildProductFamilies from '../utils/productFamilies';
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
  safeReadJson,
  getInitials,
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
} from '../utils/productHelpers.jsx';

export default function useProductsController({
  setCartCount,
  notifications = [],
  unreadNotificationCount = 0,
  onResolveNotificationHref = () => '/profile',
  onMarkNotificationRead = () => {},
}) {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initialSearchQuery = String(searchParams.get('q') || '');
  const initialGroupBy = searchParams.get('group') === GROUP_BY_OPTIONS.brand
    ? GROUP_BY_OPTIONS.brand
    : GROUP_BY_OPTIONS.category;
  const {
    productsPageRef,
    mobileHeaderRef,
    controlsRef,
    quickTileTouchStartRef,
    quickTileDidSwipeRef,
    loadMoreProductsRef,
    productsLoadTriggerRef,
    latestProductsRequestRef,
    productsLoadingMoreRef,
    productsAbortControllerRef,
    productsTelemetryRef,
    searchSuggestionsCacheRef,
    searchSuggestionsRequestRef,
    searchSuggestionsAbortRef,
    searchInputRef,
    searchSuggestionsListId,
    products,
    setProducts,
    categories,
    setCategories,
    recentlyBought,
    setRecentlyBought,
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    searchInputValue,
    setSearchInputValue,
    appliedSearchQuery,
    setAppliedSearchQuery,
    deferredAppliedSearchQuery,
    searchSuggestions,
    setSearchSuggestions,
    showSearchSuggestions,
    setShowSearchSuggestions,
    searchSuggestionsEnabled,
    setSearchSuggestionsEnabled,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    isLoadingSuggestions,
    setIsLoadingSuggestions,
    sortBy,
    setSortBy,
    groupBy,
    setGroupBy,
    inStockOnly,
    setInStockOnly,
    loading,
    setLoading,
    isLoadingMore,
    setIsLoadingMore,
    error,
    setError,
    cart,
    setCart,
    productsPage,
    setProductsPage,
    productsHasMore,
    setProductsHasMore,
    buttonStatus,
    setButtonStatus,
    notice,
    setNotice,
    showMobileFilters,
    setShowMobileFilters,
    activeDesktopFamilyId,
    setActiveDesktopFamilyId,
    activeMobileFamilyId,
    setActiveMobileFamilyId,
    activeMobileTab,
    setActiveMobileTab,
    selectedVariationByFamily,
    setSelectedVariationByFamily,
    usageHistory,
    setUsageHistory,
    swipeAddedFamilyId,
    setSwipeAddedFamilyId,
  } = useProductsState({
    initialSearchQuery,
    initialGroupBy,
    initialCategory: searchParams.get('category') || 'all',
    searchParams,
    MOBILE_TAB_OPTIONS,
    normalizeSortBy,
  });
  const {
    localUser,
    avatarLoadFailed,
    avatarSrc,
    setAvatarLoadFailed,
  } = useProductsUserProfile();
  const logoImage = getPublicFileUrl(info.LOGO_URL || 'logo.png');
  const storeTitle = String(info.TITLE || 'Store').trim() || 'Store';
  const productPageSize = getProductPageSize(isMobile);
  const serverCategoryFilter = groupBy === GROUP_BY_OPTIONS.category ? selectedCategory : 'all';
  const { getLocalSuggestions } = useProductsLocalSuggestions({
    products,
    normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_MAX_ITEMS,
  });

  useProductsLayoutEffects({
    productsPageRef,
    controlsRef,
    mobileHeaderRef,
    isMobile,
  });
  const { fetchProductsPage } = useProductsDataFetch({
    serverCategoryFilter,
    appliedSearchQuery,
    sortBy,
    inStockOnly,
    productPageSize,
    SORT_API_FALLBACK,
    buildProductsListSessionCacheKey,
    PRODUCTS_LIST_CACHE_TTL_MS,
    safeReadSessionJson,
    safeWriteSessionJson,
    latestProductsRequestRef,
    productsLoadingMoreRef,
    productsAbortControllerRef,
    setProducts,
    setProductsPage,
    setProductsHasMore,
    setError,
    setLoading,
    setIsLoadingMore,
  });
  useProductsBootstrap({
    setCategories,
    setRecentlyBought,
    setCart,
    setCartCount,
    setUsageHistory,
    safeReadJson,
    safeReadSessionJson,
    safeWriteSessionJson,
    PRODUCTS_CATEGORIES_CACHE_KEY,
    PRODUCTS_CATEGORIES_CACHE_TTL_MS,
    USAGE_HISTORY_KEY,
    RECENTLY_BOUGHT_LIMIT,
    hasActiveUserSession,
  });
  useProductsSearchParamsSync({
    searchParams,
    setSearchParams,
    selectedCategory,
    appliedSearchQuery,
    sortBy,
    groupBy,
    inStockOnly,
    setSelectedCategory,
    setSearchInputValue,
    setAppliedSearchQuery,
    setSortBy,
    setGroupBy,
    setInStockOnly,
    setSearchSuggestionsEnabled,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
    normalizeSortBy,
    GROUP_BY_OPTIONS,
    DEFAULT_SORT_BY,
  });
  useProductsUiEffects({
    isMobile,
    notice,
    setNotice,
    showSearchSuggestions,
    searchInputRef,
    setSearchSuggestionsEnabled,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
    swipeAddedFamilyId,
    setSwipeAddedFamilyId,
  });
  useProductsVitals({ productsTelemetryRef });

  useEffect(() => {
    setSelectedSubcategory('all');
  }, [selectedCategory]);

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


  const cartQtyById = useMemo(() => {
    return cart.reduce((acc, item) => {
      acc[item.id] = Number(item.quantity || 0);
      return acc;
    }, {});
  }, [cart]);

  const productFamilies = useMemo(() => buildProductFamilies(products), [products]);

  const {
    effectiveCategories,
    effectiveBrands,
    activeFilterOptions,
    mobileRootCategories,
    mobileSubcategories,
  } = useProductsCatalogFilters({
    categories,
    productFamilies,
    groupBy,
    selectedCategory,
    normalizeText,
    splitHierarchyValue,
    resolveBrandLogoUrl,
    GROUP_BY_OPTIONS,
  });

  const {
    categoryPathScopeSet,
    categoryNameScopeSet,
    categoryIdScopeSet,
    brandPathScopeSet,
  } = useProductsFilterScopes({
    selectedCategory,
    groupBy,
    effectiveCategories,
    activeFilterOptions,
    normalizeText,
    normalizePathValue,
    GROUP_BY_OPTIONS,
  });

  const {
    filteredFamilies,
    mobileFilteredFamilies,
    visibleFamilies,
    hasMoreProducts,
    visibleFamilyIndexById,
    groupedVisibleFamilies,
  } = useProductsFamilyGroups({
    productFamilies,
    deferredAppliedSearchQuery,
    selectedCategory,
    sortBy,
    inStockOnly,
    groupBy,
    categoryPathScopeSet,
    categoryIdScopeSet,
    categoryNameScopeSet,
    brandPathScopeSet,
    usageHistory,
    normalizeText,
    tokenizeSearchText,
    PRODUCTS_SYNONYMS,
    PRODUCTS_SYNONYM_REVERSE,
    tokenFuzzyMatch,
    splitHierarchyValue,
    composeHierarchyLabel,
    normalizePathValue,
    normalizePathTokens,
    familyHasImage,
    getFirstAvailableVariation,
    activeFilterOptions,
    selectedSubcategory,
    isMobile,
    setSelectedCategory,
    setSelectedVariationByFamily,
    GROUP_BY_OPTIONS,
    productsHasMore,
  });

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

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cart]
  );

  const cartPreviewTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0),
    [cart]
  );
  const {
    recentlyBoughtFamilies,
    quickAddFamilies,
    repeatOrderFamilies,
    smartRestockItems,
    popularFamilies,
    bestPriceFamilies,
    trendingFamilies,
    mobileTabFamilies,
    comboSuggestions,
    mobileOffers,
  } = useProductsRecommendations({
    selectedCategory,
    filteredFamilies,
    mobileFilteredFamilies,
    productFamilies,
    usageHistory,
    recentlyBought,
    isMobile,
    selectedVariationByFamily,
    getSelectedVariation,
    getUsageWindowDays,
    RESTOCK_ALERT_THRESHOLD,
    CRITICAL_RESTOCK_THRESHOLD,
    normalizeText,
  });

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

    return {
    isMobile: isMobile,
    loading: loading,
    productsLength: products.length,
    productsPageRef: productsPageRef,
    mobileHeaderRef: mobileHeaderRef,
    logoImage: logoImage,
    storeTitle: storeTitle,
    localUser: localUser,
    avatarLoadFailed: avatarLoadFailed,
    avatarSrc: avatarSrc,
    setAvatarLoadFailed: setAvatarLoadFailed,
    normalizeText: normalizeText,
    getInitials: getInitials,
    searchInputValue: searchInputValue,
    handleMobileSearchChange: handleMobileSearchChange,
    handleMobileSearchFocus: handleMobileSearchFocus,
    handleMobileSearchKeyDown: handleMobileSearchKeyDown,
    showSearchSuggestions: showSearchSuggestions,
    searchSuggestions: searchSuggestions,
    searchSuggestionsListId: searchSuggestionsListId,
    activeSuggestionIndex: activeSuggestionIndex,
    setActiveSuggestionIndex: setActiveSuggestionIndex,
    selectSearchSuggestion: selectSearchSuggestion,
    clearSearchQuery: clearSearchQuery,
    isLoadingSuggestions: isLoadingSuggestions,
    SEARCH_SUGGESTIONS_MAX_ITEMS: SEARCH_SUGGESTIONS_MAX_ITEMS,
    getSuggestionImageSrc: getSuggestionImageSrc,
    getProductFallbackImage: getProductFallbackImage,
    formatCurrency: formatCurrency,
    selectedCategory: selectedCategory,
    handleMobileCategorySelect: handleMobileCategorySelect,
    mobileRootCategories: mobileRootCategories,
    renderCategoryChipLabel: renderCategoryChipLabel,
    notice: notice,
    error: error,
    mobileSubcategories: mobileSubcategories,
    selectedSubcategory: selectedSubcategory,
    handleMobileSubcategorySelect: handleMobileSubcategorySelect,
    mobileOffers: mobileOffers,
    handleMobileOfferAction: handleMobileOfferAction,
    repeatOrderFamilies: repeatOrderFamilies,
    recentlyBoughtFamilies: recentlyBoughtFamilies,
    handleRepeatOrder: handleRepeatOrder,
    openFamilyDetails: openFamilyDetails,
    getSelectedVariation: getSelectedVariation,
    getFamilyPreviewVariation: getFamilyPreviewVariation,
    popularFamilies: popularFamilies,
    renderMobileProductCard: renderMobileProductCard,
    smartRestockItems: smartRestockItems,
    handleRestockAll: handleRestockAll,
    addToCart: addToCart,
    quickAddFamilies: quickAddFamilies,
    MOBILE_TAB_OPTIONS: MOBILE_TAB_OPTIONS,
    activeMobileTab: activeMobileTab,
    setActiveMobileTab: setActiveMobileTab,
    mobileTabFamilies: mobileTabFamilies,
    productsHasMore: productsHasMore,
    productsLoadTriggerRef: productsLoadTriggerRef,
    isLoadingMore: isLoadingMore,
    loadMoreProductsRef: loadMoreProductsRef,
    cartItemCount: cartItemCount,
    handleMobileScrollTo: handleMobileScrollTo,
    activeMobileFamily: activeMobileFamily,
    setActiveMobileFamilyId: setActiveMobileFamilyId,
    handleSelectVariation: handleSelectVariation,
    decreaseFromCart: decreaseFromCart,
    cartQtyById: cartQtyById,
    buttonStatus: buttonStatus,
    controlsRef: controlsRef,
    searchInputRef: searchInputRef,
    handleDesktopSearchChange: handleDesktopSearchChange,
    handleDesktopSearchFocus: handleDesktopSearchFocus,
    handleDesktopSearchKeyDown: handleDesktopSearchKeyDown,
    cartPreviewTotal: cartPreviewTotal,
    setShowMobileFilters: setShowMobileFilters,
    groupBy: groupBy,
    setGroupBy: setGroupBy,
    sortBy: sortBy,
    setSortBy: setSortBy,
    inStockOnly: inStockOnly,
    setInStockOnly: setInStockOnly,
    GROUP_BY_OPTIONS: GROUP_BY_OPTIONS,
    activeFilterOptions: activeFilterOptions,
    setSelectedCategory: setSelectedCategory,
    visibleFamilies: visibleFamilies,
    groupedVisibleFamilies: groupedVisibleFamilies,
    renderFamilyCard: renderFamilyCard,
    estimatedGridColumns: estimatedGridColumns,
    VIRTUALIZE_GROUP_THRESHOLD: VIRTUALIZE_GROUP_THRESHOLD,
    hasMoreProducts: hasMoreProducts,
    filteredFamilies: filteredFamilies,
    commitSearchQuery: commitSearchQuery,
    DEFAULT_SORT_BY: DEFAULT_SORT_BY,
    showMobileFilters: showMobileFilters,
    smartSectionsProps: smartSectionsProps,
  };
}
