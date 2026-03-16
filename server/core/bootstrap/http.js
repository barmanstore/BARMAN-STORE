const { applyBaseMiddleware, createAuthRateLimiters, registerRootRoute } = require('../httpSetup');

const applyHttpBootstrap = ({
  app,
  express,
  cors,
  corsOptions,
  fs,
  UPLOADS_DIR,
  PROFILE_UPLOAD_DIR,
  IS_VERCEL_RUNTIME,
  CANONICAL_HOST,
  LEGACY_HOSTS,
  ensureRuntimeReady,
  createRateLimiter,
} = {}) => {
  applyBaseMiddleware({
    app,
    express,
    cors,
    corsOptions,
    fs,
    UPLOADS_DIR,
    PROFILE_UPLOAD_DIR,
    IS_VERCEL_RUNTIME,
    CANONICAL_HOST,
    LEGACY_HOSTS,
    ensureRuntimeReady,
  });

  const { authIpLimiter, emailVerificationLimiter } = createAuthRateLimiters({ createRateLimiter });

  registerRootRoute({ app });

  return { authIpLimiter, emailVerificationLimiter };
};

module.exports = { applyHttpBootstrap };
