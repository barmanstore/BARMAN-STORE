import { useCallback, useRef } from 'react';

const normalizeProductKey = (productId) => String(productId || '').trim();

const usePurchaseLastPurchaseSuggestions = ({ productsApi }) => {
  const cacheRef = useRef(new Map());
  const pendingRef = useRef(new Map());

  const loadLastPurchaseSuggestion = useCallback(
    async (productId) => {
      const key = normalizeProductKey(productId);
      if (!key) return null;

      if (cacheRef.current.has(key)) {
        return cacheRef.current.get(key);
      }

      if (pendingRef.current.has(key)) {
        return pendingRef.current.get(key);
      }

      const request = productsApi
        .getLastPurchase(key)
        .then((suggestion) => {
          const normalizedSuggestion = suggestion?.found ? suggestion : null;
          cacheRef.current.set(key, normalizedSuggestion);
          pendingRef.current.delete(key);
          return normalizedSuggestion;
        })
        .catch((error) => {
          pendingRef.current.delete(key);
          throw error;
        });

      pendingRef.current.set(key, request);
      return request;
    },
    [productsApi]
  );

  return {
    loadLastPurchaseSuggestion,
  };
};

export default usePurchaseLastPurchaseSuggestions;
