let pgLib = null;

const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const buildPostgresConfigFromEnv = () => {
  const poolLimitRaw = Number(process.env.PG_POOL_LIMIT || 10);
  const connectionString = String(
    process.env.SUPABASE_DB_URL
    || process.env.DATABASE_URL
    || process.env.PG_CONNECTION_STRING
    || ''
  ).trim();

  const sslEnabledFromEnv = process.env.PG_SSL ?? process.env.SUPABASE_DB_SSL;
  const sslEnabled = sslEnabledFromEnv === undefined
    ? Boolean(connectionString && /supabase\.(co|com)/i.test(connectionString))
    : parseBooleanEnv(sslEnabledFromEnv, false);
  const rejectUnauthorized = parseBooleanEnv(
    process.env.PG_SSL_REJECT_UNAUTHORIZED ?? process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED,
    false
  );

  const base = {
    max: Number.isFinite(poolLimitRaw) && poolLimitRaw > 0 ? poolLimitRaw : 10,
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000),
  };

  if (connectionString) {
    return {
      ...base,
      connectionString,
      ...(sslEnabled ? { ssl: { rejectUnauthorized } } : {}),
    };
  }

  const portRaw = Number(process.env.PGPORT || process.env.PG_PORT || 5432);
  return {
    ...base,
    host: process.env.PGHOST || process.env.PG_HOST || '127.0.0.1',
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 5432,
    user: process.env.PGUSER || process.env.PG_USER || 'postgres',
    password: process.env.PGPASSWORD || process.env.PG_PASSWORD || '',
    database: process.env.PGDATABASE || process.env.PG_DATABASE || 'postgres',
    ...(sslEnabled ? { ssl: { rejectUnauthorized } } : {}),
  };
};

const getPostgresConnectionLabel = () => {
  const cfg = buildPostgresConfigFromEnv();
  if (cfg.connectionString) {
    try {
      const parsed = new URL(cfg.connectionString);
      const user = decodeURIComponent(parsed.username || 'postgres');
      const host = parsed.hostname || 'localhost';
      const port = parsed.port || '5432';
      const db = (parsed.pathname || '/postgres').replace(/^\//, '') || 'postgres';
      return `${user}@${host}:${port}/${db}`;
    } catch (_) {
      return 'postgres@connection-string';
    }
  }
  return `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;
};

const loadPostgresLibrary = () => {
  if (pgLib) return pgLib;
  try {
    pgLib = require('pg');
  } catch (_) {
    throw new Error('pg package is not installed. Run "npm install pg" before enabling postgres/supabase mode.');
  }
  return pgLib;
};

const createPostgresPool = () => new (loadPostgresLibrary().Pool)(buildPostgresConfigFromEnv());

const pingPostgresPool = async (pool) => {
  const result = await pool.query('SELECT 1 AS ok');
  if (Number(result?.rows?.[0]?.ok || 0) !== 1) {
    throw new Error('Unexpected postgres ping response');
  }
  return true;
};

module.exports = {
  buildPostgresConfigFromEnv,
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
};
