import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const DEFAULT_SUGGESTION_LIMIT = 8;
const DEFAULT_CACHE_LIMIT = 24;
const DEFAULT_POOL_LIMIT = 240;
const DEFAULT_MIN_CHARS = 2;
const DEFAULT_DEBOUNCE_MS = 90;

const normalizeSearchKey = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase();

const getProductCacheKey = (product = {}) => {
  const id = Number(product?.id || 0);
  if (id > 0) return String(id);
  return [
    normalizeSearchKey(product?.name),
    normalizeSearchKey(product?.sku),
    normalizeSearchKey(product?.barcode),
  ]
    .filter(Boolean)
    .join('|');
};

const getProductLookupKeys = (product = {}) =>
  [
    normalizeSearchKey(product?.name),
    normalizeSearchKey(product?.sku),
    normalizeSearchKey(product?.barcode),
  ].filter(Boolean);

const rankProductForQuery = (product = {}, normalizedQuery = '') => {
  const name = normalizeSearchKey(product?.name);
  const sku = normalizeSearchKey(product?.sku);
  const barcode = normalizeSearchKey(product?.barcode);
  const brand = normalizeSearchKey(product?.brand);

  let rank = Number.POSITIVE_INFINITY;
  if (sku === normalizedQuery || barcode === normalizedQuery) rank = 0;
  else if (name === normalizedQuery) rank = 1;
  else if (
    (sku && sku.startsWith(normalizedQuery)) ||
    (barcode && barcode.startsWith(normalizedQuery))
  )
    rank = 2;
  else if (name && name.startsWith(normalizedQuery)) rank = 3;
  else if (brand && brand.startsWith(normalizedQuery)) rank = 4;
  else if (
    (name && name.includes(normalizedQuery)) ||
    (brand && brand.includes(normalizedQuery)) ||
    (sku && sku.includes(normalizedQuery)) ||
    (barcode && barcode.includes(normalizedQuery))
  ) {
    rank = 5;
  }

  if (!Number.isFinite(rank)) return null;

  return {
    product,
    rank,
    nameLength: name.length || Number.MAX_SAFE_INTEGER,
  };
};

const useProductSearchCombobox = ({
  query = '',
  selectedProductId = null,
  localProducts = [],
  searchProducts = null,
  suggestionLimit = DEFAULT_SUGGESTION_LIMIT,
  cacheLimit = DEFAULT_CACHE_LIMIT,
  poolLimit = DEFAULT_POOL_LIMIT,
  minChars = DEFAULT_MIN_CHARS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
} = {}) => {
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);

  const searchTimeoutRef = useRef(null);
  const searchCacheRef = useRef(new Map());
  const searchInFlightRef = useRef(new Map());
  const searchPoolRef = useRef(new Map());
  const searchRequestIdRef = useRef(0);
  const searchAbortRef = useRef(null);

  const deferredQuery = useDeferredValue(String(query || '').trim());
  const normalizedSelectedProductId = String(selectedProductId || '').trim();

  const productLookup = useMemo(() => {
    const byKey = new Map();
    (Array.isArray(localProducts) ? localProducts : []).forEach((product) => {
      getProductLookupKeys(product).forEach((key) => {
        if (key) {
          byKey.set(key, product);
        }
      });
    });
    return { byKey };
  }, [localProducts]);

  const rememberProducts = useCallback(
    (rows = []) => {
      if (!Array.isArray(rows) || rows.length === 0) return;

      rows.forEach((product) => {
        const cacheKey = getProductCacheKey(product);
        if (!cacheKey) return;

        if (searchPoolRef.current.has(cacheKey)) {
          searchPoolRef.current.delete(cacheKey);
        }
        searchPoolRef.current.set(cacheKey, product);
      });

      while (searchPoolRef.current.size > poolLimit) {
        const oldestKey = searchPoolRef.current.keys().next().value;
        if (!oldestKey) break;
        searchPoolRef.current.delete(oldestKey);
      }
    },
    [poolLimit]
  );

  const findLocalMatches = useCallback(
    (rawQuery, limit = suggestionLimit) => {
      const normalizedQuery = normalizeSearchKey(rawQuery);
      if (!normalizedQuery) return [];

      const candidateMap = new Map();
      (Array.isArray(localProducts) ? localProducts : []).forEach((product) => {
        const cacheKey = getProductCacheKey(product);
        if (!cacheKey || candidateMap.has(cacheKey)) return;
        candidateMap.set(cacheKey, product);
      });
      searchPoolRef.current.forEach((product, cacheKey) => {
        if (!candidateMap.has(cacheKey)) {
          candidateMap.set(cacheKey, product);
        }
      });

      const rankedMatches = [];
      candidateMap.forEach((product) => {
        const ranked = rankProductForQuery(product, normalizedQuery);
        if (ranked) {
          rankedMatches.push(ranked);
        }
      });

      rankedMatches.sort(
        (left, right) =>
          left.rank - right.rank ||
          left.nameLength - right.nameLength ||
          String(left.product?.name || '').localeCompare(String(right.product?.name || ''))
      );

      return rankedMatches.slice(0, limit).map((entry) => entry.product);
    },
    [localProducts, suggestionLimit]
  );

  const resolveExactMatch = useCallback(
    (rawQuery = '', preferredList = []) => {
      const normalizedQuery = normalizeSearchKey(rawQuery);
      if (!normalizedQuery) return null;

      const preferredMatch = (Array.isArray(preferredList) ? preferredList : []).find((product) =>
        getProductLookupKeys(product).includes(normalizedQuery)
      );
      if (preferredMatch) return preferredMatch;

      return productLookup.byKey.get(normalizedQuery) || null;
    },
    [productLookup]
  );

  const applySearchResults = useCallback(
    (rows = [], options = {}) => {
      const visibleRows = Array.isArray(rows) ? rows.slice(0, suggestionLimit) : [];
      startTransition(() => {
        setSearchResults(visibleRows);
        setActiveIndex(
          Math.min(Number(options?.activeIndex || 0), Math.max(visibleRows.length - 1, 0))
        );
      });
      if (options.keepExplicitChoice !== true) {
        setHasExplicitChoice(false);
      }
      return visibleRows;
    },
    [suggestionLimit]
  );

  const cacheSearchResults = useCallback(
    (rawQuery, rows, limit = suggestionLimit) => {
      const normalizedQuery = normalizeSearchKey(rawQuery);
      const visibleRows = Array.isArray(rows) ? rows.slice(0, limit) : [];

      if (!normalizedQuery) return visibleRows;

      if (searchCacheRef.current.has(normalizedQuery)) {
        searchCacheRef.current.delete(normalizedQuery);
      }
      searchCacheRef.current.set(normalizedQuery, visibleRows);

      while (searchCacheRef.current.size > cacheLimit) {
        const oldestQuery = searchCacheRef.current.keys().next().value;
        if (!oldestQuery) break;
        searchCacheRef.current.delete(oldestQuery);
      }

      rememberProducts(visibleRows);
      return visibleRows;
    },
    [cacheLimit, rememberProducts, suggestionLimit]
  );

  const runRemoteSearch = useCallback(
    async (rawQuery, options = {}) => {
      const normalizedQuery = normalizeSearchKey(rawQuery);
      const requestedLimit = Math.max(
        1,
        Math.min(suggestionLimit, Number(options?.limit || suggestionLimit) || suggestionLimit)
      );

      if (!normalizedQuery || typeof searchProducts !== 'function') {
        return [];
      }

      if (!options.forceRefresh) {
        const cachedRows = searchCacheRef.current.get(normalizedQuery);
        if (cachedRows) {
          return cachedRows.slice(0, requestedLimit);
        }
      }

      if (!options.forceRefresh) {
        const inFlightRequest = searchInFlightRef.current.get(normalizedQuery);
        if (inFlightRequest) {
          return inFlightRequest;
        }
      }

      const fetchOptions = { ...options };
      delete fetchOptions.forceRefresh;
      delete fetchOptions.limit;

      const requestPromise = Promise.resolve(
        searchProducts(rawQuery, {
          ...fetchOptions,
          limit: requestedLimit,
        })
      )
        .then((rows) => cacheSearchResults(normalizedQuery, rows, requestedLimit))
        .finally(() => {
          if (searchInFlightRef.current.get(normalizedQuery) === requestPromise) {
            searchInFlightRef.current.delete(normalizedQuery);
          }
        });

      searchInFlightRef.current.set(normalizedQuery, requestPromise);
      return requestPromise;
    },
    [cacheSearchResults, searchProducts, suggestionLimit]
  );

  const resolveHighlightedProduct = useCallback(
    (rawQuery = query, preferredResults = searchResults) => {
      const exactMatch = resolveExactMatch(rawQuery, preferredResults);
      if (exactMatch) return exactMatch;
      return preferredResults[activeIndex] || preferredResults[0] || null;
    },
    [activeIndex, query, resolveExactMatch, searchResults]
  );

  const clearSearchState = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchAbortRef.current?.controller) {
      searchAbortRef.current.controller.abort();
      if (searchAbortRef.current?.query) {
        searchInFlightRef.current.delete(searchAbortRef.current.query);
      }
      searchAbortRef.current = null;
    }
    setSearchLoading(false);
    applySearchResults([]);
  }, [applySearchResults]);

  const searchNow = useCallback(
    async (rawQuery, options = {}) => {
      const remoteResults = await runRemoteSearch(rawQuery, options);
      if (options.syncState !== false) {
        applySearchResults(remoteResults);
      }
      return remoteResults;
    },
    [applySearchResults, runRemoteSearch]
  );

  useEffect(
    () => () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (searchAbortRef.current?.controller) {
        searchAbortRef.current.controller.abort();
      }
    },
    []
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!deferredQuery || normalizedSelectedProductId || deferredQuery.length < minChars) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchLoading(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      applySearchResults([]);
    }
  }, [deferredQuery, normalizedSelectedProductId, minChars, applySearchResults]);

  useEffect(() => {
    const activeQuery = deferredQuery;
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchAbortRef.current?.controller) {
      searchAbortRef.current.controller.abort();
      if (searchAbortRef.current?.query) {
        searchInFlightRef.current.delete(searchAbortRef.current.query);
      }
      searchAbortRef.current = null;
    }

    // Skip search if conditions aren't met (already handled by reset effect above)
    if (!activeQuery || normalizedSelectedProductId || activeQuery.length < minChars) {
      return undefined;
    }

    const localResults = findLocalMatches(activeQuery, suggestionLimit);
    if (localResults.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      applySearchResults(localResults);
    }

    const cachedResults = searchCacheRef.current.get(normalizeSearchKey(activeQuery));
    if (cachedResults) {
      setSearchLoading(false);
      applySearchResults(cachedResults);
      return undefined;
    }

    const localExactMatch = resolveExactMatch(activeQuery, localResults);
    const shouldSkipRemoteSearch = Boolean(
      typeof searchProducts !== 'function' ||
      localExactMatch ||
      localResults.length >= suggestionLimit ||
      (activeQuery.length <= minChars && localResults.length > 0)
    );
    if (shouldSkipRemoteSearch) {
      setSearchLoading(false);
      return undefined;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const searchAbortController = new AbortController();
      searchAbortRef.current = {
        controller: searchAbortController,
        query: normalizeSearchKey(activeQuery),
      };
      setSearchLoading(true);
      try {
        const visibleResults = await runRemoteSearch(activeQuery, {
          limit: suggestionLimit,
          signal: searchAbortController.signal,
        });
        if (searchRequestIdRef.current !== requestId) return;
        applySearchResults(visibleResults);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (searchRequestIdRef.current !== requestId) return;
        console.error('Error searching products:', error);
        applySearchResults([]);
      } finally {
        if (searchAbortRef.current?.controller === searchAbortController) {
          searchAbortRef.current = null;
        }
        if (searchRequestIdRef.current === requestId) {
          setSearchLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [
    applySearchResults,
    debounceMs,
    deferredQuery,
    findLocalMatches,
    minChars,
    normalizedSelectedProductId,
    resolveExactMatch,
    runRemoteSearch,
    searchProducts,
    suggestionLimit,
  ]);

  return {
    searchResults,
    searchLoading,
    activeIndex,
    setActiveIndex,
    hasExplicitChoice,
    setHasExplicitChoice,
    resolveExactMatch,
    resolveHighlightedProduct,
    searchNow,
    clearSearchState,
  };
};

export default useProductSearchCombobox;
