import '../server/loadEnv.js';

const PRIMARY_DB_ENV_KEYS = [
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_DB_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'PG_CONNECTION_STRING',
];

export const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const getEnvEntry = (keys = []) => {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return { key, value };
  }
  return { key: '', value: '' };
};

const describeDbTarget = (dbUrl) => {
  const raw = String(dbUrl || '').trim();
  if (!raw) return 'unconfigured';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname || 'localhost';
    const port =
      parsed.port ||
      (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:' ? '5432' : '');
    const database = parsed.pathname.replace(/^\/+/, '') || 'postgres';
    return `${host}${port ? `:${port}` : ''}/${database}`;
  } catch (_) {
    return 'configured connection string';
  }
};

const normalizeDbTarget = (dbUrl) => {
  const raw = String(dbUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const protocol = String(parsed.protocol || '').toLowerCase();
    const host = String(parsed.hostname || '').toLowerCase();
    const port = String(
      parsed.port || (protocol === 'postgresql:' || protocol === 'postgres:' ? '5432' : '')
    ).toLowerCase();
    const database = String(parsed.pathname || '')
      .replace(/^\/+/, '')
      .toLowerCase();
    return `${protocol}//${host}:${port}/${database}`;
  } catch (_) {
    return raw;
  }
};

const isSameDbTarget = (left, right) => {
  const normalizedLeft = normalizeDbTarget(left);
  const normalizedRight = normalizeDbTarget(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

export const resolveSmokeDbConfig = ({
  testName = 'Smoke test',
  explicitEnvKeys = ['SMOKE_TEST_DB_URL'],
  allowPrimaryEnvKey = 'SMOKE_TEST_ALLOW_PRIMARY_DB',
} = {}) => {
  const explicit = getEnvEntry(explicitEnvKeys);
  const primary = getEnvEntry(PRIMARY_DB_ENV_KEYS);
  const allowPrimary = parseBooleanEnv(process.env[allowPrimaryEnvKey], false);

  if (explicit.value) {
    if (primary.value && isSameDbTarget(explicit.value, primary.value) && !allowPrimary) {
      return {
        dbUrl: '',
        hasDbEnv: false,
        shouldSkip: true,
        reason: `${testName} skipped because ${explicit.key} points to the same database as the primary app DB (${describeDbTarget(primary.value)}). Set ${allowPrimaryEnvKey}=1 only if you intentionally want smoke tests to write to that database.`,
      };
    }
    return {
      dbUrl: explicit.value,
      hasDbEnv: true,
      shouldSkip: false,
      sourceKey: explicit.key,
      description: describeDbTarget(explicit.value),
    };
  }

  if (primary.value && !allowPrimary) {
    return {
      dbUrl: '',
      hasDbEnv: false,
      shouldSkip: true,
      reason: `${testName} skipped because only the primary app DB is configured (${describeDbTarget(primary.value)}). Set ${explicitEnvKeys.join(' or ')} to a dedicated smoke-test database, or set ${allowPrimaryEnvKey}=1 to override deliberately.`,
    };
  }

  if (primary.value && allowPrimary) {
    return {
      dbUrl: primary.value,
      hasDbEnv: true,
      shouldSkip: false,
      sourceKey: primary.key,
      description: describeDbTarget(primary.value),
    };
  }

  return {
    dbUrl: '',
    hasDbEnv: false,
    shouldSkip: false,
    reason: `${testName} requires a dedicated smoke-test database. Set ${explicitEnvKeys.join(' or ')}.`,
  };
};

export const withResolvedSmokeDbEnv = (baseEnv = {}, dbUrl = '') => {
  const normalizedDbUrl = String(dbUrl || '').trim();
  if (!normalizedDbUrl) return { ...baseEnv };
  return {
    ...baseEnv,
    SUPABASE_DB_URL: normalizedDbUrl,
    DATABASE_URL: normalizedDbUrl,
  };
};

export const logSmokeSkipInfo = (message, followUps = []) => {
  console.info(`[INFO] ${String(message || '').trim()}`);
  for (const followUp of followUps) {
    const line = String(followUp || '').trim();
    if (line) {
      console.info(`[INFO] ${line}`);
    }
  }
};
