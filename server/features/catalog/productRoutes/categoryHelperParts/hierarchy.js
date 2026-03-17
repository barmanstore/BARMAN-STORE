const createCategoryHierarchy = (deps = {}) => {
  const {
    normalizeCategoryName,
    splitHierarchySegments,
    ensureCategoryNodeAsync,
  } = deps;

  const resolveOrCreateCategoryHierarchyAsync = async ({ category, subcategory }) => {
    const categorySegments = splitHierarchySegments(category);
    const subcategorySegments = splitHierarchySegments(subcategory);

    let fullPath = [];
    if (categorySegments.length === 0 && subcategorySegments.length === 0) {
      fullPath = ['Groceries'];
    } else if (categorySegments.length === 0) {
      fullPath = ['Groceries', ...subcategorySegments];
    } else if (subcategorySegments.length === 0) {
      fullPath = categorySegments;
    } else if (categorySegments.length === 1) {
      fullPath = [categorySegments[0], ...subcategorySegments];
    } else {
      fullPath = categorySegments;
    }

    const rootName = normalizeCategoryName(fullPath[0]) || 'Groceries';
    const rootNode = await ensureCategoryNodeAsync({
      name: rootName,
      parentId: null,
      description: 'Product category',
    });

    let leafNode = rootNode;
    const subPathNames = [];
    for (const segment of fullPath.slice(1)) {
      const childNode = await ensureCategoryNodeAsync({
        name: segment,
        parentId: leafNode?.id || null,
        description: 'Product subcategory',
      });
      if (!childNode) continue;
      subPathNames.push(String(childNode.name || '').trim());
      leafNode = childNode;
    }

    return {
      categoryName: rootName,
      subcategoryName: subPathNames.length ? subPathNames.join(' -> ') : null,
      categoryId: Number(leafNode?.id || rootNode?.id || 0) || null,
    };
  };

  return { resolveOrCreateCategoryHierarchyAsync };
};

module.exports = { createCategoryHierarchy };
