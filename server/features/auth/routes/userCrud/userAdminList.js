const { isTransientDatabaseError } = require('../../../../core/dbErrors');

const registerUserAdminListRoutes = (deps) => {
  const { app, requireCapability, dbAllAsync, dbGetAsync, sanitizeUser } = deps;

  app.get(
    '/api/users',
    requireCapability('manage_users', 'User management access required'),
    async (req, res) => {
      try {
        const query = String(req.query?.q || '').trim();
        const wantsPaginated = ['1', 'true', 'yes'].includes(
          String(req.query?.paginated || '')
            .trim()
            .toLowerCase()
        );
        const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 50));
        const offset = (page - 1) * limit;
        const searchClause = query
          ? `WHERE CAST(id AS TEXT) LIKE ? OR name LIKE ? OR email LIKE ? OR phone LIKE ? OR role LIKE ?`
          : '';
        const searchParams = query ? Array.from({ length: 5 }, () => `%${query}%`) : [];

        if (!wantsPaginated) {
          const users = (
            await dbAllAsync(
              `SELECT * FROM users ${searchClause} ORDER BY created_at DESC`,
              searchParams
            )
          ).map(sanitizeUser);
          return res.json(users);
        }

        const [users, totals] = await Promise.all([
          dbAllAsync(
            `SELECT * FROM users ${searchClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...searchParams, limit, offset]
          ),
          dbGetAsync(
            `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN LOWER(role) = 'admin' THEN 1 ELSE 0 END) AS admin_count,
             SUM(CASE WHEN LOWER(role) = 'customer' THEN 1 ELSE 0 END) AS customer_count
           FROM users
           ${searchClause}`,
            searchParams
          ),
        ]);

        return res.json({
          items: users.map(sanitizeUser),
          page,
          limit,
          total: Number(totals?.total || 0),
          adminCount: Number(totals?.admin_count || 0),
          customerCount: Number(totals?.customer_count || 0),
        });
      } catch (error) {
        if (isTransientDatabaseError(error)) {
          return res
            .status(503)
            .json({ error: 'User directory is temporarily unavailable. Please retry.' });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );
};

module.exports = { registerUserAdminListRoutes };
