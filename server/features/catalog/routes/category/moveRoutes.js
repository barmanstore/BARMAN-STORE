const registerCategoryMoveRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbRunAsync,
    toNullablePositiveInt,
    getCategoryByIdAsync,
    detectParentCycle,
    isSameParent,
    findCategoryByNameAndParentAsync,
  } = deps;

  app.post('/api/categories/:id(\\d+)/move', requireAdmin, async (req, res) => {
    try {
      const categoryId = toNullablePositiveInt(req.params.id);
      if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
      const current = await getCategoryByIdAsync(categoryId);
      if (!current) return res.status(404).json({ error: 'Category not found' });

      const rawParent = req.body?.parent_id;
      let nextParentId = null;
      if (rawParent !== null && rawParent !== '') {
        nextParentId = toNullablePositiveInt(rawParent);
        if (!nextParentId)
          return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
      }
      if (nextParentId === categoryId)
        return res.status(400).json({ error: 'A category cannot be its own parent' });
      if (nextParentId) {
        const parent = await getCategoryByIdAsync(nextParentId);
        if (!parent) return res.status(404).json({ error: 'Parent category not found' });
      }
      const allRows = await dbAllAsync('SELECT id, parent_id FROM categories');
      if (detectParentCycle(allRows, categoryId, nextParentId)) {
        return res.status(400).json({ error: 'Cannot move category inside its own subtree' });
      }
      if (!isSameParent(current.parent_id, nextParentId)) {
        const duplicate = await findCategoryByNameAndParentAsync({
          name: current.name,
          parentId: nextParentId,
          excludeId: categoryId,
        });
        if (duplicate) {
          return res.status(409).json({
            error: 'A sibling category with this name already exists in the target parent',
          });
        }
      }

      await dbRunAsync('UPDATE categories SET parent_id = ? WHERE id = ?', [
        nextParentId,
        categoryId,
      ]);
      return res.json(await getCategoryByIdAsync(categoryId));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCategoryMoveRoutes };
