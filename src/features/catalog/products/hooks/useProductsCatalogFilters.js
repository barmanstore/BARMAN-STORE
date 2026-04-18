import { useMemo } from 'react';

const useProductsCatalogFilters = ({
  categories,
  productFamilies,
  groupBy,
  selectedCategory,
  normalizeText,
  splitHierarchyValue,
  resolveBrandLogoUrl,
  GROUP_BY_OPTIONS,
}) => {
  const effectiveCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories
        .map((category) => ({
          id: category.id || category.name,
          name: String(category.name || '').trim(),
          parent_id: category.parent_id ?? null,
          icon: String(category.icon || '').trim(),
          image: String(category.image || '').trim(),
          image_width: Number(category.image_width || 0) || null,
          image_height: Number(category.image_height || 0) || null,
        }))
        .filter((category) => category.name);
    }

    const unique = Array.from(
      new Set(
        productFamilies
          .map((family) => {
            const parsed = splitHierarchyValue(family.categoryPath || family.category);
            return String(parsed.parent || family.category || '').trim();
          })
          .filter(Boolean)
      )
    );
    return unique.map((name) => ({
      id: name,
      name,
      parent_id: null,
      icon: '',
      image: '',
      image_width: null,
      image_height: null,
    }));
  }, [categories, productFamilies, splitHierarchyValue]);

  const effectiveBrands = useMemo(() => {
    const byName = new Map();
    productFamilies.forEach((family) => {
      const parsed = splitHierarchyValue(family.brandPath || family.brandRoot || family.brand);
      const rootName = String(parsed.parent || family.brandRoot || family.brand || '').trim();
      if (!rootName) return;
      const key = normalizeText(rootName);
      if (byName.has(key)) return;
      byName.set(key, {
        id: key,
        name: rootName,
        parent_id: null,
        icon: '',
        image: resolveBrandLogoUrl(rootName),
        image_width: 34,
        image_height: 34,
      });
    });
    return [...byName.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    );
  }, [productFamilies, normalizeText, splitHierarchyValue, resolveBrandLogoUrl]);

  const activeFilterOptions = useMemo(
    () => (groupBy === GROUP_BY_OPTIONS.brand ? effectiveBrands : effectiveCategories),
    [groupBy, effectiveBrands, effectiveCategories, GROUP_BY_OPTIONS]
  );

  const mobileRootCategories = useMemo(() => {
    if (effectiveCategories.length === 0) return [];
    const roots = effectiveCategories.filter(
      (category) =>
        category.parent_id === null ||
        category.parent_id === undefined ||
        category.parent_id === '' ||
        category.parent_id === 0
    );
    const base = roots.length > 0 ? roots : effectiveCategories;
    return [...base].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [effectiveCategories]);

  const mobileSubcategories = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (!selected || selected === 'all') return [];
    const selectedNode = effectiveCategories.find(
      (category) => normalizeText(category.name) === selected
    );
    let subcategories = [];

    if (selectedNode) {
      subcategories = effectiveCategories.filter(
        (category) => String(category.parent_id) === String(selectedNode.id)
      );
    }

    if (subcategories.length === 0) {
      const fallbackSet = new Set();
      productFamilies.forEach((family) => {
        const parsed = splitHierarchyValue(family.categoryPath || family.category);
        const parent = normalizeText(parsed.parent || family.category);
        if (parent !== selected) return;
        const child = String(parsed.child || family.subcategory || '').trim();
        if (child) fallbackSet.add(child);
      });
      subcategories = Array.from(fallbackSet).map((name) => ({
        id: name,
        name,
        parent_id: selectedNode?.id ?? null,
        icon: '',
        image: '',
        image_width: null,
        image_height: null,
      }));
    }

    return subcategories
      .filter((entry) => entry?.name)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [selectedCategory, effectiveCategories, productFamilies, normalizeText, splitHierarchyValue]);

  return {
    effectiveCategories,
    effectiveBrands,
    activeFilterOptions,
    mobileRootCategories,
    mobileSubcategories,
  };
};

export default useProductsCatalogFilters;
