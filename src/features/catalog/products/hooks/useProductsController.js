import { useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
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
  const initialGroupBy = searchParams.get('group') === productHelpers.GROUP_BY_OPTIONS.brand
    ? productHelpers.GROUP_BY_OPTIONS.brand
    : productHelpers.GROUP_BY_OPTIONS.category;
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
  const serverCategoryFilter = productsState.groupBy === productHelpers.GROUP_BY_OPTIONS.category ? productsState.selectedCategory : 'all';
  const { getLocalSuggestions } = useProductsLocalSuggestions({
    products: productsState.products,
    normalizeText: productHelpers.normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS: productHelpers.SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_MAX_ITEMS: productHelpers.SEARCH_SUGGESTIONS_MAX_ITEMS,
  });

  useProductsLayoutEffects({
    productsPageRef: productsState.productsPageRef,
    controlsRef: productsState.controlsRef,
    mobileHeaderRef: productsState.mobileHeaderRef,
    isMobile,
  });
  const { fetchProductsPage } = useProductsDataFetch({
    serverCategoryFilter,
    appliedSearchQuery: productsState.appliedSearchQuery,
    sortBy: productsState.sortBy,
    inStockOnly: productsState.inStockOnly,
    productPageSize,
    SORT_API_FALLBACK: productHelpers.SORT_API_FALLBACK,
    buildProductsListSessionCacheKey: productHelpers.buildProductsListSessionCacheKey,
    PRODUCTS_LIST_CACHE_TTL_MS: productHelpers.PRODUCTS_LIST_CACHE_TTL_MS,
    safeReadSessionJson: productHelpers.safeReadSessionJson,
    safeWriteSessionJson: productHelpers.safeWriteSessionJson,
    latestProductsRequestRef: productsState.latestProductsRequestRef,
    productsLoadingMoreRef: productsState.productsLoadingMoreRef,
    productsAbortControllerRef: productsState.productsAbortControllerRef,
    setProducts: productsState.setProducts,
    setProductsPage: productsState.setProductsPage,
    setProductsHasMore: productsState.setProductsHasMore,
    setError: productsState.setError,
    setLoading: productsState.setLoading,
    setIsLoadingMore: productsState.setIsLoadingMore,
  });
  useProductsBootstrap({
    setCategories: productsState.setCategories,
    setRecentlyBought: productsState.setRecentlyBought,
    setCart: productsState.setCart,
    setCartCount,
    setUsageHistory: productsState.setUsageHistory,
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
    selectedCategory: productsState.selectedCategory,
    appliedSearchQuery: productsState.appliedSearchQuery,
    sortBy: productsState.sortBy,
    groupBy: productsState.groupBy,
    inStockOnly: productsState.inStockOnly,
    setSelectedCategory: productsState.setSelectedCategory,
    setSearchInputValue: productsState.setSearchInputValue,
    setAppliedSearchQuery: productsState.setAppliedSearchQuery,
    setSortBy: productsState.setSortBy,
    setGroupBy: productsState.setGroupBy,
    setInStockOnly: productsState.setInStockOnly,
    setSearchSuggestionsEnabled: productsState.setSearchSuggestionsEnabled,
    setShowSearchSuggestions: productsState.setShowSearchSuggestions,
    setActiveSuggestionIndex: productsState.setActiveSuggestionIndex,
    normalizeSortBy: productHelpers.normalizeSortBy,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
    DEFAULT_SORT_BY: productHelpers.DEFAULT_SORT_BY,
  });
  useProductsUiEffects({
    isMobile,
    notice: productsState.notice,
    setNotice: productsState.setNotice,
    showSearchSuggestions: productsState.showSearchSuggestions,
    searchInputRef: productsState.searchInputRef,
    setSearchSuggestionsEnabled: productsState.setSearchSuggestionsEnabled,
    setShowSearchSuggestions: productsState.setShowSearchSuggestions,
    setActiveSuggestionIndex: productsState.setActiveSuggestionIndex,
    swipeAddedFamilyId: productsState.swipeAddedFamilyId,
    setSwipeAddedFamilyId: productsState.setSwipeAddedFamilyId,
  });
  useProductsVitals({ productsTelemetryRef: productsState.productsTelemetryRef });

  useEffect(() => {
    productsState.setSelectedSubcategory('all');
  }, [productsState.selectedCategory]);

  useProductSearchSuggestions({
    searchInputValue: productsState.searchInputValue,
    searchSuggestionsEnabled: productsState.searchSuggestionsEnabled,
    getLocalSuggestions,
    normalizeText: productHelpers.normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS: productHelpers.SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_CACHE_TTL_MS: productHelpers.SEARCH_SUGGESTIONS_CACHE_TTL_MS,
    SEARCH_SUGGESTIONS_MAX_ITEMS: productHelpers.SEARCH_SUGGESTIONS_MAX_ITEMS,
    searchSuggestionsCacheRef: productsState.searchSuggestionsCacheRef,
    searchSuggestionsRequestRef: productsState.searchSuggestionsRequestRef,
    searchSuggestionsAbortRef: productsState.searchSuggestionsAbortRef,
    setSearchSuggestions: productsState.setSearchSuggestions,
    setShowSearchSuggestions: productsState.setShowSearchSuggestions,
    setActiveSuggestionIndex: productsState.setActiveSuggestionIndex,
    setIsLoadingSuggestions: productsState.setIsLoadingSuggestions,
    showSearchSuggestions: productsState.showSearchSuggestions,
    activeSuggestionIndex: productsState.activeSuggestionIndex,
    searchSuggestionsLength: productsState.searchSuggestions.length,
  });

  const trackProductsEvent = useProductsTelemetry({
    productsTelemetryRef: productsState.productsTelemetryRef,
    groupBy: productsState.groupBy,
    sortBy: productsState.sortBy,
    inStockOnly: productsState.inStockOnly,
    isMobile,
    searchParams,
  });

  useEffect(() => {
    trackProductsEvent('products_search_changed', {
      query_length: String(productsState.appliedSearchQuery || '').trim().length,
      has_query: productsState.appliedSearchQuery ? 1 : 0
    }, { throttleMs: 1200, throttleKey: 'products_search_changed' });
  }, [productsState.appliedSearchQuery, trackProductsEvent]);

  const productFamilies = useMemo(() => buildProductFamilies(productsState.products), [productsState.products]);

  const catalogFilters = useProductsCatalogFilters({
    categories: productsState.categories,
    productFamilies,
    groupBy: productsState.groupBy,
    selectedCategory: productsState.selectedCategory,
    normalizeText: productHelpers.normalizeText,
    splitHierarchyValue: productHelpers.splitHierarchyValue,
    resolveBrandLogoUrl: productHelpers.resolveBrandLogoUrl,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
  });

  const filterScopes = useProductsFilterScopes({
    selectedCategory: productsState.selectedCategory,
    groupBy: productsState.groupBy,
    effectiveCategories: catalogFilters.effectiveCategories,
    activeFilterOptions: catalogFilters.activeFilterOptions,
    normalizeText: productHelpers.normalizeText,
    normalizePathValue: productHelpers.normalizePathValue,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
  });

  const familyGroups = useProductsFamilyGroups({
    productFamilies,
    deferredAppliedSearchQuery: productsState.deferredAppliedSearchQuery,
    selectedCategory: productsState.selectedCategory,
    sortBy: productsState.sortBy,
    inStockOnly: productsState.inStockOnly,
    groupBy: productsState.groupBy,
    categoryPathScopeSet: filterScopes.categoryPathScopeSet,
    categoryIdScopeSet: filterScopes.categoryIdScopeSet,
    categoryNameScopeSet: filterScopes.categoryNameScopeSet,
    brandPathScopeSet: filterScopes.brandPathScopeSet,
    usageHistory: productsState.usageHistory,
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
    selectedSubcategory: productsState.selectedSubcategory,
    isMobile,
    setSelectedCategory: productsState.setSelectedCategory,
    setSelectedVariationByFamily: productsState.setSelectedVariationByFamily,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
    productsHasMore: productsState.productsHasMore,
  });

  productsState.loadMoreProductsRef.current = () => {
    if (productsState.loading || productsState.isLoadingMore || productsState.productsLoadingMoreRef.current || !productsState.productsHasMore) return;
    trackProductsEvent('products_load_more', {
      current_page: Number(productsState.productsPage || 0),
      next_page: Number(productsState.productsPage || 0) + 1
    }, { throttleMs: 600, throttleKey: 'products_load_more' });
    const nextRequestId = productsState.latestProductsRequestRef.current;
    productsState.productsLoadingMoreRef.current = true;
    productsState.setIsLoadingMore(true);
    fetchProductsPage({
      page: productsState.productsPage + 1,
      append: true,
      requestId: nextRequestId,
    });
  };

  useEffect(() => {
    if (productsState.loading) return;
    if (familyGroups.filteredFamilies.length !== 0) return;
    trackProductsEvent('products_no_results', {
      query_length: String(productsState.appliedSearchQuery || '').trim().length,
      category: productsState.selectedCategory,
      sort_by: productsState.sortBy,
      stock_only: productsState.inStockOnly ? 1 : 0
    }, { throttleMs: 1600, throttleKey: 'products_no_results' });
  }, [productsState.loading, familyGroups.filteredFamilies.length, productsState.appliedSearchQuery, productsState.selectedCategory, productsState.sortBy, productsState.inStockOnly, trackProductsEvent]);

  useProductsLoadMore({
    loading: productsState.loading,
    isLoadingMore: productsState.isLoadingMore,
    productsHasMore: productsState.productsHasMore,
    productsLoadTriggerRef: productsState.productsLoadTriggerRef,
    loadMoreProductsRef: productsState.loadMoreProductsRef,
    rootMargin: productHelpers.PRODUCTS_AUTOLOAD_ROOT_MARGIN,
    deps: [productsState.productsPage, serverCategoryFilter, productsState.appliedSearchQuery, productsState.sortBy, productsState.inStockOnly, productPageSize],
  });

  const cartActions = useProductsCartActions({
    cart: productsState.cart,
    setCart: productsState.setCart,
    setCartCount,
    setButtonStatus: productsState.setButtonStatus,
    setNotice: productsState.setNotice,
    setUsageHistory: productsState.setUsageHistory,
    setSelectedVariationByFamily: productsState.setSelectedVariationByFamily,
    selectedVariationByFamily: productsState.selectedVariationByFamily,
    quickTileTouchStartRef: productsState.quickTileTouchStartRef,
    quickTileDidSwipeRef: productsState.quickTileDidSwipeRef,
    setSwipeAddedFamilyId: productsState.setSwipeAddedFamilyId,
    trackProductsEvent,
    safeReadJson: productHelpers.safeReadJson,
    safeWriteJson: productHelpers.safeWriteJson,
    USAGE_HISTORY_KEY: productHelpers.USAGE_HISTORY_KEY,
    getFirstAvailableVariation: productHelpers.getFirstAvailableVariation,
    isMobile,
    setActiveMobileFamilyId: productsState.setActiveMobileFamilyId,
    setActiveDesktopFamilyId: productsState.setActiveDesktopFamilyId,
  });

  const activeMobileFamily = useMemo(
    () => familyGroups.filteredFamilies.find((family) => family.id === productsState.activeMobileFamilyId) || null,
    [familyGroups.filteredFamilies, productsState.activeMobileFamilyId]
  );

  const handleAddCombo = useCallback((combo) => {
    if (!combo?.items?.length) return;
    cartActions.addFamilyPackToCart(combo.items, { source: `combo_${String(combo.id || 'unknown')}` });
  }, [cartActions.addFamilyPackToCart]);

  const {
    handleMobileCategorySelect,
    handleMobileSubcategorySelect,
    handleMobileOfferAction,
    handleMobileScrollTo,
  } = useProductsMobileActions({
    groupBy: productsState.groupBy,
    setGroupBy: productsState.setGroupBy,
    setSelectedCategory: productsState.setSelectedCategory,
    setSelectedSubcategory: productsState.setSelectedSubcategory,
    isMobile,
    locationHash: location.hash,
    handleAddCombo,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
  });
  const recommendations = useProductsRecommendations({
    selectedCategory: productsState.selectedCategory,
    filteredFamilies: familyGroups.filteredFamilies,
    mobileFilteredFamilies: familyGroups.mobileFilteredFamilies,
    productFamilies,
    usageHistory: productsState.usageHistory,
    recentlyBought: productsState.recentlyBought,
    isMobile,
    selectedVariationByFamily: productsState.selectedVariationByFamily,
    getSelectedVariation: cartActions.getSelectedVariation,
    getUsageWindowDays: productHelpers.getUsageWindowDays,
    RESTOCK_ALERT_THRESHOLD: productHelpers.RESTOCK_ALERT_THRESHOLD,
    CRITICAL_RESTOCK_THRESHOLD: productHelpers.CRITICAL_RESTOCK_THRESHOLD,
    normalizeText: productHelpers.normalizeText,
  });

  const handleRepeatOrder = () => {
    cartActions.addFamilyPackToCart(recommendations.repeatOrderFamilies, { source: 'repeat_order' });
  };

  const handleRestockAll = () => {
    const entries = recommendations.smartRestockItems.map((item) => ({
      family: item.family,
      variation: item.variation,
      quantity: 1
    }));
    cartActions.addEntriesToCart(entries, { source: 'restock_all' });
  };

  const estimatedGridColumns = isMobile ? 2 : 4;
  const eagerImageBudget = isMobile ? productHelpers.ABOVE_FOLD_EAGER_IMAGE_COUNT.mobile : productHelpers.ABOVE_FOLD_EAGER_IMAGE_COUNT.desktop;
  const renderers = useProductsRenderers({
    isMobile,
    activeDesktopFamilyId: productsState.activeDesktopFamilyId,
    visibleFamilyIndexById: familyGroups.visibleFamilyIndexById,
    eagerImageBudget,
    getSelectedVariation: cartActions.getSelectedVariation,
    getFamilyCardState: productHelpers.getFamilyCardState,
    cartQtyById: cartActions.cartQtyById,
    openFamilyDetails: cartActions.openFamilyDetails,
    addToCart: cartActions.addToCart,
    decreaseFromCart: cartActions.decreaseFromCart,
    handleSelectVariation: cartActions.handleSelectVariation,
    buttonStatus: productsState.buttonStatus,
    swipeAddedFamilyId: productsState.swipeAddedFamilyId,
    quickTileDidSwipeRef: productsState.quickTileDidSwipeRef,
    handleQuickTileTouchStart: cartActions.handleQuickTileTouchStart,
    handleQuickTileTouchEnd: cartActions.handleQuickTileTouchEnd,
    formatCurrency,
    LOW_STOCK_THRESHOLD: productHelpers.LOW_STOCK_THRESHOLD,
  });

  const searchHandlers = useProductsSearchHandlers({
    searchInputValue: productsState.searchInputValue,
    setSearchInputValue: productsState.setSearchInputValue,
    setSearchSuggestionsEnabled: productsState.setSearchSuggestionsEnabled,
    setSearchSuggestions: productsState.setSearchSuggestions,
    setShowSearchSuggestions: productsState.setShowSearchSuggestions,
    setActiveSuggestionIndex: productsState.setActiveSuggestionIndex,
    setAppliedSearchQuery: productsState.setAppliedSearchQuery,
    showSearchSuggestions: productsState.showSearchSuggestions,
    searchSuggestions: productsState.searchSuggestions,
    activeSuggestionIndex: productsState.activeSuggestionIndex,
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

  return buildProductsPageProps({
    isMobile,
    loading: productsState.loading,
    products: productsState.products,
    productsPageRef: productsState.productsPageRef,
    mobileHeaderRef: productsState.mobileHeaderRef,
    logoImage,
    storeTitle,
    localUser: userProfile.localUser,
    avatarLoadFailed: userProfile.avatarLoadFailed,
    avatarSrc: userProfile.avatarSrc,
    setAvatarLoadFailed: userProfile.setAvatarLoadFailed,
    normalizeText: productHelpers.normalizeText,
    getInitials: productHelpers.getInitials,
    searchInputValue: productsState.searchInputValue,
    handleMobileSearchChange: searchHandlers.handleMobileSearchChange,
    handleMobileSearchFocus: searchHandlers.handleMobileSearchFocus,
    handleMobileSearchKeyDown: searchHandlers.handleMobileSearchKeyDown,
    showSearchSuggestions: productsState.showSearchSuggestions,
    searchSuggestions: productsState.searchSuggestions,
    searchSuggestionsListId: productsState.searchSuggestionsListId,
    activeSuggestionIndex: productsState.activeSuggestionIndex,
    setActiveSuggestionIndex: productsState.setActiveSuggestionIndex,
    selectSearchSuggestion: searchHandlers.selectSearchSuggestion,
    clearSearchQuery: searchHandlers.clearSearchQuery,
    isLoadingSuggestions: productsState.isLoadingSuggestions,
    SEARCH_SUGGESTIONS_MAX_ITEMS: productHelpers.SEARCH_SUGGESTIONS_MAX_ITEMS,
    getSuggestionImageSrc: productHelpers.getSuggestionImageSrc,
    getProductFallbackImage,
    formatCurrency,
    selectedCategory: productsState.selectedCategory,
    handleMobileCategorySelect,
    mobileRootCategories: catalogFilters.mobileRootCategories,
    renderCategoryChipLabel: renderers.renderCategoryChipLabel,
    notice: productsState.notice,
    error: productsState.error,
    mobileSubcategories: catalogFilters.mobileSubcategories,
    selectedSubcategory: productsState.selectedSubcategory,
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
    activeMobileTab: productsState.activeMobileTab,
    setActiveMobileTab: productsState.setActiveMobileTab,
    mobileTabFamilies: recommendations.mobileTabFamilies,
    productsHasMore: productsState.productsHasMore,
    productsLoadTriggerRef: productsState.productsLoadTriggerRef,
    isLoadingMore: productsState.isLoadingMore,
    loadMoreProductsRef: productsState.loadMoreProductsRef,
    cartItemCount: cartActions.cartItemCount,
    handleMobileScrollTo,
    activeMobileFamily,
    setActiveMobileFamilyId: productsState.setActiveMobileFamilyId,
    handleSelectVariation: cartActions.handleSelectVariation,
    decreaseFromCart: cartActions.decreaseFromCart,
    cartQtyById: cartActions.cartQtyById,
    buttonStatus: productsState.buttonStatus,
    controlsRef: productsState.controlsRef,
    searchInputRef: productsState.searchInputRef,
    handleDesktopSearchChange: searchHandlers.handleDesktopSearchChange,
    handleDesktopSearchFocus: searchHandlers.handleDesktopSearchFocus,
    handleDesktopSearchKeyDown: searchHandlers.handleDesktopSearchKeyDown,
    cartPreviewTotal: cartActions.cartPreviewTotal,
    setShowMobileFilters: productsState.setShowMobileFilters,
    groupBy: productsState.groupBy,
    setGroupBy: productsState.setGroupBy,
    sortBy: productsState.sortBy,
    setSortBy: productsState.setSortBy,
    inStockOnly: productsState.inStockOnly,
    setInStockOnly: productsState.setInStockOnly,
    GROUP_BY_OPTIONS: productHelpers.GROUP_BY_OPTIONS,
    activeFilterOptions: catalogFilters.activeFilterOptions,
    setSelectedCategory: productsState.setSelectedCategory,
    visibleFamilies: familyGroups.visibleFamilies,
    groupedVisibleFamilies: familyGroups.groupedVisibleFamilies,
    renderFamilyCard: renderers.renderFamilyCard,
    estimatedGridColumns,
    VIRTUALIZE_GROUP_THRESHOLD: productHelpers.VIRTUALIZE_GROUP_THRESHOLD,
    hasMoreProducts: familyGroups.hasMoreProducts,
    filteredFamilies: familyGroups.filteredFamilies,
    commitSearchQuery: searchHandlers.commitSearchQuery,
    DEFAULT_SORT_BY: productHelpers.DEFAULT_SORT_BY,
    showMobileFilters: productsState.showMobileFilters,
    smartSectionsProps,
  });
}

