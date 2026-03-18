const { normalizeOrigin } = require('./envUtils');

const createOriginConfig = ({
  frontendOrigin = '',
  defaultAllowedOrigins = [],
  vercelUrl = '',
} = {}) => {
  const envAllowedOrigins = String(frontendOrigin || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
  const vercelDeploymentOrigin = normalizeOrigin(
    String(vercelUrl || '').trim()
      ? `https://${String(vercelUrl || '').trim()}`
      : ''
  );

  const normalizedDefaults = (defaultAllowedOrigins || []).map((origin) => normalizeOrigin(origin)).filter(Boolean);
  const allowedOrigins = new Set([
    ...(envAllowedOrigins.length ? envAllowedOrigins : normalizedDefaults),
    ...(vercelDeploymentOrigin ? [vercelDeploymentOrigin] : []),
  ]);
  const defaultOnlineStoreUrl = envAllowedOrigins.find((origin) => origin.startsWith('https://'))
    || normalizedDefaults.find((origin) => origin.startsWith('https://'))
    || normalizedDefaults[0]
    || '';

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.has(normalized)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  };

  return {
    allowedOrigins,
    corsOptions,
    defaultOnlineStoreUrl,
  };
};

module.exports = { createOriginConfig };
