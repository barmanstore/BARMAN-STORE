import { useEffect, useMemo, useCallback, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useCart } from '../../../../providers/CartProvider';
import { getProductFallbackImage } from '../../../../shared/utils/productImage';
import { formatCurrency } from '../../../../shared/utils/formatters';
import useIsMobile from '../../../../shared/hooks/useIsMobile';
import * as info from '../../../../shared/info.js';
import useProductsRenderers from './useProductsRenderers.jsx';
import useProductsCartActions from './useProductsCartActions';
import useProductsLoadMore from './useProductsLoadMore';
import useProductsMobileActions from './useProductsMobileActions';
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
import buildProductsPageProps from './buildProductsPageProps';
import * as productHelpers from '../utils/productHelpers.js';
import { DOMAINS, registerDomainListener } from '../../../../shared/services/invalidation';
export default function useProductsController() {
  const { cart: sharedCart, replaceCart } = useCart();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initialSearchQuery = String(searchParams.get('q') || '');
  const initialGroupBy =
    searchParams.get('group') === productHelpers.GROUP_BY_OPTIONS.brand
      ? productHelpers.GROUP_BY_OPTIONS.brand
      : productHelpers.GROUP_BY_OPTIONS.category;
  const [snackbar, setSnackbar] = useState({ show: false, message: '', undo: null });
  const productsState = useProductsState({
    initialSearchQuery,
    initialGroupBy,
    initialCategory: searchParams.get('category') || 'all',
    searchParams,
    MOBILE_TAB_OPTIONS: productHelpers.MOBILE_TAB_OPTIONS,
    normalizeSortBy: productHelpers.normalizeSortBy,
  });
  const userProfile = useProductsUserProfile();
  const logoImage = productHelpers.getPublicFileUrl(info.LOGO_URL || 'logo.png');
  const storeTitle = String(info.TITLE || 'Store').trim() || 'Store';
  const productPageSize = productHelpers.getProductPageSize(isMobile);
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
  } = productsState;
  const serverCategoryFilter =
    groupBy === productHelpers.GROUP_BY_OPTIONS.category ? selectedCategory : 'all';
  const { getLocalSuggestions } = useProductsLocalSuggestions({
    products,
    normalizeText: productHelpers.normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS: productHelpers.SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_MAX_ITEMS: productHelpers.SEARCH_SUGGESTIONS_MAX_ITEMS,
  });

  useProductsLayoutEffects({
    productsPageRef: productsPageRef,
    controlsRef: controlsRef,
    mobileHeaderRef: mobileHeaderRef,
    isMobile,
  });
  const { fetchProductsPage } = useProductsDataFetch({
    serverCategoryFilter,
    appliedSearchQuery: appliedSearchQuery,
    sortBy: sortBy,
    inStockOnly: inStockOnly,
    productPageSize,
    SORT_API_FALLBACK: productHelpers.SORT_API_FALLBACK,
    buildProductsListSessionCacheKey: productHelpers.buildProductsListSessionCacheKey,
    PRODUCTS_LIST_CACHE_TTL_MS: productHelpers.PRODUCTS_LIST_CACHE_TTL_MS,
    safeReadSessionJson: productHelpers.safeReadSessionJson,
    safeWriteSessionJson: productHelpers.safeWriteSessionJson,
    latestProductsRequestRef: latestProductsRequestRef,
    productsLoadingMoreRef: productsLoadingMoreRef,
    productsAbortControllerRef: productsAbortControllerRef,
    setProducts: setProducts,
    setProductsPage: setProductsPage,
    setProductsHasMore: setProductsHasMore,
    setError: setError,
    setLoading: setLoading,
    setIsLoadingMore: setIsLoadingMore,
  });

  const refreshProductsCatalog = useCallback(async () => {
    if (productsAbortControllerRef.current) {
      productsAbortControllerRef.current.abort();
      productsAbortControllerRef.current = null;
    }
    const cacheKey = productHelpers.buildProductsListSessionCacheKey({
      selectedCategory: serverCategoryFilter,
      query: appliedSearchQuery,
      sortBy,
      inStockOnly,
      pageSize: productPageSize,
    });
    const requestId = latestProductsRequestRef.current + 1;
    latestProductsRequestRef.current = requestId;
    productsLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    setError('');
    setLoading(true);
    await fetchProductsPage({
      page: Math.max(1, Number(productsPage || 1)),
      append: false,
      requestId,
      cacheKey,
    });
  }, [
    fetchProductsPage,
    productPageSize,
    appliedSearchQuery,
    inStockOnly,
    latestProductsRequestRef,
    productsAbortControllerRef,
    productsLoadingMoreRef,
    productsPage,
    setError,
    setIsLoadingMore,
    setLoading,
    sortBy,
    serverCategoryFilter,
  ]);

  useEffect(
    () =>
      registerDomainListener(DOMAINS.Products, refreshProductsCatalog, {
        listenerId: 'catalog-products',
      }),
    [refreshProductsCatalog]
  );

  useEffect(() => {
    setCart(Array.isArray(sharedCart) ? sharedCart : []);
  }, [setCart, sharedCart]);

  useProductsBootstrap({
    setCategories: setCategories,
    setRecentlyBought: setRecentlyBought,
    setCart: setCart,
    storedCart: sharedCart,
    setUsageHistory: setUsageHistory,
    safeReadJson: productHelpers.safeReadJson,
    safeReadSessionJson: productHelpers.safeReadSessionJson,
    safeWriteSessionJson: productHelpers.safeWriteSessionJson,
    PRODUCTS_CATEGORIES_CACHE_KEY: productHelpers.PRODUCTS_CATEGORIES_CACHE_KEY,
    PRODUCTS_CATEGORIES_CACHE_TTL_MS: productHelpers.PRODUCTS_CATEGORIES_CACHE_TTL_MS,
    USAGE_HISTORY_KEY: productHelpers.USAGE_HISTORY_KEY,
    RECENTLY_BOUGHT_LIMIT: productHelpers.RECENTLY_BOUGHT_LIMIT,
    hasActiveUserSession: productHelpers.hasActiveUserSession,
  });
  useProductsSearchParamsSync({
    searchParams,
    setSearchParams,
    selectedCategory: selectedCategory,
    appliedSearchQuery: appliedSearchQuery,
    sortBy: sortBy,
    groupBy: groupBy,
    inStockOnly: inStockOnly,
    setSelectedCategory: setSelectedCategory,
    setSearchInputValue: setSearchInputValue,
    setAppliedSearchQuery: setAppliedSearchQuery,
    setSortBy: setSortBy,
    setGroupBy: setGroupBy,
    setInStockOnly: setInStockOnly,
    setSearchSuggestionsEnabled: setSearchSuggestionsEnabled,
    setShowSearchSuggestions: setShowSearchSuggestions,
    setActiveSuggestionIndex: setActiveSuggestionIndex,
    normalizeSortBy: productHelpers.normalizeSortBy,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
    DEFAULT_SORT_BY: productHelpers.DEFAULT_SORT_BY,
  });
  useProductsUiEffects({
    notice: notice,
    setNotice: setNotice,
    showSearchSuggestions: showSearchSuggestions,
    searchInputRef: searchInputRef,
    setSearchSuggestionsEnabled: setSearchSuggestionsEnabled,
    setShowSearchSuggestions: setShowSearchSuggestions,
    setActiveSuggestionIndex: setActiveSuggestionIndex,
    swipeAddedFamilyId: swipeAddedFamilyId,
    setSwipeAddedFamilyId: setSwipeAddedFamilyId,
  });
  useProductsVitals({ productsTelemetryRef: productsTelemetryRef });

  useEffect(() => {
    setSelectedSubcategory('all');
  }, [selectedCategory, setSelectedSubcategory]);

  useProductSearchSuggestions({
    searchInputValue: searchInputValue,
    searchSuggestionsEnabled: searchSuggestionsEnabled,
    getLocalSuggestions,
    normalizeText: productHelpers.normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS: productHelpers.SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_CACHE_TTL_MS: productHelpers.SEARCH_SUGGESTIONS_CACHE_TTL_MS,
    SEARCH_SUGGESTIONS_MAX_ITEMS: productHelpers.SEARCH_SUGGESTIONS_MAX_ITEMS,
    searchSuggestionsCacheRef: searchSuggestionsCacheRef,
    searchSuggestionsRequestRef: searchSuggestionsRequestRef,
    searchSuggestionsAbortRef: searchSuggestionsAbortRef,
    setSearchSuggestions: setSearchSuggestions,
    setShowSearchSuggestions: setShowSearchSuggestions,
    setActiveSuggestionIndex: setActiveSuggestionIndex,
    setIsLoadingSuggestions: setIsLoadingSuggestions,
    showSearchSuggestions: showSearchSuggestions,
    activeSuggestionIndex: activeSuggestionIndex,
    searchSuggestionsLength: searchSuggestions.length,
  });

  const trackProductsEvent = useProductsTelemetry({
    productsTelemetryRef: productsTelemetryRef,
    groupBy: groupBy,
    sortBy: sortBy,
    inStockOnly: inStockOnly,
    isMobile,
    searchParams,
  });

  useEffect(() => {
    trackProductsEvent(
      'products_search_changed',
      {
        query_length: String(appliedSearchQuery || '').trim().length,
        has_query: appliedSearchQuery ? 1 : 0,
      },
      { throttleMs: 1200, throttleKey: 'products_search_changed' }
    );
  }, [appliedSearchQuery, trackProductsEvent]);

  const productFamilies = useMemo(() => buildProductFamilies(products), [products]);

  const catalogFilters = useProductsCatalogFilters({
    categories: categories,
    productFamilies,
    groupBy: groupBy,
    selectedCategory: selectedCategory,
    normalizeText: productHelpers.normalizeText,
    splitHierarchyValue: productHelpers.splitHierarchyValue,
    resolveBrandLogoUrl: productHelpers.resolveBrandLogoUrl,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
  });

  const filterScopes = useProductsFilterScopes({
    selectedCategory: selectedCategory,
    groupBy: groupBy,
    effectiveCategories: catalogFilters.effectiveCategories,
    activeFilterOptions: catalogFilters.activeFilterOptions,
    normalizeText: productHelpers.normalizeText,
    normalizePathValue: productHelpers.normalizePathValue,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
  });

  const familyGroups = useProductsFamilyGroups({
    productFamilies,
    deferredAppliedSearchQuery: deferredAppliedSearchQuery,
    selectedCategory: selectedCategory,
    sortBy: sortBy,
    inStockOnly: inStockOnly,
    groupBy: groupBy,
    categoryPathScopeSet: filterScopes.categoryPathScopeSet,
    categoryIdScopeSet: filterScopes.categoryIdScopeSet,
    categoryNameScopeSet: filterScopes.categoryNameScopeSet,
    brandPathScopeSet: filterScopes.brandPathScopeSet,
    usageHistory: usageHistory,
    normalizeText: productHelpers.normalizeText,
    tokenizeSearchText: productHelpers.tokenizeSearchText,
    PRODUCTS_SYNONYMS: productHelpers.PRODUCTS_SYNONYMS,
    PRODUCTS_SYNONYM_REVERSE: productHelpers.PRODUCTS_SYNONYM_REVERSE,
    tokenFuzzyMatch: productHelpers.tokenFuzzyMatch,
    splitHierarchyValue: productHelpers.splitHierarchyValue,
    composeHierarchyLabel: productHelpers.composeHierarchyLabel,
    normalizePathValue: productHelpers.normalizePathValue,
    normalizePathTokens: productHelpers.normalizePathTokens,
    familyHasImage: productHelpers.familyHasImage,
    getFirstAvailableVariation: productHelpers.getFirstAvailableVariation,
    activeFilterOptions: catalogFilters.activeFilterOptions,
    selectedSubcategory: selectedSubcategory,
    isMobile,
    setSelectedCategory: setSelectedCategory,
    setSelectedVariationByFamily: setSelectedVariationByFamily,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
    productsHasMore: productsHasMore,
  });

  useEffect(() => {
    loadMoreProductsRef.current = () => {
      if (loading || isLoadingMore || productsLoadingMoreRef.current || !productsHasMore) return;
      trackProductsEvent(
        'products_load_more',
        {
          current_page: Number(productsPage || 0),
          next_page: Number(productsPage || 0) + 1,
        },
        { throttleMs: 600, throttleKey: 'products_load_more' }
      );
      const nextRequestId = latestProductsRequestRef.current;
      productsLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      fetchProductsPage({
        page: productsPage + 1,
        append: true,
        requestId: nextRequestId,
      });
    };
  }, [
    loading,
    isLoadingMore,
    productsLoadingMoreRef,
    productsHasMore,
    trackProductsEvent,
    productsPage,
    latestProductsRequestRef,
    setIsLoadingMore,
    fetchProductsPage,
    loadMoreProductsRef,
  ]);

  useEffect(() => {
    if (loading) return;
    if (familyGroups.filteredFamilies.length !== 0) return;
    trackProductsEvent(
      'products_no_results',
      {
        query_length: String(appliedSearchQuery || '').trim().length,
        category: selectedCategory,
        sort_by: sortBy,
        stock_only: inStockOnly ? 1 : 0,
      },
      { throttleMs: 1600, throttleKey: 'products_no_results' }
    );
  }, [
    loading,
    familyGroups.filteredFamilies.length,
    appliedSearchQuery,
    selectedCategory,
    sortBy,
    inStockOnly,
    trackProductsEvent,
  ]);

  useProductsLoadMore({
    loading: loading,
    isLoadingMore: isLoadingMore,
    productsHasMore: productsHasMore,
    productsLoadTriggerRef: productsLoadTriggerRef,
    loadMoreProductsRef: loadMoreProductsRef,
    rootMargin: productHelpers.PRODUCTS_AUTOLOAD_ROOT_MARGIN,
    deps: [
      productsPage,
      serverCategoryFilter,
      appliedSearchQuery,
      sortBy,
      inStockOnly,
      productPageSize,
    ],
  });

  const cartActions = useProductsCartActions({
    cart: cart,
    setCart: setCart,
    replaceCart,
    setButtonStatus: setButtonStatus,
    setNotice: setNotice,
    setUsageHistory: setUsageHistory,
    setSelectedVariationByFamily: setSelectedVariationByFamily,
    selectedVariationByFamily: selectedVariationByFamily,
    quickTileTouchStartRef: quickTileTouchStartRef,
    quickTileDidSwipeRef: quickTileDidSwipeRef,
    setSwipeAddedFamilyId: setSwipeAddedFamilyId,
    trackProductsEvent,
    safeWriteJson: productHelpers.safeWriteJson,
    USAGE_HISTORY_KEY: productHelpers.USAGE_HISTORY_KEY,
    getFirstAvailableVariation: productHelpers.getFirstAvailableVariation,
    isMobile,
    setActiveMobileFamilyId: setActiveMobileFamilyId,
    setActiveDesktopFamilyId: setActiveDesktopFamilyId,
  });

  const activeMobileFamily = useMemo(
    () =>
      familyGroups.filteredFamilies.find((family) => family.id === activeMobileFamilyId) || null,
    [familyGroups.filteredFamilies, activeMobileFamilyId]
  );

  const { addFamilyPackToCart } = cartActions;
  const handleAddCombo = useCallback(
    (combo) => {
      if (!combo?.items?.length) return;
      addFamilyPackToCart(combo.items, { source: `combo_${String(combo.id || 'unknown')}` });
    },
    [addFamilyPackToCart]
  );

  const {
    handleMobileCategorySelect,
    handleMobileSubcategorySelect,
    handleMobileOfferAction,
    handleMobileScrollTo,
  } = useProductsMobileActions({
    groupBy: groupBy,
    setGroupBy: setGroupBy,
    setSelectedCategory: setSelectedCategory,
    setSelectedSubcategory: setSelectedSubcategory,
    isMobile,
    locationHash: location.hash,
    handleAddCombo,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
  });
  const recommendations = useProductsRecommendations({
    selectedCategory: selectedCategory,
    filteredFamilies: familyGroups.filteredFamilies,
    mobileFilteredFamilies: familyGroups.mobileFilteredFamilies,
    productFamilies,
    usageHistory: usageHistory,
    recentlyBought: recentlyBought,
    isMobile,
    selectedVariationByFamily: selectedVariationByFamily,
    getSelectedVariation: cartActions.getSelectedVariation,
    getUsageWindowDays: productHelpers.getUsageWindowDays,
    RESTOCK_ALERT_THRESHOLD: productHelpers.RESTOCK_ALERT_THRESHOLD,
    CRITICAL_RESTOCK_THRESHOLD: productHelpers.CRITICAL_RESTOCK_THRESHOLD,
    normalizeText: productHelpers.normalizeText,
  });

  const handleRepeatOrder = () => {
    const availableFamilies = recommendations.repeatOrderFamilies.filter((family) => {
      // Check if the selected variation is in stock
      const selectedVariation = cartActions.getSelectedVariation(family);
      return selectedVariation && selectedVariation.in_stock;
    });
    const skippedCount = recommendations.repeatOrderFamilies.length - availableFamilies.length;
    cartActions.addFamilyPackToCart(availableFamilies, { source: 'repeat_order' });
    if (skippedCount > 0) {
      console.log(`${skippedCount} items unavailable and skipped`);
    }
  };

  const showSnackbar = (message, undo = null) => {
    setSnackbar({ show: true, message, undo });
    setTimeout(() => setSnackbar({ show: false, message: '', undo: null }), 3000);
  };

  const addToCartWithSnackbar = (family, variation) => {
    cartActions.addToCart(family, variation);
    showSnackbar('Added to cart', () => cartActions.decreaseFromCart(variation));
  };

  const handleRestockAll = () => {
    const entries = recommendations.smartRestockItems.map((item) => ({
      family: item.family,
      variation: item.variation,
      quantity: 1,
    }));
    cartActions.addEntriesToCart(entries, { source: 'restock_all' });
  };

  const estimatedGridColumns = isMobile ? 2 : 4;
  const eagerImageBudget = isMobile
    ? productHelpers.ABOVE_FOLD_EAGER_IMAGE_COUNT.mobile
    : productHelpers.ABOVE_FOLD_EAGER_IMAGE_COUNT.desktop;
  const renderers = useProductsRenderers({
    isMobile,
    activeDesktopFamilyId: activeDesktopFamilyId,
    visibleFamilyIndexById: familyGroups.visibleFamilyIndexById,
    eagerImageBudget,
    getSelectedVariation: cartActions.getSelectedVariation,
    getFamilyCardState: productHelpers.getFamilyCardState,
    cartQtyById: cartActions.cartQtyById,
    openFamilyDetails: cartActions.openFamilyDetails,
    addToCart: addToCartWithSnackbar,
    decreaseFromCart: cartActions.decreaseFromCart,
    handleSelectVariation: cartActions.handleSelectVariation,
    buttonStatus: buttonStatus,
    swipeAddedFamilyId: swipeAddedFamilyId,
    quickTileDidSwipeRef: quickTileDidSwipeRef,
    handleQuickTileTouchStart: cartActions.handleQuickTileTouchStart,
    handleQuickTileTouchEnd: cartActions.handleQuickTileTouchEnd,
    formatCurrency,
    LOW_STOCK_THRESHOLD: productHelpers.LOW_STOCK_THRESHOLD,
  });

  const searchHandlers = useProductsSearchHandlers({
    searchInputValue: searchInputValue,
    setSearchInputValue: setSearchInputValue,
    setSearchSuggestionsEnabled: setSearchSuggestionsEnabled,
    setSearchSuggestions: setSearchSuggestions,
    setShowSearchSuggestions: setShowSearchSuggestions,
    setActiveSuggestionIndex: setActiveSuggestionIndex,
    setAppliedSearchQuery: setAppliedSearchQuery,
    showSearchSuggestions: showSearchSuggestions,
    searchSuggestions: searchSuggestions,
    activeSuggestionIndex: activeSuggestionIndex,
    SEARCH_SUGGESTIONS_MIN_CHARS: productHelpers.SEARCH_SUGGESTIONS_MIN_CHARS,
    trackProductsEvent,
  });

  const smartSectionsProps = {
    repeatOrderFamilies: recommendations.repeatOrderFamilies,
    recentlyBoughtFamilies: recommendations.recentlyBoughtFamilies,
    handleRepeatOrder,
    getSelectedVariation: cartActions.getSelectedVariation,
    getFamilyPreviewVariation: productHelpers.getFamilyPreviewVariation,
    smartRestockItems: recommendations.smartRestockItems,
    handleRestockAll,
    addToCart: cartActions.addToCart,
    quickAddFamilies: recommendations.quickAddFamilies,
    renderQuickAddTile: renderers.renderQuickAddTile,
    comboSuggestions: recommendations.comboSuggestions,
    handleAddCombo,
  };

  // eslint-disable-next-line react-hooks/refs
  return buildProductsPageProps({
    isMobile,
    loading: loading,
    products: products,
    productsPageRef: productsPageRef,
    mobileHeaderRef: mobileHeaderRef,
    logoImage,
    storeTitle,
    localUser: userProfile.localUser,
    avatarLoadFailed: userProfile.avatarLoadFailed,
    avatarSrc: userProfile.avatarSrc,
    setAvatarLoadFailed: userProfile.setAvatarLoadFailed,
    normalizeText: productHelpers.normalizeText,
    getInitials: productHelpers.getInitials,
    searchInputValue: searchInputValue,
    handleMobileSearchChange: searchHandlers.handleMobileSearchChange,
    handleMobileSearchFocus: searchHandlers.handleMobileSearchFocus,
    handleMobileSearchKeyDown: searchHandlers.handleMobileSearchKeyDown,
    showSearchSuggestions: showSearchSuggestions,
    searchSuggestions: searchSuggestions,
    searchSuggestionsListId: searchSuggestionsListId,
    activeSuggestionIndex: activeSuggestionIndex,
    setActiveSuggestionIndex: setActiveSuggestionIndex,
    selectSearchSuggestion: searchHandlers.selectSearchSuggestion,
    clearSearchQuery: searchHandlers.clearSearchQuery,
    isLoadingSuggestions: isLoadingSuggestions,
    SEARCH_SUGGESTIONS_MAX_ITEMS: productHelpers.SEARCH_SUGGESTIONS_MAX_ITEMS,
    getSuggestionImageSrc: productHelpers.getSuggestionImageSrc,
    getProductFallbackImage,
    formatCurrency,
    selectedCategory: selectedCategory,
    handleMobileCategorySelect,
    mobileRootCategories: catalogFilters.mobileRootCategories,
    renderCategoryChipLabel: renderers.renderCategoryChipLabel,
    notice: notice,
    error: error,
    mobileSubcategories: catalogFilters.mobileSubcategories,
    selectedSubcategory: selectedSubcategory,
    handleMobileSubcategorySelect,
    mobileOffers: recommendations.mobileOffers,
    handleMobileOfferAction,
    repeatOrderFamilies: recommendations.repeatOrderFamilies,
    recentlyBoughtFamilies: recommendations.recentlyBoughtFamilies,
    handleRepeatOrder,
    openFamilyDetails: cartActions.openFamilyDetails,
    getSelectedVariation: cartActions.getSelectedVariation,
    getFamilyPreviewVariation: productHelpers.getFamilyPreviewVariation,
    popularFamilies: recommendations.popularFamilies,
    renderMobileProductCard: renderers.renderMobileProductCard,
    smartRestockItems: recommendations.smartRestockItems,
    handleRestockAll,
    addToCart: cartActions.addToCart,
    quickAddFamilies: recommendations.quickAddFamilies,
    MOBILE_TAB_OPTIONS: productHelpers.MOBILE_TAB_OPTIONS,
    activeMobileTab: activeMobileTab,
    setActiveMobileTab: setActiveMobileTab,
    mobileTabFamilies: recommendations.mobileTabFamilies,
    productsHasMore: productsHasMore,
    productsLoadTriggerRef: productsLoadTriggerRef,
    isLoadingMore: isLoadingMore,
    loadMoreProductsRef: loadMoreProductsRef,
    cartItemCount: cartActions.cartItemCount,
    handleMobileScrollTo,
    activeMobileFamily,
    setActiveMobileFamilyId: setActiveMobileFamilyId,
    handleSelectVariation: cartActions.handleSelectVariation,
    decreaseFromCart: cartActions.decreaseFromCart,
    cartQtyById: cartActions.cartQtyById,
    buttonStatus: buttonStatus,
    controlsRef: controlsRef,
    searchInputRef: searchInputRef,
    handleDesktopSearchChange: searchHandlers.handleDesktopSearchChange,
    handleDesktopSearchFocus: searchHandlers.handleDesktopSearchFocus,
    handleDesktopSearchKeyDown: searchHandlers.handleDesktopSearchKeyDown,
    cartPreviewTotal: cartActions.cartPreviewTotal,
    setShowMobileFilters: setShowMobileFilters,
    groupBy: groupBy,
    setGroupBy: setGroupBy,
    sortBy: sortBy,
    setSortBy: setSortBy,
    inStockOnly: inStockOnly,
    setInStockOnly: setInStockOnly,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
    activeFilterOptions: catalogFilters.activeFilterOptions,
    setSelectedCategory: setSelectedCategory,
    visibleFamilies: familyGroups.visibleFamilies,
    groupedVisibleFamilies: familyGroups.groupedVisibleFamilies,
    renderFamilyCard: renderers.renderFamilyCard,
    estimatedGridColumns,
    VIRTUALIZE_GROUP_THRESHOLD: productHelpers.VIRTUALIZE_GROUP_THRESHOLD,
    hasMoreProducts: familyGroups.hasMoreProducts,
    filteredFamilies: familyGroups.filteredFamilies,
    commitSearchQuery: searchHandlers.commitSearchQuery,
    DEFAULT_SORT_BY: productHelpers.DEFAULT_SORT_BY,
    showMobileFilters: showMobileFilters,
    smartSectionsProps,
    snackbar,
    dismissSnackbar: () => setSnackbar({ show: false, message: '', undo: null }),
  });
}
