import { useMemo } from 'react';

const useProductsFilterScopes = ({
  selectedCategory,
  groupBy,
  effectiveCategories,
  activeFilterOptions,
  normalizeText,
  normalizePathValue,
  GROUP_BY_OPTIONS,
}) => {
  const categoryPathScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.category) return new Set();
    const scope = new Set();

    if (effectiveCategories.length > 0) {
      const byId = new Map(effectiveCategories.map((item) => [String(item.id), item]));
      const childIdsByParent = new Map();
      effectiveCategories.forEach((item) => {
        const parentId = item.parent_id;
        if (parentId === null || parentId === undefined || parentId === '') return;
        const parentKey = String(parentId);
        if (!childIdsByParent.has(parentKey)) childIdsByParent.set(parentKey, []);
        childIdsByParent.get(parentKey).push(String(item.id));
      });

      const seedIds = effectiveCategories
        .filter((item) => normalizeText(item.name) === selected)
        .map((item) => String(item.id));
      const queue = [...seedIds];
      const visited = new Set();
      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);
        const pathTokens = [];
        const pathSeen = new Set();
        let cursor = currentId;
        while (cursor && !pathSeen.has(cursor)) {
          pathSeen.add(cursor);
          const node = byId.get(cursor);
          if (!node?.name) break;
          pathTokens.unshift(normalizeText(node.name));
          const parent = node.parent_id;
          if (parent === null || parent === undefined || parent === '') break;
          cursor = String(parent);
        }
        if (pathTokens.length > 0) {
          for (let start = 0; start < pathTokens.length; start += 1) {
            const normalizedPath = pathTokens.slice(start).join(' ->');
            if (normalizedPath) scope.add(normalizedPath);
          }
        }
        (childIdsByParent.get(currentId) || []).forEach((childId) => {
          if (!visited.has(childId)) queue.push(childId);
        });
      }
    }

    if (scope.size === 0) scope.add(selected);

    return scope;
  }, [selectedCategory, groupBy, effectiveCategories, normalizeText, GROUP_BY_OPTIONS]);

  const categoryNameScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.category) return new Set();
    const scope = new Set([selected]);
    if (effectiveCategories.length === 0) return scope;

    const childIdsByParent = new Map();
    effectiveCategories.forEach((item) => {
      const parentId = item.parent_id;
      if (parentId === null || parentId === undefined || parentId === '') return;
      const parentKey = String(parentId);
      if (!childIdsByParent.has(parentKey)) childIdsByParent.set(parentKey, []);
      childIdsByParent.get(parentKey).push(String(item.id));
    });

    const selectedIds = effectiveCategories
      .filter((item) => normalizeText(item.name) === selected)
      .map((item) => String(item.id));

    const queue = [...selectedIds];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const node = effectiveCategories.find((item) => String(item.id) === current);
      if (node?.name) scope.add(normalizeText(node.name));
      (childIdsByParent.get(current) || []).forEach((childId) => {
        if (!visited.has(childId)) queue.push(childId);
      });
    }

    return scope;
  }, [selectedCategory, groupBy, effectiveCategories, normalizeText, GROUP_BY_OPTIONS]);

  const categoryIdScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (
      selected === 'all' ||
      groupBy !== GROUP_BY_OPTIONS.category ||
      effectiveCategories.length === 0
    )
      return new Set();

    const childIdsByParent = new Map();
    effectiveCategories.forEach((item) => {
      const parentId = item.parent_id;
      if (parentId === null || parentId === undefined || parentId === '') return;
      const parentKey = String(parentId);
      if (!childIdsByParent.has(parentKey)) childIdsByParent.set(parentKey, []);
      childIdsByParent.get(parentKey).push(Number(item.id));
    });

    const selectedIds = effectiveCategories
      .filter((item) => normalizeText(item.name) === selected)
      .map((item) => Number(item.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const scope = new Set();
    const queue = [...selectedIds];
    const visited = new Set();
    while (queue.length > 0) {
      const current = Number(queue.shift() || 0);
      if (!Number.isInteger(current) || current <= 0 || visited.has(current)) continue;
      visited.add(current);
      scope.add(current);
      (childIdsByParent.get(String(current)) || []).forEach((childId) => {
        if (!visited.has(childId)) queue.push(childId);
      });
    }
    return scope;
  }, [selectedCategory, groupBy, effectiveCategories, normalizeText, GROUP_BY_OPTIONS]);

  const brandPathScopeSet = useMemo(() => {
    const selected = normalizeText(selectedCategory);
    if (selected === 'all' || groupBy !== GROUP_BY_OPTIONS.brand) return new Set();
    const scope = new Set();
    activeFilterOptions.forEach((option) => {
      if (normalizeText(option?.name) !== selected) return;
      const basePath = normalizePathValue(option?.name || '');
      if (basePath) scope.add(basePath);
    });
    if (scope.size === 0) scope.add(selected);
    return scope;
  }, [
    selectedCategory,
    groupBy,
    activeFilterOptions,
    normalizeText,
    normalizePathValue,
    GROUP_BY_OPTIONS,
  ]);

  return {
    categoryPathScopeSet,
    categoryNameScopeSet,
    categoryIdScopeSet,
    brandPathScopeSet,
  };
};

export default useProductsFilterScopes;
