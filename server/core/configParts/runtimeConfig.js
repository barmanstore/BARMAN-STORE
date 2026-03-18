const createRuntimeConfig = ({
  env,
  baseDir,
  path,
  parseBooleanEnv,
  normalizeExecutionMode,
} = {}) => {
  const PORT = env.PORT || 5000;
  const DB_EXECUTION_MODE = normalizeExecutionMode(env.DB_EXECUTION_MODE || env.DB_CLIENT || 'postgres');
  const IS_VERCEL_RUNTIME = parseBooleanEnv(env.VERCEL, false) || env.NOW_REGION;
  const UPLOADS_DIR = env.UPLOADS_DIR
    || (IS_VERCEL_RUNTIME ? path.join('/tmp', 'uploads') : path.join(baseDir, 'uploads'));
  const PROFILE_UPLOAD_DIR = path.join(UPLOADS_DIR, 'profiles');
  const POSTGRES_MIGRATIONS_DIR = env.POSTGRES_MIGRATIONS_DIR || path.join(baseDir, '..', 'supabase', 'migrations');
  const POSTGRES_RUN_MIGRATIONS_ON_STARTUP = parseBooleanEnv(
    env.POSTGRES_RUN_MIGRATIONS_ON_STARTUP,
    !IS_VERCEL_RUNTIME
  );
  const POSTGRES_RUN_BOOTSTRAP_ON_STARTUP = parseBooleanEnv(
    env.POSTGRES_RUN_BOOTSTRAP_ON_STARTUP,
    !IS_VERCEL_RUNTIME
  );
  const CANONICAL_HOST = String(env.CANONICAL_HOST || 'barmanstore.vercel.app').trim().toLowerCase();
  const LEGACY_HOSTS = new Set(
    String(env.LEGACY_HOSTS || 'barman-store.vercel.app')
      .split(',')
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return {
    PORT,
    DB_EXECUTION_MODE,
    IS_VERCEL_RUNTIME,
    UPLOADS_DIR,
    PROFILE_UPLOAD_DIR,
    POSTGRES_MIGRATIONS_DIR,
    POSTGRES_RUN_MIGRATIONS_ON_STARTUP,
    POSTGRES_RUN_BOOTSTRAP_ON_STARTUP,
    CANONICAL_HOST,
    LEGACY_HOSTS,
  };
};

module.exports = { createRuntimeConfig };
