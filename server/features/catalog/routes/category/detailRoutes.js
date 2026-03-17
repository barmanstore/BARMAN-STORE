const registerCategoryDetailRoutes = (deps) => {
  const {
    app,
    getCategoryByIdAsync,
  } = deps;

  app.get('/api/categories/:id(\\d+)', async (req, res) => {
    try {
      const category = await getCategoryByIdAsync(req.params.id);
      if (!category) return res.status(404).json({ error: 'Category not found' });
      return res.json(category);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCategoryDetailRoutes };
