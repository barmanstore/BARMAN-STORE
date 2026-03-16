const applyBaseMiddleware = ({
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
} = {}) => {
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use((req, res, next) => {
    if (!IS_VERCEL_RUNTIME) return next();
    const host = String(req.headers.host || '').split(':')[0].trim().toLowerCase();
    if (!host || host === CANONICAL_HOST || !LEGACY_HOSTS.has(host)) return next();
    const proto = String(req.headers['x-forwarded-proto'] || 'https')
      .split(',')[0]
      .trim()
      .toLowerCase() || 'https';
    return res.redirect(308, `${proto}://${CANONICAL_HOST}${req.originalUrl || '/'}`);
  });
  app.use(express.json({ limit: '5mb' }));
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(PROFILE_UPLOAD_DIR)) fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/api/uploads', express.static(UPLOADS_DIR));
  app.use(async (req, res, next) => {
    try {
      await ensureRuntimeReady();
      return next();
    } catch (error) {
      return res.status(500).json({
        error: error.message || 'Database initialization failed',
      });
    }
  });
};

module.exports = { applyBaseMiddleware };
