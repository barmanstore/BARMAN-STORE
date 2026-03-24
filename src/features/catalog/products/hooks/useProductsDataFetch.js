import { useCallback, useEffect } from 'react';
import { productService } from '../../../../shared/services/productService';

const resolveProductsPayload = (payload) => {
  if (Array.isArray(payload)) {
    return { items: payload, pagination: null };
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    pagination: payload?.pagination || null,
  };
};

const hasOfferDecorations = (items = []) => items.some((item) => {
  const offerDisplay = item?.offer_display;
  const badges = Array.isArray(item?.active_offer_labels)
    ? item.active_offer_labels
    : Array.isArray(offerDisplay?.badges)
      ? offerDisplay.badges
      : [];
  return Boolean(
    String(offerDisplay?.display_offer_label || '').trim()
    || badges.some((badge) => String(badge || '').trim())
    || offerDisplay?.has_offer
  );
});

const useProductsDataFetch = ({
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
}) => {
  const fetchProductsPage = useCallback(async ({ page, append, requestId, cacheKey = '' }) => {
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

      const payload = await productService.list(params, { signal: controller.signal });
      if (requestId !== latestProductsRequestRef.current) return;

      const { items: nextItems, pagination } = resolveProductsPayload(payload);
      const nextPage = Number(pagination?.page || page || 1);
      const nextHasMore = Boolean(pagination?.has_more);

      setProducts((prev) => {
        const merged = append ? [...prev, ...nextItems] : nextItems;
        if (!append && cacheKey && !hasOfferDecorations(merged)) {
          safeWriteSessionJson(cacheKey, {
            items: merged,
            page: nextPage,
            has_more: nextHasMore,
            at: Date.now(),
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
      setProductsHasMore(false);
    } finally {
      if (requestId !== latestProductsRequestRef.current) return;
      productsLoadingMoreRef.current = false;
      setLoading(false);
      setIsLoadingMore(false);
      if (productsAbortControllerRef.current === controller) {
        productsAbortControllerRef.current = null;
      }
    }
  }, [
    appliedSearchQuery,
    inStockOnly,
    productPageSize,
    serverCategoryFilter,
    sortBy,
    SORT_API_FALLBACK,
    latestProductsRequestRef,
    productsAbortControllerRef,
    productsLoadingMoreRef,
    safeWriteSessionJson,
    setProducts,
    setProductsPage,
    setProductsHasMore,
    setError,
    setLoading,
    setIsLoadingMore,
  ]);

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
      pageSize: productPageSize,
    });
    const cached = safeReadSessionJson(cacheKey, null);
    const cachedItems = Array.isArray(cached?.items) ? cached.items : [];
    const cacheTtlMs = hasOfferDecorations(cachedItems)
      ? Math.min(PRODUCTS_LIST_CACHE_TTL_MS, 5 * 1000)
      : PRODUCTS_LIST_CACHE_TTL_MS;
    const isCacheFresh = Number(cached?.at || 0) > 0
      && (Date.now() - Number(cached?.at || 0)) < cacheTtlMs
      && Array.isArray(cached?.items);
    if (isCacheFresh) {
      setProducts(cachedItems);
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
  }, [
    appliedSearchQuery,
    serverCategoryFilter,
    sortBy,
    inStockOnly,
    productPageSize,
    buildProductsListSessionCacheKey,
    PRODUCTS_LIST_CACHE_TTL_MS,
    safeReadSessionJson,
    setProducts,
    setProductsPage,
    setProductsHasMore,
    setError,
    setLoading,
    setIsLoadingMore,
    productsAbortControllerRef,
    productsLoadingMoreRef,
    latestProductsRequestRef,
    fetchProductsPage,
  ]);

  return { fetchProductsPage };
};

export default useProductsDataFetch;

