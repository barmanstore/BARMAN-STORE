const registerUserAdminListRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    sanitizeUser,
  } = deps;

  app.get('/api/users', requireAdmin, async (_, res) => {
    try {
      const users = (await dbAllAsync('SELECT * FROM users ORDER BY created_at DESC')).map(sanitizeUser);
      return res.json(users);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerUserAdminListRoutes };
