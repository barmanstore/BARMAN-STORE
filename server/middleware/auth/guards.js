const createAuthGuards = ({
  getAuthUserFromRequest,
  PHONE_CHANGE_CRON_SECRET,
  PHONE_CHANGE_CRON_ENABLED,
} = {}) => {
  const requireAuth = async (req, res, next) => {
    try {
      const user = await getAuthUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.authUser = user;
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Authentication failed' });
    }
  };

  const requireAdmin = async (req, res, next) => {
    try {
      const user = await getAuthUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      req.authUser = user;
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Admin authentication failed' });
    }
  };

  const requireCronSecret = (req, res, next) => {
    if (!PHONE_CHANGE_CRON_SECRET) {
      return res.status(503).json({ error: 'Cron secret is not configured' });
    }
    const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerSecret = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const provided = headerSecret || bearerSecret;
    if (!provided || provided !== PHONE_CHANGE_CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized cron request' });
    }
    return next();
  };

  const requireInternalCron = (req, res, next) => {
    if (!PHONE_CHANGE_CRON_ENABLED) {
      return res.status(503).json({ error: 'Phone change cron processing is disabled' });
    }
    return requireCronSecret(req, res, next);
  };

  return {
    requireAuth,
    requireAdmin,
    requireCronSecret,
    requireInternalCron,
  };
};

module.exports = { createAuthGuards };
