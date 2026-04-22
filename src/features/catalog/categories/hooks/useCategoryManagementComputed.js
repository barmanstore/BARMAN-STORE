import { useCallback, useMemo } from 'react';

const useCategoryManagementComputed = ({
  categories,
  categoryTree,
  selectedCategoryId,
  editingId,
}) => {
  const categoryMap = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => map.set(Number(category.id), category));
    return map;
  }, [categories]);

  const flattenedTree = useMemo(() => {
    const out = [];
    const walk = (nodes, depth = 0) => {
      nodes.forEach((node) => {
        out.push({ ...node, depth });
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children, depth + 1);
        }
      });
    };
    walk(categoryTree, 0);
    return out;
  }, [categoryTree]);

  const selectedCategory = useMemo(
    () => categories.find((category) => Number(category.id) === Number(selectedCategoryId)) || null,
    [categories, selectedCategoryId]
  );

  const isDescendantOf = useCallback(
    (candidateId, ancestorId) => {
      let cursor = categoryMap.get(Number(candidateId));
      const visited = new Set();
      while (cursor && cursor.parent_id && !visited.has(Number(cursor.id))) {
        if (Number(cursor.parent_id) === Number(ancestorId)) return true;
        visited.add(Number(cursor.id));
        cursor = categoryMap.get(Number(cursor.parent_id));
      }
      return false;
    },
    [categoryMap]
  );

  const parentOptions = useMemo(
    () =>
      flattenedTree.filter((node) => {
        if (!editingId) return true;
        if (Number(node.id) === Number(editingId)) return false;
        if (isDescendantOf(node.id, editingId)) return false;
        return true;
      }),
    [flattenedTree, editingId, isDescendantOf]
  );

  const productCategoryOptions = useMemo(
    () =>
      flattenedTree.map((node) => ({
        id: Number(node.id),
        label: `${'  '.repeat(Math.max(0, Number(node.depth || 0)))}${node.name}`,
        path: node.path || node.name,
      })),
    [flattenedTree]
  );

  const diagram = useMemo(() => {
    const levels = [];
    const edges = [];
    const visit = (node, depth = 0, parent = null) => {
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(node);
      if (parent) edges.push({ from: parent.id, to: node.id });
      (node.children || []).forEach((child) => visit(child, depth + 1, node));
    };
    categoryTree.forEach((root) => visit(root, 0, null));

    const positions = new Map();
    const levelWidth = 230;
    const rowHeight = 110;
    levels.forEach((level, depth) => {
      level.forEach((node, index) => {
        positions.set(Number(node.id), {
          id: Number(node.id),
          x: 80 + depth * levelWidth,
          y: 40 + index * rowHeight,
          name: node.name,
          count: Number(node.product_count || 0),
          total: Number(node.total_product_count || 0),
        });
      });
    });

    const maxRows = Math.max(1, ...levels.map((level) => level.length));
    return {
      width: Math.max(480, levels.length * levelWidth + 220),
      height: Math.max(280, maxRows * rowHeight + 120),
      nodes: Array.from(positions.values()),
      edges: edges
        .map((edge) => ({
          ...edge,
          fromPos: positions.get(Number(edge.from)),
          toPos: positions.get(Number(edge.to)),
        }))
        .filter((edge) => edge.fromPos && edge.toPos),
    };
  }, [categoryTree]);

  return {
    categoryMap,
    flattenedTree,
    selectedCategory,
    isDescendantOf,
    parentOptions,
    productCategoryOptions,
    diagram,
  };
};

export default useCategoryManagementComputed;
