const registerCategoryListRoutes = (deps) => {
  const {
    app,
    listCategoryRowsWithCountsAsync,
    buildCategoryTree,
    isCategoryNameUniqueViolation,
  } = deps;

  app.get('/api/categories', async (req, res) => {
    try {
      const includeAll = String(req.query?.scope || '').trim().toLowerCase() === 'all';
      let rows = await listCategoryRowsWithCountsAsync();
      if (!includeAll) {
        rows = rows.filter((row) => row.parent_id == null);
      }
      return res.json(rows);
    } catch (error) {
      if (isCategoryNameUniqueViolation(error)) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/categories/tree', async (_, res) => {
    try {
      const rows = await listCategoryRowsWithCountsAsync();
      return res.json(buildCategoryTree(rows));
    } catch (error) {
      if (isCategoryNameUniqueViolation(error)) {
        return res.status(409).json({ error: 'A sibling category with this name already exists in the target parent' });
      }
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCategoryListRoutes };
