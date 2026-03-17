import { useMemo } from 'react';

const useProductsRecommendations = ({
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
}) => {
  const familyById = useMemo(
    () => new Map(productFamilies.map((family) => [family.id, family])),
    [productFamilies]
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
  }, [
    usageHistory,
    familyById,
    isMobile,
    getSelectedVariation,
    selectedVariationByFamily,
    getUsageWindowDays,
    RESTOCK_ALERT_THRESHOLD,
    CRITICAL_RESTOCK_THRESHOLD,
  ]);

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
  }, [quickAddFamilies, getSelectedVariation, selectedVariationByFamily, normalizeText]);

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

  return {
    familyById,
    familyByVariationId,
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
  };
};

export default useProductsRecommendations;
