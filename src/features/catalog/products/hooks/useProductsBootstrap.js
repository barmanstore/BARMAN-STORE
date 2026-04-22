import { useCallback, useEffect } from 'react';
import { productService } from '../../../../shared/services/productService';
import { categoryService } from '../../../../shared/services/categoryService';

const useProductsBootstrap = ({
  setCategories,
  setRecentlyBought,
  setCart,
  storedCart,
  setUsageHistory,
  safeReadJson,
  safeReadSessionJson,
  safeWriteSessionJson,
  PRODUCTS_CATEGORIES_CACHE_KEY,
  PRODUCTS_CATEGORIES_CACHE_TTL_MS,
  USAGE_HISTORY_KEY,
  RECENTLY_BOUGHT_LIMIT,
  hasActiveUserSession,
}) => {
  const fetchCategories = useCallback(async () => {
    const cached = safeReadSessionJson(PRODUCTS_CATEGORIES_CACHE_KEY, null);
    const hasFreshCache =
      Number(cached?.at || 0) > 0 &&
      Date.now() - Number(cached?.at || 0) < PRODUCTS_CATEGORIES_CACHE_TTL_MS &&
      Array.isArray(cached?.items);
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
  }, [
    PRODUCTS_CATEGORIES_CACHE_KEY,
    PRODUCTS_CATEGORIES_CACHE_TTL_MS,
    safeReadSessionJson,
    safeWriteSessionJson,
    setCategories,
  ]);

  const fetchRecentlyBought = useCallback(async () => {
    try {
      const data = await productService.recentlyBought({ limit: RECENTLY_BOUGHT_LIMIT });
      setRecentlyBought(Array.isArray(data) ? data : []);
    } catch (_) {
      setRecentlyBought([]);
    }
  }, [RECENTLY_BOUGHT_LIMIT, setRecentlyBought]);

  useEffect(() => {
    let recentlyBoughtTimer = 0;
    fetchCategories();
    if (hasActiveUserSession()) {
      recentlyBoughtTimer = window.setTimeout(() => {
        fetchRecentlyBought();
      }, 450);
    }
    setCart(Array.isArray(storedCart) ? storedCart : []);
    setUsageHistory(safeReadJson(USAGE_HISTORY_KEY, {}));
    return () => {
      if (recentlyBoughtTimer) window.clearTimeout(recentlyBoughtTimer);
    };
  }, [
    fetchCategories,
    fetchRecentlyBought,
    hasActiveUserSession,
    safeReadJson,
    setCart,
    setUsageHistory,
    storedCart,
    USAGE_HISTORY_KEY,
  ]);
};

export default useProductsBootstrap;
