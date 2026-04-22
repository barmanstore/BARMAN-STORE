import { useDeferredValue, useRef, useState } from 'react';

const useProductsState = ({
  initialSearchQuery,
  initialGroupBy,
  initialCategory,
  searchParams,
  MOBILE_TAB_OPTIONS,
  normalizeSortBy,
}) => {
  const productsPageRef = useRef(null);
  const mobileHeaderRef = useRef(null);
  const controlsRef = useRef(null);
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
    lastEventAt: {},
  });
  const searchSuggestionsCacheRef = useRef(new Map());
  const searchSuggestionsRequestRef = useRef(0);
  const searchSuggestionsAbortRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchSuggestionsListId = 'products-search-suggestions-list';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recentlyBought, setRecentlyBought] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
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
  const [activeMobileTab, setActiveMobileTab] = useState(MOBILE_TAB_OPTIONS[0].key);
  const [selectedVariationByFamily, setSelectedVariationByFamily] = useState({});
  const [usageHistory, setUsageHistory] = useState({});
  const [swipeAddedFamilyId, setSwipeAddedFamilyId] = useState('');

  return {
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
  };
};

export default useProductsState;
