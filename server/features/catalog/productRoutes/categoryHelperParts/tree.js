const createCategoryTree = (deps = {}) => {
  const {
    toNullablePositiveInt,
    normalizeCategoryRow,
    getCategoryByIdAsync,
  } = deps;

  const buildCategoryTree = (rows) => {
    const byId = new Map();
    rows.forEach((row) => {
      byId.set(row.id, {
        ...row,
        children: [],
        path: String(row.name || '').trim(),
        total_product_count: Number(row.product_count || 0),
      });
    });

    const roots = [];
    byId.forEach((node) => {
      if (node.parent_id && byId.has(node.parent_id) && node.parent_id !== node.id) {
        byId.get(node.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const walk = (node, parentPath = '') => {
      const currentPath = parentPath ? `${parentPath} -> ${node.name}` : String(node.name || '').trim();
      node.path = currentPath;
      node.children.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
      let subtotal = Number(node.product_count || 0);
      node.children.forEach((child) => {
        subtotal += walk(child, currentPath);
      });
      node.total_product_count = subtotal;
      return subtotal;
    };

    roots.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    roots.forEach((node) => walk(node, ''));
    return roots;
  };

  const getCategoryAncestryAsync = async (categoryId) => {
    let currentId = toNullablePositiveInt(categoryId);
    const seen = new Set();
    const chain = [];
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const node = await getCategoryByIdAsync(currentId);
      if (!node) break;
      chain.unshift(node);
      currentId = node.parent_id;
    }
    return chain;
  };

  const detectParentCycle = (rows, sourceId, nextParentId) => {
    if (!nextParentId) return false;
    const rowMap = new Map(rows.map((row) => [Number(row.id), row]));
    const visited = new Set();
    let cursor = Number(nextParentId);
    while (cursor && !visited.has(cursor)) {
      if (cursor === Number(sourceId)) return true;
      visited.add(cursor);
      const row = rowMap.get(cursor);
      cursor = row?.parent_id == null ? 0 : Number(row.parent_id);
    }
    return false;
  };

  return {
    buildCategoryTree,
    getCategoryAncestryAsync,
    detectParentCycle,
  };
};

module.exports = { createCategoryTree };
