import { useEffect, useMemo } from 'react';

const useProductsFamilyGroups = ({
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
}) => {
  const filteredFamilies = useMemo(() => {
    const query = normalizeText(deferredAppliedSearchQuery);
    const selected = normalizeText(selectedCategory);
    const brandPathScopes = Array.from(brandPathScopeSet);
    const categoryPathScopes = Array.from(categoryPathScopeSet);
    const queryTokens = tokenizeSearchText(query);
    const queryTokenGroups = queryTokens.map((token) => {
      const directVariants = Array.isArray(PRODUCTS_SYNONYMS[token]) ? PRODUCTS_SYNONYMS[token] : [];
      const reverseVariants = Array.isArray(PRODUCTS_SYNONYM_REVERSE[token]) ? PRODUCTS_SYNONYM_REVERSE[token] : [];
      return Array.from(new Set([token, ...directVariants, ...reverseVariants].map((value) => normalizeText(value)).filter(Boolean)));
    });

    const getQueryMatchScore = (family) => {
      if (!query) return 0;
      const haystack = String(family.searchHaystack || '');
      const name = normalizeText(family.name);
      let score = 0;
      if (haystack.includes(query)) score += 24;
      if (name.startsWith(query)) score += 16;
      else if (name.includes(query)) score += 10;
      const tokens = Array.isArray(family.searchTokens) ? family.searchTokens : [];
      queryTokenGroups.forEach((group) => {
        const matched = group.some((candidate) => tokens.some((token) => tokenFuzzyMatch(candidate, token)));
        if (matched) score += 9;
      });
      return score;
    };

    let list = productFamilies.filter((family) => {
      const inStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
      if (selected !== 'all') {
        if (groupBy === GROUP_BY_OPTIONS.brand) {
          const familyBrandPath = normalizePathValue(family.brandPath || family.brandRoot || family.brand);
          const familyBrandRoot = normalizeText(family.brandRoot || splitHierarchyValue(family.brandPath || '').parent || family.brand);
          const matchesBrandPath = brandPathScopes.some((scopePath) => (
            familyBrandPath === scopePath || familyBrandPath.startsWith(`${scopePath} ->`)
          ));
          const matchesBrandRoot = familyBrandRoot === selected;
          if (!matchesBrandPath && !matchesBrandRoot) return false;
        } else {
          const familyCategoryIds = Array.isArray(family.categoryIds) ? family.categoryIds : [];
          const hasCategoryIds = familyCategoryIds.length > 0;
          const matchesCategoryIdTree = categoryIdScopeSet.size > 0
            && familyCategoryIds.some((id) => categoryIdScopeSet.has(Number(id)));
          if (hasCategoryIds) {
            if (!matchesCategoryIdTree) return false;
          } else if (categoryIdScopeSet.size > 0) {
            const familyCategoryPath = normalizePathValue(family.categoryPath || composeHierarchyLabel(family.category, family.subcategory));
            const matchesCategoryPath = categoryPathScopes.some((scopePath) => (
              familyCategoryPath === scopePath || familyCategoryPath.startsWith(`${scopePath} ->`)
            ));
            const familyCategoryTokens = new Set([
              ...normalizePathTokens(familyCategoryPath),
              normalizeText(family.category),
              normalizeText(family.subcategory),
            ].filter(Boolean));
            const matchesCategoryNameScope = Array.from(familyCategoryTokens).some((token) => categoryNameScopeSet.has(token));
            if (!matchesCategoryPath && !matchesCategoryNameScope) return false;
          } else {
            const familyCategoryPath = normalizePathValue(family.categoryPath || composeHierarchyLabel(family.category, family.subcategory));
            const matchesCategoryPath = categoryPathScopes.some((scopePath) => (
              familyCategoryPath === scopePath || familyCategoryPath.startsWith(`${scopePath} ->`)
            ));
            const familyCategoryRoot = normalizeText(family.category || splitHierarchyValue(family.categoryPath || '').parent);
            const familyCategoryTokens = new Set([
              ...normalizePathTokens(familyCategoryPath),
              familyCategoryRoot,
              normalizeText(family.subcategory),
            ].filter(Boolean));
            const matchesCategoryNameScope = Array.from(familyCategoryTokens).some((token) => categoryNameScopeSet.has(token));
            if (!matchesCategoryPath && !matchesCategoryNameScope) return false;
          }
        }
      }
      if (inStockOnly && !inStock) return false;
      if (!query) return true;
      if (String(family.searchHaystack || '').includes(query)) return true;
      if (queryTokenGroups.length === 0) return false;
      const tokens = Array.isArray(family.searchTokens) ? family.searchTokens : [];
      return queryTokenGroups.every((group) => (
        group.some((candidate) => tokens.some((token) => tokenFuzzyMatch(candidate, token)))
      ));
    });

    const getPopularityScore = (family) => {
      const history = usageHistory[family.id] || {};
      const addCount = Number(history.addCount || 0);
      const lastAddedAt = Date.parse(history.lastAddedAt || '');
      const daysSince = Number.isFinite(lastAddedAt)
        ? Math.max(0, (Date.now() - lastAddedAt) / 86400000)
        : 999;
      const hasDiscount = family.variations.some((variation) => Number(variation.mrp || variation.price || 0) > Number(variation.price || 0));
      const inStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
      const stockScore = inStock ? Math.min(18, Number(family.totalStock || 0) * 0.35) : -24;
      const recencyScore = Number.isFinite(lastAddedAt) ? Math.max(0, 22 - (daysSince * 2.6)) : 0;
      const discountScore = hasDiscount ? 6 : 0;
      const frequencyScore = Math.min(36, addCount * 8);
      return stockScore + recencyScore + discountScore + frequencyScore;
    };

    const sorters = {
      'price-asc': (a, b) => Number(a.minPrice || 0) - Number(b.minPrice || 0),
      'price-desc': (a, b) => Number(b.minPrice || 0) - Number(a.minPrice || 0),
      'stock-desc': (a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0),
      newest: (a, b) => Number(Math.max(...b.variations.map((variation) => Number(variation.id || 0))))
        - Number(Math.max(...a.variations.map((variation) => Number(variation.id || 0)))),
      popular: (a, b) => {
        const aScore = getPopularityScore(a);
        const bScore = getPopularityScore(b);
        if (aScore !== bScore) return bScore - aScore;
        if (query) {
          const queryScoreDiff = getQueryMatchScore(b) - getQueryMatchScore(a);
          if (queryScoreDiff !== 0) return queryScoreDiff;
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
      },
      relevance: (a, b) => {
        if (!query) return String(a.name || '').localeCompare(String(b.name || ''));
        const queryScoreDiff = getQueryMatchScore(b) - getQueryMatchScore(a);
        if (queryScoreDiff !== 0) return queryScoreDiff;
        return normalizeText(a.name).localeCompare(normalizeText(b.name));
      },
    };

    const sortFn = sorters[sortBy] || sorters.relevance;
    list = [...list].sort((a, b) => {
      const aHasImage = familyHasImage(a) ? 1 : 0;
      const bHasImage = familyHasImage(b) ? 1 : 0;
      if (aHasImage !== bHasImage) return bHasImage - aHasImage;
      return sortFn(a, b);
    });
    return list;
  }, [
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
    GROUP_BY_OPTIONS,
  ]);

  const mobileFilteredFamilies = useMemo(() => {
    if (!isMobile) return filteredFamilies;
    const selected = normalizeText(selectedSubcategory);
    if (!selected || selected === 'all') return filteredFamilies;
    return filteredFamilies.filter((family) => {
      const parsed = splitHierarchyValue(family.categoryPath || family.category);
      const child = normalizeText(parsed.child || family.subcategory);
      return child === selected;
    });
  }, [filteredFamilies, selectedSubcategory, isMobile, normalizeText, splitHierarchyValue]);

  useEffect(() => {
    setSelectedCategory('all');
  }, [groupBy, setSelectedCategory]);

  useEffect(() => {
    if (selectedCategory === 'all') return;
    const exists = activeFilterOptions.some((option) => normalizeText(option.name) === normalizeText(selectedCategory));
    if (!exists) setSelectedCategory('all');
  }, [selectedCategory, activeFilterOptions, normalizeText, setSelectedCategory]);

  useEffect(() => {
    setSelectedVariationByFamily((prev) => {
      const next = { ...prev };
      let changed = false;
      filteredFamilies.forEach((family) => {
        if (!family.variations.length) return;
        const current = next[family.id];
        const stillExists = family.variations.some((variation) => variation.id === current);
        if (!current || !stillExists) {
          const fallbackVariation = getFirstAvailableVariation(family);
          if (fallbackVariation?.id) {
            next[family.id] = fallbackVariation.id;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [filteredFamilies, getFirstAvailableVariation, setSelectedVariationByFamily]);

  const visibleFamilies = filteredFamilies;
  const hasMoreProducts = productsHasMore;

  const visibleFamilyIndexById = useMemo(() => {
    return visibleFamilies.reduce((acc, family, index) => {
      acc[family.id] = index;
      return acc;
    }, {});
  }, [visibleFamilies]);

  const groupedVisibleFamilies = useMemo(() => {
    const topGroups = [];
    const topGroupMap = new Map();

    visibleFamilies.forEach((family) => {
      const topName = groupBy === GROUP_BY_OPTIONS.brand
        ? (String(family.brandRoot || '').trim() || 'Unbranded')
        : (String(family.category || '').trim() || 'General');
      const subName = groupBy === GROUP_BY_OPTIONS.brand
        ? (String(family.subBrand || '').trim() || 'General')
        : (String(family.subcategory || '').trim() || 'General');
      const topKey = normalizeText(topName) || '__group__';
      if (!topGroupMap.has(topKey)) {
        topGroupMap.set(topKey, {
          key: topKey,
          name: topName,
          total: 0,
          subGroups: [],
          subGroupMap: new Map(),
        });
        topGroups.push(topGroupMap.get(topKey));
      }
      const topGroup = topGroupMap.get(topKey);
      topGroup.total += 1;

      const subKey = `${topKey}::${normalizeText(subName) || 'general'}`;
      if (!topGroup.subGroupMap.has(subKey)) {
        const nextSubGroup = {
          key: subKey,
          name: subName,
          total: 0,
          families: [],
        };
        topGroup.subGroupMap.set(subKey, nextSubGroup);
        topGroup.subGroups.push(nextSubGroup);
      }
      const subGroup = topGroup.subGroupMap.get(subKey);
      subGroup.total += 1;
      subGroup.families.push(family);
    });

    return topGroups.map((group) => ({
      key: group.key,
      name: group.name,
      total: group.total,
      subGroups: group.subGroups,
    }));
  }, [visibleFamilies, groupBy, normalizeText, GROUP_BY_OPTIONS]);

  return {
    filteredFamilies,
    mobileFilteredFamilies,
    visibleFamilies,
    hasMoreProducts,
    visibleFamilyIndexById,
    groupedVisibleFamilies,
  };
};

export default useProductsFamilyGroups;
