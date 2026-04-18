import { useCallback, useMemo } from 'react';

export default function useProductsCartActions({
  cart,
  setCart,
  replaceCart,
  setButtonStatus,
  setNotice,
  setUsageHistory,
  setSelectedVariationByFamily,
  selectedVariationByFamily,
  quickTileTouchStartRef,
  quickTileDidSwipeRef,
  setSwipeAddedFamilyId,
  trackProductsEvent,
  safeWriteJson,
  USAGE_HISTORY_KEY,
  getFirstAvailableVariation,
  isMobile,
  setActiveMobileFamilyId,
  setActiveDesktopFamilyId,
}) {
  const getSelectedVariation = useCallback(
    (family) => {
      const selectedId = selectedVariationByFamily[family.id];
      return (
        family.variations.find((variation) => variation.id === selectedId) ||
        getFirstAvailableVariation(family)
      );
    },
    [selectedVariationByFamily, getFirstAvailableVariation]
  );

  const handleSelectVariation = useCallback(
    (familyId, variationId) => {
      setSelectedVariationByFamily((prev) => ({ ...prev, [familyId]: variationId }));
    },
    [setSelectedVariationByFamily]
  );

  const persistCart = useCallback(
    (nextCart) => {
      setCart(nextCart);
      replaceCart(nextCart);
    },
    [replaceCart, setCart]
  );

  const markVariationIdsAsAdded = useCallback(
    (variationIds = []) => {
      const uniqueIds = [
        ...new Set(variationIds.map((value) => Number(value || 0)).filter((value) => value > 0)),
      ];
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
    },
    [setButtonStatus]
  );

  const recordUsageEntries = useCallback(
    (entries = []) => {
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
            category: String(
              family?.category || variation?.category || existing.category || ''
            ).trim(),
            variationId: Number(variation.id || existing.variationId || 0),
            addCount: Number(existing.addCount || 0) + 1,
            totalQty: Number(existing.totalQty || 0) + Math.max(1, Number(quantity || 1)),
            lastAddedAt: nowIso,
          };
        });
        safeWriteJson(USAGE_HISTORY_KEY, next);
        return next;
      });
    },
    [setUsageHistory, safeWriteJson, USAGE_HISTORY_KEY]
  );

  const buildCartWithAdditions = (baseCart, entries = []) => {
    let nextCart = Array.isArray(baseCart) ? [...baseCart] : [];
    let requestCount = 0;
    const appliedEntries = [];

    entries.forEach(({ family, variation, quantity }) => {
      if (!family || !variation) return;
      const qtyToAdd = Math.max(1, Number(quantity || 1));
      const productStock = Math.max(0, Number(variation.stock || 0));
      const existingIndex = nextCart.findIndex(
        (item) => Number(item.id || 0) === Number(variation.id || 0)
      );

      if (existingIndex >= 0) {
        const existingItem = nextCart[existingIndex];
        const nextQuantity = Number(existingItem.quantity || 0) + qtyToAdd;
        const nextOutOfStock = productStock <= 0 || nextQuantity > productStock ? 1 : 0;
        nextCart[existingIndex] = {
          ...existingItem,
          quantity: nextQuantity,
          out_of_stock_request: nextOutOfStock,
        };
        if (nextOutOfStock) requestCount += 1;
      } else {
        const outOfStockRequest = productStock <= 0 || qtyToAdd > productStock ? 1 : 0;
        const rawBasePrice = variation?.raw?.price ?? variation?.basePrice ?? variation?.price ?? 0;
        const basePrice = Number(rawBasePrice);
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
            price: Number.isFinite(basePrice) ? basePrice : Number(variation.price || 0),
            stock: productStock,
            uom: variation.uom || 'pcs',
            quantity: qtyToAdd,
            out_of_stock_request: outOfStockRequest,
          },
        ];
        if (outOfStockRequest) requestCount += 1;
      }

      appliedEntries.push({ family, variation, quantity: qtyToAdd });
    });

    return { nextCart, requestCount, appliedEntries };
  };

  const addEntriesToCart = useCallback(
    (entries = [], options = {}) => {
      const validEntries = entries.filter((entry) => entry?.family && entry?.variation);
      if (!validEntries.length) return;

      const baseCart = Array.isArray(cart) ? cart : [];
      const { nextCart, requestCount, appliedEntries } = buildCartWithAdditions(
        baseCart,
        validEntries
      );
      if (!appliedEntries.length) return;
      persistCart(nextCart);
      recordUsageEntries(appliedEntries);
      markVariationIdsAsAdded(appliedEntries.map((entry) => entry.variation.id));
      trackProductsEvent(
        'products_add_to_cart',
        {
          entry_count: appliedEntries.length,
          total_qty: appliedEntries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
          request_mode_items: requestCount,
          source: String(options?.source || 'catalog'),
        },
        { throttleMs: 220, throttleKey: 'products_add_to_cart' }
      );

      if (options?.markSwipeFamilyId) {
        setSwipeAddedFamilyId(String(options.markSwipeFamilyId));
      }

      if (requestCount > 0) {
        setNotice({
          type: 'info',
          message:
            requestCount > 1
              ? `${requestCount} items are in request mode due to low stock.`
              : 'Added as a requested item. Billing team will confirm availability.',
        });
      }
    },
    [
      cart,
      persistCart,
      recordUsageEntries,
      markVariationIdsAsAdded,
      trackProductsEvent,
      setSwipeAddedFamilyId,
      setNotice,
    ]
  );

  const addToCart = useCallback(
    (family, variation, quantity = 1) => {
      addEntriesToCart([{ family, variation, quantity }], { source: 'catalog_add' });
    },
    [addEntriesToCart]
  );

  const decreaseFromCart = useCallback(
    (variation) => {
      if (!variation) return;
      const existingItem = cart.find((item) => Number(item.id || 0) === Number(variation.id || 0));
      if (!existingItem) return;

      const nextQty = Math.max(0, Number(existingItem.quantity || 0) - 1);
      const newCart =
        nextQty === 0
          ? cart.filter((item) => Number(item.id || 0) !== Number(variation.id || 0))
          : cart.map((item) =>
              Number(item.id || 0) === Number(variation.id || 0)
                ? { ...item, quantity: nextQty }
                : item
            );

      persistCart(newCart);
    },
    [cart, persistCart]
  );

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
    addEntriesToCart([{ family, variation }], {
      markSwipeFamilyId: family.id,
      source: 'quick_swipe',
    });
  };

  const addFamilyPackToCart = useCallback(
    (families = [], options = {}) => {
      const entries = families
        .map((family) => ({ family, variation: getSelectedVariation(family), quantity: 1 }))
        .filter((entry) => entry.variation);
      addEntriesToCart(entries, options);
    },
    [addEntriesToCart, getSelectedVariation]
  );

  const openFamilyDetails = useCallback(
    (familyId) => {
      trackProductsEvent(
        'products_open_detail',
        {
          family_id: String(familyId || ''),
          device: isMobile ? 'mobile' : 'desktop',
        },
        { throttleMs: 240, throttleKey: `products_open_detail_${familyId}` }
      );
      if (isMobile) {
        setActiveMobileFamilyId(familyId);
        return;
      }
      setActiveDesktopFamilyId((prev) => (prev === familyId ? null : familyId));
    },
    [isMobile, trackProductsEvent, setActiveMobileFamilyId, setActiveDesktopFamilyId]
  );

  const cartQtyById = useMemo(() => {
    return cart.reduce((acc, item) => {
      acc[item.id] = Number(item.quantity || 0);
      return acc;
    }, {});
  }, [cart]);

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cart]
  );

  const cartPreviewTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [cart]
  );

  return {
    getSelectedVariation,
    handleSelectVariation,
    addEntriesToCart,
    addFamilyPackToCart,
    addToCart,
    decreaseFromCart,
    handleQuickTileTouchStart,
    handleQuickTileTouchEnd,
    openFamilyDetails,
    cartQtyById,
    cartItemCount,
    cartPreviewTotal,
  };
}
