const { isTransientDatabaseError } = require('../../core/dbErrors');
const { userHasCapability } = require('./capabilities');

const createAuthGuards = ({
  getAuthUserFromRequest,
  PHONE_CHANGE_CRON_SECRET,
  PHONE_CHANGE_CRON_ENABLED,
} = {}) => {
  const loadAuthUser = async (req, errorMessage = 'Authentication failed') => {
    try {
      const user = await getAuthUserFromRequest(req);
      if (!user) return { user: null, error: { status: 401, payload: { error: 'Unauthorized' } } };
      req.authUser = user;
      return { user, error: null };
    } catch (error) {
      const isTransient = isTransientDatabaseError(error);
      return {
        user: null,
        error: {
          status: isTransient ? 503 : 500,
          payload: {
            error: isTransient
              ? 'Authentication is temporarily unavailable. Please retry.'
              : error.message || errorMessage,
          },
        },
      };
    }
  };

  const requireAuth = async (req, res, next) => {
    const { error } = await loadAuthUser(req, 'Authentication failed');
    if (error) return res.status(error.status).json(error.payload);
    return next();
  };

  const requireAdmin = async (req, res, next) => {
    const { user, error } = await loadAuthUser(req, 'Admin authentication failed');
    if (error) return res.status(error.status).json(error.payload);
    if (
      String(user?.role || '')
        .trim()
        .toLowerCase() !== 'admin'
    ) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  };

  const requireCapability =
    (capability, message = 'Forbidden') =>
    async (req, res, next) => {
      const { user, error } = await loadAuthUser(req, 'Capability authentication failed');
      if (error) return res.status(error.status).json(error.payload);
      if (!userHasCapability(user, capability)) {
        return res.status(403).json({ error: message });
      }
      return next();
    };

  const requireCronSecret = (req, res, next) => {
    if (!PHONE_CHANGE_CRON_SECRET) {
      return res.status(503).json({ error: 'Cron secret is not configured' });
    }
    const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
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
    requireCapability,
    requireCronSecret,
    requireInternalCron,
  };
};

module.exports = { createAuthGuards };
