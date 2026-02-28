require('./loadEnv');
const express = require('express');
const cors = require('cors');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const { createOtpProvider } = require('./otpProvider');
const { createEmailVerificationProvider } = require('./emailVerificationProvider');
const { createNotificationService } = require('./notificationService');
const { createWhatsappProvider } = require('./whatsappProvider');
const { createSupabaseAuthProvider } = require('./supabaseAuthProvider');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('./db/postgresScaffold');
const { normalizeExecutionMode } = require('./db/executionAdapter');
const { createQueryAdapter } = require('./db/queryAdapter');
const {
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
} = require('./db/postgresBootstrap');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_EXECUTION_MODE = normalizeExecutionMode(process.env.DB_EXECUTION_MODE || process.env.DB_CLIENT || 'postgres');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const PROFILE_UPLOAD_DIR = path.join(UPLOADS_DIR, 'profiles');
const POSTGRES_MIGRATIONS_DIR = process.env.POSTGRES_MIGRATIONS_DIR || path.join(__dirname, '..', 'supabase', 'migrations');
let postgresPool = null;
const dbQuery = createQueryAdapter({
  mode: DB_EXECUTION_MODE,
  getPostgresPool: () => postgresPool,
});
const txStorage = new AsyncLocalStorage();
const getActiveTransaction = () => txStorage.getStore();

const dbRunAsync = (sql, params = []) => {
  const tx = getActiveTransaction();
  return tx ? tx.runAsync(sql, params) : dbQuery.runAsync(sql, params);
};
const dbGetAsync = (sql, params = []) => {
  const tx = getActiveTransaction();
  return tx ? tx.getAsync(sql, params) : dbQuery.getAsync(sql, params);
};
const dbAllAsync = (sql, params = []) => {
  const tx = getActiveTransaction();
  return tx ? tx.allAsync(sql, params) : dbQuery.allAsync(sql, params);
};
const dbTxAsync = (handler, ...args) => dbQuery.transactionAsync(
  async (tx, ...handlerArgs) => txStorage.run(tx, () => handler(...handlerArgs)),
  ...args
);
const SQL_INSERT_IGNORE_CATEGORY = `INSERT INTO categories (name, description) VALUES (?, ?) ON CONFLICT (name) DO NOTHING`;
const SQL_UPSERT_VISITOR_SESSION = `INSERT INTO visitor_sessions (session_id, user_id, started_at, last_seen_at, last_path, referrer, user_agent, ip_hash)
   VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?)
   ON CONFLICT(session_id) DO UPDATE SET
     last_seen_at = CURRENT_TIMESTAMP,
     last_path = EXCLUDED.last_path,
     user_id = COALESCE(visitor_sessions.user_id, EXCLUDED.user_id),
     referrer = COALESCE(visitor_sessions.referrer, EXCLUDED.referrer),
     user_agent = COALESCE(visitor_sessions.user_agent, EXCLUDED.user_agent),
     ip_hash = COALESCE(visitor_sessions.ip_hash, EXCLUDED.ip_hash),
     ended_at = NULL`;
const SQL_UPSERT_IMPORT_BATCH = `INSERT INTO import_batches (batch_id, kind, created_by, payload, checksum, status, expires_at)
   VALUES (?, ?, ?, ?, ?, ?, TO_TIMESTAMP(? / 1000.0))
   ON CONFLICT(batch_id) DO UPDATE SET
     kind = EXCLUDED.kind,
     created_by = EXCLUDED.created_by,
     payload = EXCLUDED.payload,
     checksum = EXCLUDED.checksum,
     status = EXCLUDED.status,
     expires_at = EXCLUDED.expires_at`;
const SQL_CAST_TO_INT = `(
    CASE
      WHEN dl.source_id IS NULL THEN NULL
      WHEN btrim(dl.source_id) ~ '^[0-9]+$' THEN CAST(btrim(dl.source_id) AS BIGINT)
      WHEN btrim(dl.source_id) ~ '^[0-9]+\\.0+$' THEN CAST(split_part(btrim(dl.source_id), '.', 1) AS BIGINT)
      ELSE NULL
    END
  )`;

const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const toTimestampMs = (value) => {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : 0;
};

let runtimeBootstrapError = null;
const startDatabaseScaffolding = async () => {
  console.log(`[DB] Execution mode: ${DB_EXECUTION_MODE}`);

  try {
    postgresPool = createPostgresPool();
    await pingPostgresPool(postgresPool);
    console.log(`[DB] Postgres/Supabase connected (${getPostgresConnectionLabel()})`);
    const migrationResult = await applyPostgresMigrations(postgresPool, POSTGRES_MIGRATIONS_DIR);
    if (migrationResult.applied.length) {
      console.log(`[DB] Postgres migrations applied (${migrationResult.applied.length}/${migrationResult.total}): ${migrationResult.applied.join(', ')}`);
    } else {
      console.log(`[DB] Postgres migrations up-to-date (${migrationResult.total} files).`);
    }
    await ensurePostgresBootstrapData({
      pool: postgresPool,
      normalizeEmail,
      isStrongPassword,
      hashPassword,
      generateSku,
    });
    console.log('[DB] Postgres schema/bootstrap completed');
    runtimeBootstrapError = null;
    return true;
  } catch (error) {
    runtimeBootstrapError = error instanceof Error
      ? error
      : new Error(String(error || 'Unknown database initialization error'));
    console.error(`[DB] Postgres/Supabase initialization failed: ${runtimeBootstrapError.message}`);
    await closePostgresScaffold();
    return false;
  }
};
const IS_VERCEL_RUNTIME = parseBooleanEnv(process.env.VERCEL, false) || process.env.NOW_REGION;
const CANONICAL_HOST = String(process.env.CANONICAL_HOST || 'barmanstore.vercel.app').trim().toLowerCase();
const LEGACY_HOSTS = new Set(
  String(process.env.LEGACY_HOSTS || 'barman-store.vercel.app')
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
);
let runtimeReadyPromise = null;
const ensureRuntimeReady = async () => {
  if (runtimeReadyPromise) return runtimeReadyPromise;
  runtimeReadyPromise = (async () => {
    const ready = await startDatabaseScaffolding();
    if (!ready) {
      if (runtimeBootstrapError?.message) {
        throw new Error(`Database initialization failed: ${runtimeBootstrapError.message}`);
      }
      throw new Error('Database initialization failed');
    }
  })();
  try {
    await runtimeReadyPromise;
  } catch (error) {
    runtimeReadyPromise = null;
    throw error;
  }
  return runtimeReadyPromise;
};

const PURCHASE_STOCK_CAP_RAW = Number(process.env.PURCHASE_STOCK_CAP || 50);
const PURCHASE_STOCK_CAP = Number.isFinite(PURCHASE_STOCK_CAP_RAW) && PURCHASE_STOCK_CAP_RAW >= 0
  ? PURCHASE_STOCK_CAP_RAW
  : 50;

const normalizeOrigin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const isDefaultHttpPort = protocol === 'http:' && parsed.port === '80';
    const isDefaultHttpsPort = protocol === 'https:' && parsed.port === '443';
    const port = (isDefaultHttpPort || isDefaultHttpsPort || !parsed.port) ? '' : `:${parsed.port}`;
    return `${protocol}//${hostname}${port}`;
  } catch (_) {
    return raw.replace(/\/+$/, '').toLowerCase();
  }
};

const envAllowedOrigins = String(process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const defaultAllowedOrigins = [
  'http://localhost',
  'http://127.0.0.1',
  'https://barman-store.vercel.app',
  'https://barmanstore.vercel.app',
];

const allowedOrigins = new Set(
  (envAllowedOrigins.length ? envAllowedOrigins : defaultAllowedOrigins).map((origin) => normalizeOrigin(origin)),
);

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
app.get('/api/media/proxy', async (req, res) => {
  try {
    const rawUrl = String(req.query?.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'url query parameter is required' });
    }

    let target;
    try {
      target = new URL(rawUrl);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid media URL' });
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).json({ error: 'Only http/https media URLs are allowed' });
    }

    const hostname = String(target.hostname || '').toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return res.status(403).json({ error: 'Blocked media host' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'BarmanStoreMediaProxy/1.0',
      },
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream media fetch failed (${upstream.status})` });
    }

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'Only image content is supported' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 6 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large for proxy (max 6MB)' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buffer);
  } catch (error) {
    if (String(error?.name || '').toLowerCase() === 'aborterror') {
      return res.status(504).json({ error: 'Media fetch timed out' });
    }
    return res.status(500).json({ error: error.message || 'Media proxy failed' });
  }
});

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

const sha256 = (password) => crypto.createHash('sha256').update(String(password || '')).digest('hex');

// bcrypt-based hasher (synchronous for simplicity)
const hashPassword = (password) => bcrypt.hashSync(String(password || ''), SALT_ROUNDS);

// verify password against stored hashes (bcrypt or legacy sha256/raw)
const verifyPassword = (plain, user) => {
  if (!user) return false;
  const storedHash = user.password_hash;
  const legacy = user.password;

  if (storedHash) {
    if (isSha256Hex(storedHash)) {
      return sha256(plain) === String(storedHash).toLowerCase();
    }
    try {
      return bcrypt.compareSync(String(plain || ''), storedHash);
    } catch (_) {
      return false;
    }
  }

  if (legacy) {
    if (isSha256Hex(legacy)) {
      return sha256(plain) === String(legacy).toLowerCase();
    }
    return String(plain || '') === String(legacy);
  }

  return false;
};

const PHONE_POLICY_MESSAGE = 'Phone number must be 10 digits (India format, optional +91 prefix).';
const parsePhoneInput = (phone, { required = false } = {}) => {
  const raw = String(phone ?? '').trim();
  if (!raw) {
    return required
      ? { value: null, error: 'Phone number is required' }
      : { value: null, error: null };
  }

  let digits = raw.replace(/\D/g, '');
  if (!digits) {
    return { value: null, error: PHONE_POLICY_MESSAGE };
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    return { value: null, error: PHONE_POLICY_MESSAGE };
  }

  return { value: digits, error: null };
};
const normalizePhone = (phone) => parsePhoneInput(phone).value;
const normalizeEmail = (email) => {
  const v = String(email || '').trim().toLowerCase();
  return v || null;
};
const PASSWORD_POLICY_MESSAGE = 'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';
const isStrongPassword = (password) => {
  const value = String(password || '');
  if (value.length < 10) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  if (!/[^A-Za-z0-9]/.test(value)) return false;
  return true;
};
const generateTemporaryPassword = (length = 14) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let candidate = '';
  while (!isStrongPassword(candidate)) {
    candidate = '';
    for (let i = 0; i < length; i += 1) {
      candidate += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return candidate;
};
const generateOtpCode = (length = 6) => {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
};
const generatePhoneVerificationCode = (length = 6) => {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
};
const generateOpaqueToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');
const hashOpaqueToken = (value) =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex');
const generateEmailVerificationToken = () => crypto.randomBytes(24).toString('hex');
const hashVerificationToken = (token) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');
const VISITOR_ONLINE_WINDOW_MINUTES = Math.max(1, Number(process.env.VISITOR_ONLINE_WINDOW_MINUTES || 2));
const generateVisitorSessionId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};
const normalizeVisitorSessionId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
};
const sanitizeTrackedPath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  return raw.slice(0, 255);
};
const sanitizeShortText = (value, max = 500) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.slice(0, max);
};
const getRequestIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  return forwarded || req.ip || req.connection?.remoteAddress || '';
};
const MAX_CLIENT_REQUEST_ID_LENGTH = 120;
const normalizeClientRequestId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > MAX_CLIENT_REQUEST_ID_LENGTH) return '';
  if (!/^[a-zA-Z0-9:_-]+$/.test(raw)) return '';
  return raw;
};
const resolveClientRequestId = (req) => {
  const fromBody = String(req.body?.client_request_id || '').trim();
  const fromHeader = String(
    req.headers['x-idempotency-key']
    || req.headers['x-client-request-id']
    || req.headers['x-request-id']
    || ''
  ).trim();
  const candidate = fromBody || fromHeader;
  if (!candidate) return { value: null, error: null };
  const normalized = normalizeClientRequestId(candidate);
  if (!normalized) {
    return {
      value: null,
      error: `client_request_id must match ^[a-zA-Z0-9:_-]+$ and be <= ${MAX_CLIENT_REQUEST_ID_LENGTH} chars`,
    };
  }
  return { value: normalized, error: null };
};
const isUniqueViolationError = (error) => String(error?.code || '').trim() === '23505';
const safeSerializeJson = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch (_) {
    return '{}';
  }
};
const logAdminAuditAsync = async (req, {
  action,
  entityType,
  entityId = null,
  requestId = null,
  details = null,
} = {}) => {
  if (!action || !entityType) return;
  const actorId = Number(req?.authUser?.id || 0) || null;
  const actorRole = String(req?.authUser?.role || '').trim() || null;
  const normalizedEntityId = entityId === null || entityId === undefined ? null : String(entityId);
  const normalizedRequestId = requestId === null || requestId === undefined ? null : String(requestId);
  const ipAddress = getRequestIp(req) || null;

  try {
    await dbRunAsync(
      `INSERT INTO admin_audit_logs
      (actor_user_id, actor_role, action, entity_type, entity_id, request_id, ip_address, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)`,
      [
        actorId,
        actorRole,
        String(action),
        String(entityType),
        normalizedEntityId,
        normalizedRequestId,
        ipAddress,
        safeSerializeJson(details),
      ]
    );
  } catch (error) {
    console.error('[AUDIT] Failed to write admin audit log:', error?.message || error);
  }
};
const hashVisitorIp = (req) => {
  const ip = String(getRequestIp(req) || '').trim();
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex');
};
const createEmailVerificationRecord = async ({ userId, email }) => {
  const token = generateEmailVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_SECONDS * 1000).toISOString();
  await dbRunAsync(
    `INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at, attempts, max_attempts, used)
     VALUES (?, ?, ?, ?, 0, ?, 0)`,
    [userId, email, tokenHash, expiresAt, EMAIL_VERIFY_MAX_ATTEMPTS]
  );
  return { token, expiresAt };
};
const createPhoneVerificationRecord = async ({ userId, phone }) => {
  const code = generatePhoneVerificationCode(6);
  const codeHash = hashOpaqueToken(code);
  const expiresAt = new Date(Date.now() + PHONE_VERIFY_TTL_SECONDS * 1000).toISOString();
  await dbRunAsync(
    `INSERT INTO phone_verification_tokens (user_id, phone, token_hash, expires_at, attempts, max_attempts, used)
     VALUES (?, ?, ?, ?, 0, ?, 0)`,
    [userId, phone, codeHash, expiresAt, PHONE_VERIFY_MAX_ATTEMPTS]
  );
  return { code, expiresAt };
};
const buildEmailVerificationLink = ({ email, token }) => {
  const base = String(process.env.EMAIL_VERIFY_BASE_URL || 'http://localhost/login').trim();
  const hasQuery = base.includes('?');
  return `${base}${hasQuery ? '&' : '?'}email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
};
const buildPhoneVerificationLink = ({ phone, code }) => {
  const hasQuery = PHONE_VERIFY_BASE_URL.includes('?');
  return `${PHONE_VERIFY_BASE_URL}${hasQuery ? '&' : '?'}phone=${encodeURIComponent(phone)}&phoneToken=${encodeURIComponent(code)}`;
};
const sendPhoneVerificationChallenge = async ({
  userId,
  phone,
  recipientName = null,
  requestedBy = null,
  exposeTemplate = false,
  deliveryModeOverride = null,
}) => {
  if (!phone) return { queued: false, reason: 'missing_phone' };
  await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0`, [userId, phone]);
  const { code, expiresAt } = await createPhoneVerificationRecord({ userId, phone });
  const link = buildPhoneVerificationLink({ phone, code });
  const preparedWhatsApp = notificationService.prepareWhatsApp({
    type: 'phone_verification',
    to: phone,
    payload: { recipientName, code, link, expiresAt },
  });
  const eventId = await createNotificationEvent({
    type: 'phone_verification',
    channel: 'whatsapp',
    recipient: phone,
    recipientUserId: userId,
    subject: 'Phone verification',
    body: preparedWhatsApp.text,
    metadata: {
      mode: deliveryModeOverride || WHATSAPP_DELIVERY_MODE,
      link,
      expires_at: expiresAt,
    },
    status: 'prepared',
    preparedBy: requestedBy,
  });
  const effectiveMode = String(deliveryModeOverride || WHATSAPP_DELIVERY_MODE).trim().toLowerCase() === 'auto'
    ? 'auto'
    : 'manual';

  if (effectiveMode === 'manual') {
    const response = {
      queued: false,
      reason: 'manual_send_required',
      mode: effectiveMode,
      event_id: eventId,
      expiresAt,
    };
    if (exposeTemplate) {
      response.whatsapp = {
        to: preparedWhatsApp.to,
        text: preparedWhatsApp.text,
        whatsapp_url: preparedWhatsApp.whatsapp_url,
        link,
        code,
      };
    }
    return response;
  }

  if (!whatsappProvider?.isReady) {
    await updateNotificationEventStatus(eventId, {
      status: 'failed',
      errorMessage: 'WhatsApp provider is not configured',
    });
    return {
      queued: false,
      reason: 'provider_not_ready',
      mode: effectiveMode,
      event_id: eventId,
      missing: whatsappProvider?.missing || [],
    };
  }

  await whatsappProvider.sendMessage({
    to: preparedWhatsApp.to,
    text: preparedWhatsApp.text,
  });
  await updateNotificationEventStatus(eventId, { status: 'sent' });
  const response = {
    queued: true,
    mode: effectiveMode,
    event_id: eventId,
    expiresAt,
  };
  if (exposeTemplate) {
    response.whatsapp = {
      to: preparedWhatsApp.to,
      text: preparedWhatsApp.text,
      whatsapp_url: preparedWhatsApp.whatsapp_url,
      link,
      code,
    };
  }
  return response;
};
const sendEmailVerificationChallenge = async ({
  userId,
  email,
  recipientName = null,
  requestedBy = null,
  exposeTemplate = false,
  deliveryModeOverride = null,
}) => {
  if (!email) return { queued: false, reason: 'missing_email' };
  await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND email = ? AND used = 0`, [userId, email]);
  const { token, expiresAt } = await createEmailVerificationRecord({ userId, email });
  const link = buildEmailVerificationLink({ email, token });
  const preparedEmail = notificationService.prepareEmail({
    type: 'email_verification',
    to: email,
    payload: { recipientName, link, token, expiresAt },
  });
  const eventId = await createNotificationEvent({
    type: 'email_verification',
    channel: 'email',
    recipient: email,
    recipientUserId: userId,
    subject: preparedEmail.subject,
    body: preparedEmail.body,
    metadata: {
      mode: deliveryModeOverride || EMAIL_DELIVERY_MODE,
      link,
      expires_at: expiresAt,
    },
    status: 'prepared',
    preparedBy: requestedBy,
  });
  const effectiveMode = String(deliveryModeOverride || EMAIL_DELIVERY_MODE).trim().toLowerCase() === 'auto'
    ? 'auto'
    : 'manual';

  if (effectiveMode === 'manual') {
    const response = {
      queued: false,
      reason: 'manual_send_required',
      mode: effectiveMode,
      event_id: eventId,
      expiresAt,
    };
    if (exposeTemplate) {
      response.email = {
        to: preparedEmail.to,
        subject: preparedEmail.subject,
        body: preparedEmail.body,
        mailto_url: preparedEmail.mailto_url,
        link,
        token,
      };
    }
    return response;
  }

  if (!emailVerificationProvider?.isReady) {
    await updateNotificationEventStatus(eventId, {
      status: 'failed',
      errorMessage: 'Email provider is not configured',
    });
    return {
      queued: false,
      reason: 'provider_not_ready',
      mode: effectiveMode,
      event_id: eventId,
      missing: emailVerificationProvider?.missing || [],
    };
  }

  await emailVerificationProvider.sendVerification({
    to: email,
    token,
    link,
    expiresAt,
    subject: preparedEmail.subject,
    body: preparedEmail.body,
  });
  await updateNotificationEventStatus(eventId, { status: 'sent' });
  const response = {
    queued: true,
    mode: effectiveMode,
    event_id: eventId,
    expiresAt,
  };
  if (exposeTemplate) {
    response.email = {
      to: preparedEmail.to,
      subject: preparedEmail.subject,
      body: preparedEmail.body,
      mailto_url: preparedEmail.mailto_url,
      link,
      token,
    };
  }
  return response;
};

const createRateLimiter = ({ windowMs, max, keyFn }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn(req);
    const current = hits.get(key);
    if (!current || now > current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    current.count += 1;
    return next();
  };
};
const authIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: (req) => `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`
});
const AUTH_FLOW_MODE = String(process.env.AUTH_FLOW_MODE || 'manual').trim().toLowerCase() === 'provider'
  ? 'provider'
  : 'manual';
const PASSWORD_RESET_MODE = String(
  process.env.PASSWORD_RESET_MODE || (AUTH_FLOW_MODE === 'provider' ? 'otp' : 'admin')
).trim().toLowerCase() === 'otp'
  ? 'otp'
  : 'admin';
const PHONE_VERIFICATION_REQUIRED = parseBooleanEnv(process.env.PHONE_VERIFICATION_REQUIRED, false);
const OTP_PROVIDER = String(process.env.OTP_PROVIDER || 'twilio').trim().toLowerCase();
const OTP_TTL_SECONDS = Math.max(60, Number(process.env.OTP_TTL_SECONDS || 300));
const OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS || 5));
const AUTH_LOGIN_OTP_EXPOSE_CODE = process.env.NODE_ENV !== 'production'
  || parseBooleanEnv(process.env.AUTH_LOGIN_OTP_EXPOSE_CODE, false);
const OTP_DELIVERY_MODE = String(
  process.env.OTP_DELIVERY_MODE || (AUTH_FLOW_MODE === 'provider' ? 'auto' : 'manual')
).trim().toLowerCase() === 'auto'
  ? 'auto'
  : 'manual';
const OTP_VERIFY_SESSION_TTL_SECONDS = Math.max(60, Number(process.env.OTP_VERIFY_SESSION_TTL_SECONDS || 900));
const CREDIT_ENTRY_DEDUP_WINDOW_MS = Math.max(0, Number(process.env.CREDIT_ENTRY_DEDUP_WINDOW_MS || 15000));
const PHONE_CHANGE_STATUS_PENDING = 'PENDING_VALIDATION';
const PHONE_CHANGE_STATUS_APPROVED = 'APPROVED';
const PHONE_CHANGE_STATUS_REJECTED = 'REJECTED';
const PHONE_CHANGE_DECISION_AUTO = 'AUTO';
const PHONE_CHANGE_DECISION_ADMIN = 'ADMIN';
const PHONE_CHANGE_AUTO_APPROVE_DELAY_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.PHONE_CHANGE_AUTO_APPROVE_DELAY_MS || 60 * 60 * 1000)
);
const PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS = Math.max(
  1,
  Math.min(14, Number(process.env.PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS || 5))
);
const PHONE_CHANGE_PROCESS_INTERVAL_MS = Math.max(
  30 * 1000,
  Number(process.env.PHONE_CHANGE_PROCESS_INTERVAL_MS || 60 * 1000)
);
const PHONE_CHANGE_AUTO_BATCH_SIZE = Math.max(
  1,
  Math.min(100, Number(process.env.PHONE_CHANGE_AUTO_BATCH_SIZE || 25))
);
const BUSINESS_NAME = String(process.env.BUSINESS_NAME || 'BARMAN STORE').trim() || 'BARMAN STORE';
const PASSWORD_RESET_LOGIN_URL = String(
  process.env.PASSWORD_RESET_LOGIN_URL || 'https://barmanstore.vercel.app/login'
).trim();
const SUPABASE_AUTH_ENABLED_RAW = String(process.env.SUPABASE_AUTH_ENABLED ?? '').trim();
const SUPABASE_AUTH_ENABLED = SUPABASE_AUTH_ENABLED_RAW
  ? parseBooleanEnv(SUPABASE_AUTH_ENABLED_RAW, false)
  : Boolean(String(process.env.SUPABASE_URL || '').trim() || String(process.env.SUPABASE_DB_URL || '').trim());
const SUPABASE_AUTH_MODE = String(process.env.SUPABASE_AUTH_MODE || 'hybrid').trim().toLowerCase() === 'strict'
  ? 'strict'
  : 'hybrid';
const SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK = parseBooleanEnv(
  process.env.SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
  process.env.NODE_ENV !== 'production'
);
const SUPABASE_PASSWORD_RESET_REDIRECT = String(
  process.env.SUPABASE_PASSWORD_RESET_REDIRECT || PASSWORD_RESET_LOGIN_URL
).trim();
const SUPABASE_EMAIL_VERIFY_REDIRECT = String(
  process.env.SUPABASE_EMAIL_VERIFY_REDIRECT
  || process.env.EMAIL_VERIFY_BASE_URL
  || PASSWORD_RESET_LOGIN_URL
).trim();
const PHONE_VERIFY_BASE_URL = String(
  process.env.PHONE_VERIFY_BASE_URL || 'https://barmanstore.vercel.app/login'
).trim();
const PHONE_VERIFY_TTL_SECONDS = Math.max(60, Number(process.env.PHONE_VERIFY_TTL_SECONDS || 900));
const PHONE_VERIFY_MAX_ATTEMPTS = Math.max(1, Number(process.env.PHONE_VERIFY_MAX_ATTEMPTS || 5));
const WHATSAPP_PROVIDER = String(process.env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase();
const WHATSAPP_DELIVERY_MODE = String(
  process.env.WHATSAPP_DELIVERY_MODE || (AUTH_FLOW_MODE === 'provider' ? 'auto' : 'manual')
).trim().toLowerCase() === 'auto'
  ? 'auto'
  : 'manual';
const EMAIL_DELIVERY_MODE = String(
  process.env.EMAIL_DELIVERY_MODE || (AUTH_FLOW_MODE === 'provider' ? 'auto' : 'manual')
).trim().toLowerCase() === 'auto'
  ? 'auto'
  : 'manual';
const supabaseAuthProvider = createSupabaseAuthProvider({
  enabled: SUPABASE_AUTH_ENABLED,
  mode: SUPABASE_AUTH_MODE,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  passwordResetRedirectTo: SUPABASE_PASSWORD_RESET_REDIRECT,
  emailRedirectTo: SUPABASE_EMAIL_VERIFY_REDIRECT,
  allowAccessTokenDecodeFallback: SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
});
const otpProvider = createOtpProvider({
  OTP_PROVIDER,
  OTP_API_KEY: process.env.OTP_API_KEY || '',
  OTP_API_SECRET: process.env.OTP_API_SECRET || '',
  OTP_SENDER_ID: process.env.OTP_SENDER_ID || '',
});
const EMAIL_VERIFICATION_MODE = String(process.env.EMAIL_VERIFICATION_MODE || 'stub').trim().toLowerCase();
const EMAIL_VERIFY_TTL_SECONDS = Math.max(60, Number(process.env.EMAIL_VERIFY_TTL_SECONDS || 900));
const EMAIL_VERIFY_MAX_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_VERIFY_MAX_ATTEMPTS || 5));
const emailVerificationProvider = createEmailVerificationProvider({
  EMAIL_VERIFICATION_MODE,
  EMAIL_API_KEY: process.env.EMAIL_API_KEY || '',
  EMAIL_API_SECRET: process.env.EMAIL_API_SECRET || '',
  EMAIL_FROM: process.env.EMAIL_FROM || '',
});
const whatsappProvider = createWhatsappProvider({
  WHATSAPP_PROVIDER,
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY || '',
  WHATSAPP_API_SECRET: process.env.WHATSAPP_API_SECRET || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
});
const notificationService = createNotificationService({
  businessName: BUSINESS_NAME,
  defaultCountryCode: '91',
});
const emailVerificationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyFn: (req) => {
    const email = normalizeEmail(req.body?.email);
    return `email-verify:${email || req.ip || req.connection?.remoteAddress || 'unknown'}`;
  }
});
const passwordResetIdentifierLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  keyFn: (req) => {
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    const identifier = email || phone || `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
    return `pwd-reset:${identifier}`;
  }
});

const PROFILE_IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const buildProfileImagePath = (fileName) => `/uploads/profiles/${fileName}`;

const parseDataUrlImage = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
};

const mimeToExt = (mimeType) => {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '';
};

const deleteManagedProfileImage = (profileImage) => {
  const rel = String(profileImage || '').trim();
  if (!rel.startsWith('/uploads/profiles/')) return;
  const fileName = path.basename(rel);
  const filePath = path.join(PROFILE_UPLOAD_DIR, fileName);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      // ignore file delete errors
    }
  }
};

const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'barman-store-local-secret';
const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error('AUTH_TOKEN_SECRET must be set in production');
}
const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
const signTokenPayload = (payloadEncoded) =>
  crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payloadEncoded).digest('base64url');

const generateToken = (user = {}) => {
  const now = Date.now();
  const payload = {
    uid: Number(user.id || 0),
    role: String(user.role || 'customer'),
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encoded);
  return `${encoded}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = signTokenPayload(encoded);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || !Number(payload.uid)) return null;
    const now = Date.now();
    if (payload.exp) {
      if (now > Number(payload.exp)) return null;
    } else if (payload.iat) {
      if ((now - Number(payload.iat)) > TOKEN_TTL_MS) return null;
    } else {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
};

const getBearerTokenFromRequest = (req) => {
  const header = String(req?.headers?.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
};

const isSupabaseEmailAuthUsable = () => (
  supabaseAuthProvider.shouldUseClientAuth()
  || supabaseAuthProvider.shouldUseAccessTokenDecodeFallback()
);
const isSupabaseAuthStrictMode = () => supabaseAuthProvider.isStrictMode();
const isSupabaseEmailVerified = (user = null) => Boolean(user?.email_confirmed_at || user?.confirmed_at);
const toSupabaseSessionPayload = (session = null) => {
  if (!session || typeof session !== 'object') return null;
  const accessToken = String(session.access_token || '').trim();
  if (!accessToken) return null;
  return {
    access_token: accessToken,
    refresh_token: String(session.refresh_token || '').trim() || null,
    token_type: String(session.token_type || '').trim() || 'bearer',
    expires_in: Number(session.expires_in || 0) || null,
  };
};
const getSupabaseUserMetadata = (user = null) => {
  const meta = user?.user_metadata;
  return meta && typeof meta === 'object' ? meta : {};
};

const getVerifiedPhoneFromMetadata = (metadata = {}) => {
  const candidate = metadata.phone || metadata.phone_number || null;
  const parsed = parsePhoneInput(candidate);
  return parsed.error ? null : parsed.value;
};

const syncLocalUserFromSupabaseAuth = async ({
  email,
  metadata = {},
  emailVerified = false,
  fallbackPassword = '',
}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  let user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
  const metadataName = String(metadata.full_name || metadata.name || '').trim();
  const metadataAddress = String(metadata.address || '').trim();
  const metadataPhone = getVerifiedPhoneFromMetadata(metadata);

  if (!user) {
    let phoneToInsert = metadataPhone;
    if (phoneToInsert) {
      const existingPhone = await dbGetAsync(`SELECT id FROM users WHERE phone = ? LIMIT 1`, [phoneToInsert]);
      if (existingPhone) phoneToInsert = null;
    }
    const result = await dbRunAsync(
      `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'customer',
        metadataName || normalizedEmail.split('@')[0] || 'Customer',
        normalizedEmail,
        emailVerified ? 1 : 0,
        phoneToInsert,
        0,
        metadataAddress || null,
        hashPassword(fallbackPassword || generateTemporaryPassword()),
        0,
      ]
    );
    user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
    return user || null;
  }

  const nextEmailVerified = emailVerified || Number(user.email_verified || 0) === 1 ? 1 : 0;
  let nextPhone = user.phone || null;
  if (!nextPhone && metadataPhone) {
    const conflict = await dbGetAsync(`SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1`, [metadataPhone, user.id]);
    if (!conflict) nextPhone = metadataPhone;
  }
  const nextName = String(user.name || '').trim() || metadataName || 'Customer';
  const nextAddress = user.address || metadataAddress || null;

  if (
    nextName !== String(user.name || '')
    || Number(user.email_verified || 0) !== nextEmailVerified
    || String(user.phone || '') !== String(nextPhone || '')
    || String(user.address || '') !== String(nextAddress || '')
  ) {
    await dbRunAsync(
      `UPDATE users
       SET name = ?, email_verified = ?, phone = ?, address = ?
       WHERE id = ?`,
      [nextName, nextEmailVerified, nextPhone, nextAddress, user.id]
    );
    user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [user.id]);
  }

  return user || null;
};

const syncLocalEmailVerifiedFromSupabase = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE email = ?`, [normalizedEmail]);
};

const getAuthUserFromRequest = async (req) => {
  const token = getBearerTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (payload) {
    const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [payload.uid]));
    return user || null;
  }

  if (!isSupabaseEmailAuthUsable()) return null;
  if (!supabaseAuthProvider.shouldUseClientAuth() && supabaseAuthProvider.shouldUseAccessTokenDecodeFallback()) {
    const decoded = supabaseAuthProvider.decodeAccessTokenUnsafe({ accessToken: token });
    const normalizedEmail = normalizeEmail(decoded?.email);
    if (!normalizedEmail) return null;
    const synced = await syncLocalUserFromSupabaseAuth({
      email: normalizedEmail,
      metadata: decoded?.metadata || {},
      emailVerified: true,
    });
    return sanitizeUser(synced) || null;
  }
  try {
    const supabaseUser = await supabaseAuthProvider.getUser({ accessToken: token });
    const normalizedEmail = normalizeEmail(supabaseUser?.email);
    if (!normalizedEmail) return null;
    const synced = await syncLocalUserFromSupabaseAuth({
      email: normalizedEmail,
      metadata: getSupabaseUserMetadata(supabaseUser),
      emailVerified: isSupabaseEmailVerified(supabaseUser),
    });
    return sanitizeUser(synced);
  } catch (_) {
    return null;
  }
};

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
const isSha256Hex = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));

const generateOrderNumber = () => {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${y}${m}${d}-${r}`;
};

const generatePONumber = () => `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generateReturnNumber = () => `RET-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generateBillNumber = () => `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const ORDER_STATUS_ORDERED = 'ordered';
const ORDER_STATUS_RECEIVED = 'received';
const ORDER_ALLOWED_STATUSES = new Set([ORDER_STATUS_ORDERED, ORDER_STATUS_RECEIVED]);
const normalizeOrderStatus = (status, fallback = ORDER_STATUS_ORDERED) => {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === ORDER_STATUS_ORDERED || raw === 'pending') return ORDER_STATUS_ORDERED;
  if (raw === ORDER_STATUS_RECEIVED || raw === 'confirmed' || raw === 'delivered' || raw === 'processing' || raw === 'shipped') {
    return ORDER_STATUS_RECEIVED;
  }
  return fallback;
};

const normalizeOrderPaymentStatus = (status, orderStatus) => {
  const normalizedOrderStatus = normalizeOrderStatus(orderStatus, ORDER_STATUS_ORDERED);
  if (normalizedOrderStatus === ORDER_STATUS_RECEIVED) return 'paid';
  return 'pending';
};

const normalizePaymentMethod = (method) => {
  const raw = String(method || '').trim().toLowerCase();
  if (!raw) return 'cash';
  if (raw === 'cod' || raw === 'cash') return 'cash';
  return 'cash';
};

const parseOrderAddress = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return { street: raw };
  }
};

const normalizeDistributorLedgerType = (type) => {
  const raw = String(type || '').trim().toLowerCase();
  if (raw === 'payment' || raw === 'paid') return 'payment';
  if (raw === 'credit' || raw === 'given' || raw === 'due') return 'credit';
  return 'credit';
};

const normalizeCreditType = (type) => {
  const raw = String(type || '').trim().toLowerCase();
  return raw === 'payment' ? 'payment' : 'given';
};

const getLatestCreditEntryAsync = (userId) => dbGetAsync(
  `SELECT *
   FROM credit_history
   WHERE user_id = ?
   ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC
   LIMIT 1`,
  [userId]
);

const recalculateCreditBalancesForUser = async (userId) => dbTxAsync(async () => {
  const rows = await dbAllAsync(
    `SELECT id, type, amount
     FROM credit_history
     WHERE user_id = ?
     ORDER BY COALESCE(transaction_date, created_at) ASC, id ASC`,
    [userId]
  );

  let runningBalance = 0;
  for (const row of rows) {
    const normalizedType = normalizeCreditType(row.type);
    const amount = Math.abs(Number(row.amount || 0));
    runningBalance = normalizedType === 'payment'
      ? (runningBalance - amount)
      : (runningBalance + amount);
    await dbRunAsync(`UPDATE credit_history SET balance = ? WHERE id = ?`, [runningBalance, row.id]);
  }

  return runningBalance;
});

const generateSku = (name, brand, content, mrp) => {
  const part = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const n = part(name).slice(0, 4).padEnd(4, 'X');
  const b = part(brand).slice(0, 4).padEnd(4, 'X');
  const c = part(content).slice(0, 2).padEnd(2, 'X');
  const p = String(Math.round(Number(mrp || 0))).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `${n}${b}${c}${p}`;
};

const createNotificationEvent = async ({
  type,
  channel = 'email',
  recipient,
  recipientUserId = null,
  subject = null,
  body = null,
  metadata = null,
  status = 'prepared',
  preparedBy = null,
  sentBy = null,
}) => {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const result = await dbRunAsync(
    `INSERT INTO notification_events
    (type, channel, recipient, recipient_user_id, subject, body, status, error_message, metadata, prepared_by, sent_by, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      String(type || '').trim(),
      String(channel || 'email').trim() || 'email',
      String(recipient || '').trim(),
      recipientUserId || null,
      subject ? String(subject) : null,
      body ? String(body) : null,
      String(status || 'prepared').trim() || 'prepared',
      metadataJson,
      preparedBy || null,
      sentBy || null,
      status === 'sent' ? new Date().toISOString() : null,
    ]
  );
  return Number(result.lastInsertRowid || 0);
};

const updateNotificationEventStatus = async (id, { status, errorMessage = null, sentBy = null }) => {
  const eventId = Number(id || 0);
  if (!eventId) return;
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const sentAt = normalizedStatus === 'sent' ? new Date().toISOString() : null;
  await dbRunAsync(
    `UPDATE notification_events
     SET status = ?, error_message = ?, sent_by = ?, sent_at = ?
     WHERE id = ?`,
    [normalizedStatus, errorMessage ? String(errorMessage) : null, sentBy || null, sentAt, eventId]
  );
};

const parseJsonText = (value, fallback = null) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
};

const normalizeNotificationLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'success' || normalized === 'warning' || normalized === 'error') return normalized;
  return 'info';
};

const createAppNotification = async ({
  userId,
  title,
  message,
  level = 'info',
  entityType = null,
  entityId = null,
  issueId = null,
  metadata = null,
  createdBy = null,
}) => {
  const normalizedUserId = Number(userId || 0);
  if (!normalizedUserId) return 0;
  const normalizedTitle = String(title || '').trim();
  const normalizedMessage = String(message || '').trim();
  if (!normalizedTitle || !normalizedMessage) return 0;
  const result = await dbRunAsync(
    `INSERT INTO app_notifications
    (user_id, title, message, level, entity_type, entity_id, issue_id, is_read, metadata, created_by, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
    [
      normalizedUserId,
      normalizedTitle,
      normalizedMessage,
      normalizeNotificationLevel(level),
      entityType ? String(entityType).trim() : null,
      entityId ? Number(entityId || 0) : null,
      issueId ? Number(issueId || 0) : null,
      metadata ? safeSerializeJson(metadata) : null,
      createdBy ? Number(createdBy || 0) : null,
    ]
  );
  return Number(result.lastInsertRowid || 0);
};

const notifyAdmins = async ({
  title,
  message,
  level = 'info',
  entityType = null,
  entityId = null,
  issueId = null,
  metadata = null,
  createdBy = null,
}) => {
  const admins = await dbAllAsync(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC`);
  for (const admin of admins || []) {
    const adminId = Number(admin?.id || 0);
    if (!adminId) continue;
    await createAppNotification({
      userId: adminId,
      title,
      message,
      level,
      entityType,
      entityId,
      issueId,
      metadata,
      createdBy,
    });
  }
};

const normalizeCreditIssueStatus = (value, { fallback = 'open' } = {}) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'reviewed') return 'in_review';
  if (normalized === 'resolved') return 'corrected';
  if (normalized === 'open' || normalized === 'in_review' || normalized === 'corrected' || normalized === 'rejected') {
    return normalized;
  }
  return fallback;
};

const normalizeContactVerificationRequestType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'email' || normalized === 'phone') return normalized;
  return '';
};

const getOpenContactVerificationRequest = async ({ userId, requestType }) => dbGetAsync(
  `SELECT *
   FROM contact_verification_requests
   WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'sent')
   ORDER BY id DESC
   LIMIT 1`,
  [Number(userId || 0), normalizeContactVerificationRequestType(requestType)]
);

const queueContactVerificationRequest = async ({
  userId,
  requestType,
  requestedBy = null,
  requestedFromIp = null,
}) => {
  const normalizedType = normalizeContactVerificationRequestType(requestType);
  const normalizedUserId = Number(userId || 0);
  if (!normalizedUserId || !normalizedType) return null;

  const existing = await getOpenContactVerificationRequest({
    userId: normalizedUserId,
    requestType: normalizedType,
  });
  if (existing) {
    await dbRunAsync(
      `UPDATE contact_verification_requests
       SET status = 'pending',
           requested_from_ip = ?,
           requested_by = ?,
           admin_note = NULL,
           prepared_event_id = NULL,
           processed_by = NULL,
           processed_at = NULL,
           completed_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        requestedFromIp ? String(requestedFromIp) : null,
        Number(requestedBy || 0) || null,
        existing.id,
      ]
    );
    return (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [existing.id])) || null;
  }

  const result = await dbRunAsync(
    `INSERT INTO contact_verification_requests
     (user_id, request_type, status, requested_from_ip, requested_by, admin_note, prepared_event_id, processed_by, processed_at, completed_at)
     VALUES (?, ?, 'pending', ?, ?, NULL, NULL, NULL, NULL, NULL)`,
    [
      normalizedUserId,
      normalizedType,
      requestedFromIp ? String(requestedFromIp) : null,
      Number(requestedBy || 0) || null,
    ]
  );
  const id = Number(result.lastInsertRowid || 0);
  return id ? (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [id])) || null : null;
};

const markContactVerificationRequestSent = async ({
  id,
  preparedEventId,
  processedBy = null,
  adminNote = null,
}) => {
  const requestId = Number(id || 0);
  if (!requestId) return null;
  await dbRunAsync(
    `UPDATE contact_verification_requests
     SET status = 'sent',
         prepared_event_id = ?,
         processed_by = ?,
         processed_at = ?,
         admin_note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      Number(preparedEventId || 0) || null,
      Number(processedBy || 0) || null,
      new Date().toISOString(),
      adminNote ? String(adminNote) : null,
      requestId,
    ]
  );
  return (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId])) || null;
};

const rejectContactVerificationRequest = async ({
  id,
  processedBy = null,
  adminNote = null,
}) => {
  const requestId = Number(id || 0);
  if (!requestId) return null;
  await dbRunAsync(
    `UPDATE contact_verification_requests
     SET status = 'rejected',
         processed_by = ?,
         processed_at = ?,
         admin_note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      Number(processedBy || 0) || null,
      new Date().toISOString(),
      adminNote ? String(adminNote) : null,
      requestId,
    ]
  );
  return (await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId])) || null;
};

const completeContactVerificationRequests = async ({ userId, requestType }) => {
  const normalizedType = normalizeContactVerificationRequestType(requestType);
  const normalizedUserId = Number(userId || 0);
  if (!normalizedUserId || !normalizedType) return;
  await dbRunAsync(
    `UPDATE contact_verification_requests
     SET status = 'completed',
         completed_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'sent')`,
    [new Date().toISOString(), normalizedUserId, normalizedType]
  );
};

const normalizePhoneChangeRequestStatus = (value, fallback = PHONE_CHANGE_STATUS_PENDING) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === PHONE_CHANGE_STATUS_PENDING
    || normalized === PHONE_CHANGE_STATUS_APPROVED
    || normalized === PHONE_CHANGE_STATUS_REJECTED
  ) return normalized;
  return fallback;
};

const serializePhoneChangeRequest = (row) => {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    user_id: Number(row.user_id || 0),
    old_phone: row.old_phone || null,
    new_phone: row.new_phone || null,
    status: normalizePhoneChangeRequestStatus(row.status),
    needs_admin_review: Number(row.needs_admin_review || 0) === 1,
    conflict_user_id: Number(row.conflict_user_id || 0) || null,
    requested_by: Number(row.requested_by || 0) || null,
    requested_from_ip: row.requested_from_ip || null,
    auto_check_at: row.auto_check_at || null,
    final_due_at: row.final_due_at || null,
    admin_notified_at: row.admin_notified_at || null,
    decision_source: row.decision_source || null,
    admin_note: row.admin_note || null,
    rejection_reason: row.rejection_reason || null,
    reviewed_by: Number(row.reviewed_by || 0) || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
};

const getOpenPhoneChangeRequestForUser = async (userId) => dbGetAsync(
  `SELECT *
   FROM phone_change_requests
   WHERE user_id = ? AND status = ?
   ORDER BY id DESC
   LIMIT 1`,
  [Number(userId || 0), PHONE_CHANGE_STATUS_PENDING]
);

const getLatestPhoneChangeRequestForUser = async (userId) => dbGetAsync(
  `SELECT *
   FROM phone_change_requests
   WHERE user_id = ?
   ORDER BY id DESC
   LIMIT 1`,
  [Number(userId || 0)]
);

const queuePhoneChangeRequest = async ({
  userId,
  oldPhone = null,
  newPhone,
  requestedBy = null,
  requestedFromIp = null,
}) => {
  const normalizedUserId = Number(userId || 0);
  const parsedOldPhone = parsePhoneInput(oldPhone);
  const parsedNewPhone = parsePhoneInput(newPhone, { required: true });
  if (!normalizedUserId || parsedNewPhone.error) return null;

  const oldPhoneValue = parsedOldPhone.value || null;
  const newPhoneValue = parsedNewPhone.value;
  const now = Date.now();
  const autoCheckAt = new Date(now + PHONE_CHANGE_AUTO_APPROVE_DELAY_MS).toISOString();
  const finalDueAt = new Date(
    now + (PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  ).toISOString();
  const existing = await getOpenPhoneChangeRequestForUser(normalizedUserId);
  if (existing) {
    await dbRunAsync(
      `UPDATE phone_change_requests
       SET old_phone = ?,
           new_phone = ?,
           status = ?,
           requested_by = ?,
           requested_from_ip = ?,
           needs_admin_review = 0,
           conflict_user_id = NULL,
           auto_check_at = ?,
           final_due_at = ?,
           admin_notified_at = NULL,
           decision_source = NULL,
           admin_note = NULL,
           rejection_reason = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        oldPhoneValue,
        newPhoneValue,
        PHONE_CHANGE_STATUS_PENDING,
        Number(requestedBy || 0) || null,
        requestedFromIp ? String(requestedFromIp) : null,
        autoCheckAt,
        finalDueAt,
        existing.id,
      ]
    );
    return (await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [existing.id])) || null;
  }

  const inserted = await dbRunAsync(
    `INSERT INTO phone_change_requests
     (user_id, old_phone, new_phone, status, requested_by, requested_from_ip, needs_admin_review, conflict_user_id, auto_check_at, final_due_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      normalizedUserId,
      oldPhoneValue,
      newPhoneValue,
      PHONE_CHANGE_STATUS_PENDING,
      Number(requestedBy || 0) || null,
      requestedFromIp ? String(requestedFromIp) : null,
      autoCheckAt,
      finalDueAt,
    ]
  );
  const insertedId = Number(inserted.lastInsertRowid || 0);
  return insertedId
    ? (await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [insertedId])) || null
    : null;
};

const movePhoneLinkedIdentityRecords = async ({ fromUserId, toUserId }) => {
  const sourceId = Number(fromUserId || 0);
  const targetId = Number(toUserId || 0);
  if (!sourceId || !targetId || sourceId === targetId) return;
  await dbRunAsync(`UPDATE credit_history SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
  await dbRunAsync(`UPDATE credit_entry_issues SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
  await dbRunAsync(`UPDATE bills SET customer_id = ? WHERE customer_id = ?`, [targetId, sourceId]);
  await dbRunAsync(`UPDATE orders SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
  await dbRunAsync(`UPDATE product_recommendations SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
};

const approvePhoneChangeRequest = async ({
  id,
  reviewedBy = null,
  decisionSource = PHONE_CHANGE_DECISION_ADMIN,
  adminNote = null,
}) => {
  const requestId = Number(id || 0);
  if (!requestId) return null;
  const reviewedById = Number(reviewedBy || 0) || null;
  const source = String(decisionSource || '').trim().toUpperCase() === PHONE_CHANGE_DECISION_AUTO
    ? PHONE_CHANGE_DECISION_AUTO
    : PHONE_CHANGE_DECISION_ADMIN;

  return dbTxAsync(async () => {
    const requestRow = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
    if (!requestRow) return null;
    if (normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING) {
      const err = new Error(`Cannot approve request in status "${requestRow.status}"`);
      err.status = 400;
      throw err;
    }

    const owner = await dbGetAsync(`SELECT id, phone FROM users WHERE id = ?`, [requestRow.user_id]);
    if (!owner) {
      const err = new Error('User not found for this phone change request');
      err.status = 404;
      throw err;
    }

    const newPhoneParsed = parsePhoneInput(requestRow.new_phone, { required: true });
    if (newPhoneParsed.error) {
      const err = new Error(newPhoneParsed.error);
      err.status = 400;
      throw err;
    }
    const newPhone = newPhoneParsed.value;
    const currentOwnerPhone = normalizePhone(owner.phone);
    const conflictUser = await dbGetAsync(
      `SELECT id
       FROM users
       WHERE phone = ? AND id <> ?
       LIMIT 1`,
      [newPhone, owner.id]
    );

    if (source === PHONE_CHANGE_DECISION_AUTO && conflictUser) {
      const err = new Error('Conflict detected, requires admin review');
      err.status = 409;
      throw err;
    }

    const conflictUserId = Number(conflictUser?.id || 0) || null;
    if (conflictUserId) {
      await movePhoneLinkedIdentityRecords({ fromUserId: conflictUserId, toUserId: owner.id });
      await dbRunAsync(
        `UPDATE users
         SET phone = NULL,
             phone_verified = 0
         WHERE id = ?`,
        [conflictUserId]
      );
    }

    if (currentOwnerPhone !== newPhone) {
      await dbRunAsync(
        `UPDATE users
         SET phone = ?, phone_verified = 0
         WHERE id = ?`,
        [newPhone, owner.id]
      );
    }

    await dbRunAsync(
      `UPDATE phone_change_requests
       SET status = ?,
           needs_admin_review = 0,
           conflict_user_id = ?,
           decision_source = ?,
           admin_note = ?,
           rejection_reason = NULL,
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        PHONE_CHANGE_STATUS_APPROVED,
        conflictUserId,
        source,
        adminNote ? String(adminNote).trim() : null,
        reviewedById,
        requestId,
      ]
    );

    const updatedRequest = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
    const updatedUser = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [owner.id]);
    return {
      request: updatedRequest,
      user: updatedUser,
      conflict_user_id: conflictUserId,
    };
  });
};

const rejectPhoneChangeRequest = async ({
  id,
  reviewedBy = null,
  adminNote = null,
  rejectionReason = null,
}) => {
  const requestId = Number(id || 0);
  if (!requestId) return null;
  await dbRunAsync(
    `UPDATE phone_change_requests
     SET status = ?,
         admin_note = ?,
         rejection_reason = ?,
         reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ?`,
    [
      PHONE_CHANGE_STATUS_REJECTED,
      adminNote ? String(adminNote).trim() : null,
      rejectionReason ? String(rejectionReason).trim() : null,
      Number(reviewedBy || 0) || null,
      requestId,
      PHONE_CHANGE_STATUS_PENDING,
    ]
  );
  const updated = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
  if (!updated) return null;
  if (normalizePhoneChangeRequestStatus(updated.status, '') !== PHONE_CHANGE_STATUS_REJECTED) return null;
  return updated;
};

const movePhoneChangeRequestToAdminReview = async ({ requestId, conflictUserId = null }) => {
  const id = Number(requestId || 0);
  if (!id) return null;
  const current = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [id]);
  if (!current) return null;
  if (normalizePhoneChangeRequestStatus(current.status, '') !== PHONE_CHANGE_STATUS_PENDING) return current;

  const shouldStampAdminNotification = !current.admin_notified_at;
  await dbRunAsync(
    `UPDATE phone_change_requests
     SET needs_admin_review = 1,
         conflict_user_id = ?,
         admin_notified_at = CASE WHEN admin_notified_at IS NULL THEN CURRENT_TIMESTAMP ELSE admin_notified_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(conflictUserId || 0) || null, id]
  );
  const updated = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [id]);
  return {
    row: updated,
    notifyAdmins: shouldStampAdminNotification,
  };
};

const notifyPhoneChangeSubmitted = async ({ userId, newPhone }) => {
  await createAppNotification({
    userId,
    title: 'Phone update request received',
    message: `Phone update to ${newPhone} is pending validation. It may auto-complete within 1 hour.`,
    level: 'info',
    entityType: 'phone_change_request',
    metadata: {
      route: '/profile',
      status: PHONE_CHANGE_STATUS_PENDING,
    },
    createdBy: Number(userId || 0) || null,
  });
};

const notifyPhoneChangeAdminReview = async ({ userId, requestId, newPhone }) => {
  await createAppNotification({
    userId,
    title: 'Phone update under admin review',
    message: `Phone update to ${newPhone} requires admin review (1-5 days).`,
    level: 'warning',
    entityType: 'phone_change_request',
    entityId: requestId,
    metadata: {
      route: '/profile',
      status: PHONE_CHANGE_STATUS_PENDING,
      needs_admin_review: true,
    },
    createdBy: null,
  });
};

const notifyPhoneChangeApproved = async ({ userId, requestId, newPhone, decisionSource }) => {
  await createAppNotification({
    userId,
    title: 'Phone update approved',
    message: `Your phone number has been updated to ${newPhone}.`,
    level: 'success',
    entityType: 'phone_change_request',
    entityId: requestId,
    metadata: {
      route: '/profile',
      status: PHONE_CHANGE_STATUS_APPROVED,
      decision_source: decisionSource,
    },
    createdBy: null,
  });
};

const notifyPhoneChangeRejected = async ({ userId, requestId, reason }) => {
  await createAppNotification({
    userId,
    title: 'Phone update rejected',
    message: reason
      ? `Your phone update request was rejected: ${reason}`
      : 'Your phone update request was rejected. Please contact support.',
    level: 'error',
    entityType: 'phone_change_request',
    entityId: requestId,
    metadata: {
      route: '/profile',
      status: PHONE_CHANGE_STATUS_REJECTED,
    },
    createdBy: null,
  });
};

const notifyAdminsPhoneChangeReview = async ({ requestId, userName, newPhone }) => {
  await notifyAdmins({
    title: 'Phone update needs review',
    message: `${userName || 'Customer'} requested phone ${newPhone}. Review pending request #${requestId}.`,
    level: 'warning',
    entityType: 'phone_change_request',
    entityId: requestId,
    metadata: {
      route: '/admin?tab=customer-requests',
      request_id: requestId,
    },
    createdBy: null,
  });
};

const processPendingPhoneChangeRequests = async ({ limit = PHONE_CHANGE_AUTO_BATCH_SIZE } = {}) => {
  if (phoneChangeWorkerRunning) return;
  phoneChangeWorkerRunning = true;
  try {
    const rows = await dbAllAsync(
      `SELECT *
       FROM phone_change_requests
       WHERE status = ?
         AND COALESCE(needs_admin_review, 0) = 0
         AND auto_check_at IS NOT NULL
         AND auto_check_at <= CURRENT_TIMESTAMP
       ORDER BY auto_check_at ASC, id ASC
       LIMIT ?`,
      [PHONE_CHANGE_STATUS_PENDING, Number(limit || PHONE_CHANGE_AUTO_BATCH_SIZE)]
    );
    for (const row of rows || []) {
      const requestId = Number(row?.id || 0);
      const userId = Number(row?.user_id || 0);
      if (!requestId || !userId) continue;
      try {
        const parsedPhone = parsePhoneInput(row.new_phone, { required: true });
        if (parsedPhone.error) {
          const rejected = await rejectPhoneChangeRequest({
            id: requestId,
            reviewedBy: null,
            adminNote: 'Auto validation failed',
            rejectionReason: parsedPhone.error,
          });
          if (rejected) {
            await notifyPhoneChangeRejected({
              userId,
              requestId,
              reason: parsedPhone.error,
            });
          }
          continue;
        }
        const conflict = await dbGetAsync(
          `SELECT id
           FROM users
           WHERE phone = ? AND id <> ?
           LIMIT 1`,
          [parsedPhone.value, userId]
        );
        if (conflict) {
          const escalated = await movePhoneChangeRequestToAdminReview({
            requestId,
            conflictUserId: conflict.id,
          });
          if (escalated?.notifyAdmins) {
            const owner = await dbGetAsync(`SELECT id, name FROM users WHERE id = ?`, [userId]);
            await notifyAdminsPhoneChangeReview({
              requestId,
              userName: owner?.name || `User #${userId}`,
              newPhone: parsedPhone.value,
            });
            await notifyPhoneChangeAdminReview({
              userId,
              requestId,
              newPhone: parsedPhone.value,
            });
          }
          continue;
        }

        const approved = await approvePhoneChangeRequest({
          id: requestId,
          reviewedBy: null,
          decisionSource: PHONE_CHANGE_DECISION_AUTO,
          adminNote: 'Auto-approved after uniqueness validation window',
        });
        if (approved?.request) {
          await notifyPhoneChangeApproved({
            userId,
            requestId,
            newPhone: parsedPhone.value,
            decisionSource: PHONE_CHANGE_DECISION_AUTO,
          });
        }
      } catch (error) {
        console.warn('[PHONE_CHANGE] Failed processing request:', error?.message || error);
      }
    }
  } finally {
    phoneChangeWorkerRunning = false;
  }
};

const startPhoneChangeWorker = () => {
  if (IS_VERCEL_RUNTIME) return;
  if (phoneChangeWorkerTimer) return;
  phoneChangeWorkerTimer = setInterval(() => {
    void processPendingPhoneChangeRequests().catch((error) => {
      console.warn('[PHONE_CHANGE] Background worker failed:', error?.message || error);
    });
  }, PHONE_CHANGE_PROCESS_INTERVAL_MS);
  void processPendingPhoneChangeRequests().catch(() => {});
};

const stopPhoneChangeWorker = () => {
  if (!phoneChangeWorkerTimer) return;
  clearInterval(phoneChangeWorkerTimer);
  phoneChangeWorkerTimer = null;
};

const PRODUCT_IMPORT_BATCH_TTL_MS = Number(process.env.PRODUCT_IMPORT_BATCH_TTL_MS || 30 * 60 * 1000);
const PRODUCT_IMPORT_HEADERS = [
  'id',
  'sku',
  'barcode',
  'name',
  'category',
  'subcategory',
  'brand',
  'sub_brand',
  'content',
  'color',
  'uom',
  'price',
  'mrp',
  'stock',
  'expiry_date',
  'image',
  'description',
  'defaultDiscount',
  'discountType',
  'is_active',
];
const PRODUCT_IMPORT_SAMPLE = {
  id: '',
  sku: 'NESCBRAN250G0129',
  barcode: '',
  name: 'Sample Product',
  category: 'Groceries',
  subcategory: '',
  brand: 'BrandX',
  sub_brand: '',
  content: '250g',
  color: '',
  uom: 'pcs',
  price: 99,
  mrp: 120,
  stock: 25,
  expiry_date: '',
  image: '',
  description: 'Sample product description',
  defaultDiscount: 0,
  discountType: 'fixed',
  is_active: 1,
};
const productImportBatches = new Map();
let phoneChangeWorkerTimer = null;
let phoneChangeWorkerRunning = false;

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toPositiveIntOrNull = (value) => {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return Math.trunc(n);
};

const normalizeDiscountType = (value) => {
  const raw = String(value || 'fixed').trim().toLowerCase();
  return raw === 'percentage' ? 'percentage' : 'fixed';
};

const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();
const normalizeMoneyValue = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
};

const normalizeHttpImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    return null;
  } catch (_) {
    return null;
  }
};

const normalizeBooleanish = (value, fallback = 1) => {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'active') return 1;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'inactive') return 0;
  const n = Number(raw);
  if (!Number.isNaN(n)) return n > 0 ? 1 : 0;
  return fallback;
};

const HIERARCHY_SEPARATOR = '->';
const splitHierarchyInput = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { parent: '', child: '', invalid: false };
  if (!raw.includes(HIERARCHY_SEPARATOR)) {
    return { parent: raw, child: '', invalid: false };
  }
  const parts = raw.split(HIERARCHY_SEPARATOR).map((part) => String(part || '').trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { parent: raw, child: '', invalid: true };
  }
  return { parent: parts[0], child: parts[1], invalid: false };
};

const composeHierarchyPath = (parent, child) => {
  const root = String(parent || '').trim();
  const leaf = String(child || '').trim();
  if (!root) return '';
  if (!leaf) return root;
  return `${root} ${HIERARCHY_SEPARATOR} ${leaf}`;
};

const normalizeProductRecord = (row) => {
  if (!row) return null;
  const out = { ...row };
  const categoryParsed = splitHierarchyInput(out.category);
  const explicitSubcategory = String(out.subcategory || '').trim();
  out.category = String(categoryParsed.parent || out.category || '').trim();
  out.subcategory = explicitSubcategory || categoryParsed.child || '';

  const brandParsed = splitHierarchyInput(out.brand);
  const explicitSubBrand = String(out.sub_brand || '').trim();
  out.brand = String(brandParsed.parent || out.brand || '').trim();
  out.sub_brand = explicitSubBrand || brandParsed.child || '';

  out.category_path = composeHierarchyPath(out.category, out.subcategory);
  out.brand_path = composeHierarchyPath(out.brand, out.sub_brand);
  out.defaultDiscount = Number(out.default_discount ?? 0);
  out.discountType = String(out.discount_type || 'fixed');
  out.is_active = Number(out.is_active ?? 1);
  return out;
};

const normalizeProductInput = (input = {}, current = null) => {
  const body = input || {};
  const existing = current || {};
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const hasCategoryInput = hasOwn(body, 'category');
  const hasBrandInput = hasOwn(body, 'brand');
  const hasSubcategoryInput = hasOwn(body, 'subcategory') || hasOwn(body, 'sub_category');
  const hasSubBrandInput = hasOwn(body, 'sub_brand') || hasOwn(body, 'subBrand') || hasOwn(body, 'subbrand');

  const name = body.name ?? existing.name ?? '';
  const rawCategoryInput = body.category ?? existing.category ?? 'Groceries';
  const description = body.description ?? existing.description ?? null;
  const rawBrandInput = body.brand ?? existing.brand ?? null;
  const existingSubcategory = String(existing.subcategory || '').trim();
  const existingSubBrand = String(existing.sub_brand || '').trim();
  const rawSubcategoryInput = body.subcategory ?? body.sub_category ?? (hasCategoryInput ? '' : existingSubcategory);
  const rawSubBrandInput = body.sub_brand ?? body.subBrand ?? body.subbrand ?? (hasBrandInput ? '' : existingSubBrand);

  const parsedCategory = splitHierarchyInput(rawCategoryInput);
  const parsedBrand = splitHierarchyInput(rawBrandInput);
  const categoryInputTrimmed = String(parsedCategory.parent || '').trim();
  const brandInputTrimmed = String(parsedBrand.parent || '').trim();

  const categoryFromInput = categoryInputTrimmed || 'Groceries';
  const brandFromInput = brandInputTrimmed || null;

  const explicitSubcategory = String(rawSubcategoryInput || '').trim();
  let subcategory = explicitSubcategory;
  if (hasSubcategoryInput && explicitSubcategory) {
    subcategory = explicitSubcategory;
  } else if (parsedCategory.child) {
    subcategory = parsedCategory.child;
  } else if (hasSubcategoryInput) {
    subcategory = '';
  } else if (!hasCategoryInput) {
    subcategory = existingSubcategory;
  } else {
    subcategory = '';
  }

  const explicitSubBrand = String(rawSubBrandInput || '').trim();
  let subBrand = explicitSubBrand;
  if (hasSubBrandInput && explicitSubBrand) {
    subBrand = explicitSubBrand;
  } else if (parsedBrand.child) {
    subBrand = parsedBrand.child;
  } else if (hasSubBrandInput) {
    subBrand = '';
  } else if (!hasBrandInput) {
    subBrand = existingSubBrand;
  } else {
    subBrand = '';
  }

  const categoryPath = composeHierarchyPath(categoryFromInput, subcategory);
  const brandPath = composeHierarchyPath(brandFromInput, subBrand);
  const categoryFormatError = parsedCategory.invalid
    ? 'category must be "Parent -> Child" when using ->'
    : null;
  const brandFormatError = parsedBrand.invalid
    ? 'brand must be "Parent -> Child" when using ->'
    : null;

  const content = body.content ?? existing.content ?? null;
  const color = body.color ?? existing.color ?? null;
  const priceRaw = body.price ?? existing.price ?? 0;
  const mrpRaw = body.mrp ?? existing.mrp ?? priceRaw;
  const uom = body.uom ?? existing.uom ?? 'pcs';
  const skuCandidate = body.sku ?? existing.sku ?? '';
  const barcodeCandidate = body.barcode ?? existing.barcode ?? null;
  const image = body.image ?? existing.image ?? null;
  const stockRaw = body.stock ?? existing.stock ?? 0;
  const expiryDate = body.expiry_date ?? existing.expiry_date ?? null;
  const defaultDiscountRaw = body.defaultDiscount ?? body.default_discount ?? existing.default_discount ?? existing.defaultDiscount ?? 0;
  const discountTypeRaw = body.discountType ?? body.discount_type ?? existing.discount_type ?? existing.discountType ?? 'fixed';
  const isActiveRaw = body.is_active ?? existing.is_active ?? 1;

  const price = Number(priceRaw);
  const mrp = Number(mrpRaw);
  const stock = Number(stockRaw);
  const defaultDiscount = Number(defaultDiscountRaw || 0);
  const discountType = normalizeDiscountType(discountTypeRaw);
  const isActive = normalizeBooleanish(isActiveRaw, 1);
  const sku = String(skuCandidate || '').trim() || generateSku(name, brandFromInput, content, mrp || price);
  const barcode = String(barcodeCandidate || '').trim() || null;

  return {
    name: String(name || '').trim(),
    description: description === null || description === undefined ? null : String(description).trim() || null,
    brand: brandFromInput,
    sub_brand: brandFromInput ? (subBrand || null) : null,
    brand_path: brandPath || null,
    content: content === null || content === undefined ? null : String(content).trim() || null,
    color: color === null || color === undefined ? null : String(color).trim() || null,
    price,
    mrp: Number.isFinite(mrp) ? mrp : price,
    uom: String(uom || 'pcs').trim() || 'pcs',
    sku,
    barcode,
    image: normalizeHttpImageUrl(image),
    stock,
    category: categoryFromInput,
    subcategory: subcategory || null,
    category_path: categoryPath || categoryFromInput,
    expiry_date: expiryDate ? String(expiryDate).slice(0, 10) : null,
    default_discount: defaultDiscount,
    discount_type: discountType,
    is_active: isActive,
    category_format_error: categoryFormatError,
    brand_format_error: brandFormatError,
  };
};

const validateProductPayload = (payload, { partial = false } = {}) => {
  const errors = [];
  if (payload.category_format_error) errors.push(payload.category_format_error);
  if (payload.brand_format_error) errors.push(payload.brand_format_error);
  if (!partial || payload.name !== undefined) {
    if (!String(payload.name || '').trim()) errors.push('name is required');
  }
  if (!partial || payload.category !== undefined) {
    if (!String(payload.category || '').trim()) errors.push('category is required');
  }
  if (!partial || payload.price !== undefined) {
    if (!Number.isFinite(Number(payload.price)) || Number(payload.price) <= 0) errors.push('price must be greater than 0');
  }
  if (!partial || payload.stock !== undefined) {
    if (!Number.isFinite(Number(payload.stock)) || Number(payload.stock) < 0) errors.push('stock must be 0 or more');
  }
  if (payload.mrp !== undefined && (!Number.isFinite(Number(payload.mrp)) || Number(payload.mrp) < 0)) {
    errors.push('mrp must be 0 or more');
  }
  if (payload.default_discount !== undefined && (!Number.isFinite(Number(payload.default_discount)) || Number(payload.default_discount) < 0)) {
    errors.push('defaultDiscount must be 0 or more');
  }
  if (payload.discount_type !== undefined) {
    const type = normalizeDiscountType(payload.discount_type);
    if (!['fixed', 'percentage'].includes(type)) errors.push('discountType must be fixed or percentage');
  }
  if (payload.expiry_date) {
    const expiry = String(payload.expiry_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) errors.push('expiry_date must be YYYY-MM-DD');
  }
  return errors;
};

const findProductConflictAsync = async (payload, { excludeId = null } = {}) => {
  const sku = normalizeTextKey(payload?.sku);
  if (sku) {
    const bySku = excludeId
      ? await dbGetAsync(`SELECT id, name, sku FROM products WHERE lower(sku) = ? AND id <> ? LIMIT 1`, [sku, Number(excludeId)])
      : await dbGetAsync(`SELECT id, name, sku FROM products WHERE lower(sku) = ? LIMIT 1`, [sku]);
    if (bySku) {
      return {
        field: 'sku',
        conflict_type: 'exact',
        severity: 'block',
        message: `Duplicate SKU already exists (Product #${bySku.id}: ${bySku.name})`
      };
    }
  }

  const barcode = normalizeTextKey(payload?.barcode);
  if (barcode) {
    const byBarcode = excludeId
      ? await dbGetAsync(`SELECT id, name, barcode FROM products WHERE lower(barcode) = ? AND id <> ? LIMIT 1`, [barcode, Number(excludeId)])
      : await dbGetAsync(`SELECT id, name, barcode FROM products WHERE lower(barcode) = ? LIMIT 1`, [barcode]);
    if (byBarcode) {
      return {
        field: 'barcode',
        conflict_type: 'exact',
        severity: 'block',
        message: `Duplicate barcode already exists (Product #${byBarcode.id}: ${byBarcode.name})`
      };
    }
  }

  const nameKey = normalizeTextKey(payload?.name);
  const brandKey = normalizeTextKey(payload?.brand);
  const subBrandKey = normalizeTextKey(payload?.sub_brand);
  if (!nameKey) return null;

  const byNameBrand = excludeId
    ? await dbAllAsync(
      `SELECT id, name, brand, sub_brand, price, mrp
       FROM products
       WHERE lower(trim(name)) = ?
         AND lower(trim(COALESCE(brand, ''))) = ?
         AND lower(trim(COALESCE(sub_brand, ''))) = ?
         AND id <> ?
       ORDER BY id DESC`,
      [nameKey, brandKey, subBrandKey, Number(excludeId)]
    )
    : await dbAllAsync(
      `SELECT id, name, brand, sub_brand, price, mrp
       FROM products
       WHERE lower(trim(name)) = ?
         AND lower(trim(COALESCE(brand, ''))) = ?
         AND lower(trim(COALESCE(sub_brand, ''))) = ?
       ORDER BY id DESC`,
      [nameKey, brandKey, subBrandKey]
    );
  if (!byNameBrand.length) return null;

  const price = normalizeMoneyValue(payload?.price);
  const mrp = normalizeMoneyValue(payload?.mrp);

  const exact = byNameBrand.find((row) =>
    normalizeMoneyValue(row?.price) === price && normalizeMoneyValue(row?.mrp) === mrp
  );
  if (exact) {
    return {
      field: 'name_brand_price_mrp',
      conflict_type: 'exact',
      severity: 'block',
      product_id: exact.id,
      product_name: exact.name,
      message: `Exact duplicate exists (Product #${exact.id}: ${exact.name}) for name + brand/sub-brand + price + MRP`
    };
  }

  const firstMatch = byNameBrand[0];
  return {
    field: 'name_brand',
    conflict_type: 'identical',
    severity: 'confirm',
    product_id: firstMatch.id,
    product_name: firstMatch.name,
    message: `Identical product name + brand/sub-brand exists (Product #${firstMatch.id}: ${firstMatch.name}). Choose to allow or cancel.`
  };
};

const buildProductExactKey = (payload) => {
  const nameKey = normalizeTextKey(payload?.name);
  if (!nameKey) return '';
  const brandKey = normalizeTextKey(payload?.brand);
  const subBrandKey = normalizeTextKey(payload?.sub_brand);
  const price = normalizeMoneyValue(payload?.price);
  const mrp = normalizeMoneyValue(payload?.mrp);
  return `${nameKey}::${brandKey}::${subBrandKey}::${price ?? ''}::${mrp ?? ''}`;
};

const findExistingProductForImportAsync = async (row) => {
  const id = toPositiveIntOrNull(row.id);
  if (id) {
    const byId = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [id]);
    if (byId) return byId;
  }
  const sku = String(row.sku || '').trim();
  if (sku) {
    const bySku = await dbGetAsync(`SELECT * FROM products WHERE lower(sku) = ?`, [sku.toLowerCase()]);
    if (bySku) return bySku;
  }
  const barcode = String(row.barcode || '').trim();
  if (barcode) {
    const byBarcode = await dbGetAsync(`SELECT * FROM products WHERE lower(barcode) = ?`, [barcode.toLowerCase()]);
    if (byBarcode) return byBarcode;
  }
  return null;
};

const resolveOrCreateCategoryNameAsync = async (inputCategory) => {
  const requested = String(inputCategory || '').trim() || 'Groceries';
  const existing = await dbGetAsync(`SELECT name FROM categories WHERE lower(name) = lower(?)`, [requested]);
  if (existing?.name) return existing.name;
  await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [requested, 'Product category']);
  return requested;
};

const createImportBatchChecksum = (rows, mode, stockMode) => {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ rows, mode, stockMode }))
    .digest('hex');
};

const cleanupExpiredImportBatches = () => {
  const now = Date.now();
  for (const [batchId, batch] of productImportBatches.entries()) {
    if (batch.expiresAt <= now) productImportBatches.delete(batchId);
  }
};

const applyProductImportBatch = async ({ batchId, checksum, authUser, allowIdenticalRows = [] }) => {
  cleanupExpiredImportBatches();
  const normalizedBatchId = String(batchId || '').trim();
  const normalizedChecksum = String(checksum || '').trim();
  if (!normalizedBatchId || !normalizedChecksum) {
    const err = new Error('batch_id and checksum are required');
    err.status = 400;
    throw err;
  }

  const batch = productImportBatches.get(normalizedBatchId);
  if (!batch) {
    const err = new Error('Import batch not found or expired');
    err.status = 404;
    throw err;
  }
  if (batch.checksum !== normalizedChecksum) {
    const err = new Error('Batch checksum mismatch');
    err.status = 409;
    throw err;
  }
  if ((authUser?.id || null) !== (batch.createdBy || null) && authUser?.role !== 'admin') {
    const err = new Error('Not allowed to confirm this batch');
    err.status = 403;
    throw err;
  }

  const result = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };
  const seenInBatch = {
    productIds: new Map(),
    sku: new Map(),
    barcode: new Map(),
    identity: new Map(),
  };
  const allowIdenticalSet = new Set(
    Array.isArray(allowIdenticalRows)
      ? allowIdenticalRows.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : []
  );

  await dbTxAsync(async () => {
    for (const row of batch.rows) {
      try {
        const existing = row.action === 'update'
          ? await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [row.matched_product_id])
          : null;
        if (row.action === 'update' && !existing) {
          throw new Error('Matched product no longer exists');
        }

        const payload = normalizeProductInput(row.payload, existing || null);
        const validationErrors = validateProductPayload(payload);
        if (validationErrors.length) {
          throw new Error(validationErrors.join('; '));
        }
        const duplicate = await findProductConflictAsync(payload, {
          excludeId: row.action === 'update' ? row.matched_product_id : null
        });
        if (duplicate) {
          if (duplicate.severity === 'confirm') {
            if (!allowIdenticalSet.has(Number(row.row))) {
              throw new Error(`${duplicate.message} (row ${row.row} requires allow_identical choice)`);
            }
          } else {
            throw new Error(duplicate.message);
          }
        }

        const matchedId = row.action === 'update' ? Number(row.matched_product_id) : null;
        if (matchedId) {
          const seenProductRow = seenInBatch.productIds.get(matchedId);
          if (seenProductRow) throw new Error(`Duplicate update target in import batch (also seen at row ${seenProductRow})`);
          seenInBatch.productIds.set(matchedId, row.row);
        }
        const skuKey = normalizeTextKey(payload.sku);
        if (skuKey) {
          const seenSkuRow = seenInBatch.sku.get(skuKey);
          if (seenSkuRow) throw new Error(`Duplicate SKU in import batch (also seen at row ${seenSkuRow})`);
          seenInBatch.sku.set(skuKey, row.row);
        }
        const barcodeKey = normalizeTextKey(payload.barcode);
        if (barcodeKey) {
          const seenBarcodeRow = seenInBatch.barcode.get(barcodeKey);
          if (seenBarcodeRow) throw new Error(`Duplicate barcode in import batch (also seen at row ${seenBarcodeRow})`);
          seenInBatch.barcode.set(barcodeKey, row.row);
        }
        const identityKey = buildProductExactKey(payload);
        if (identityKey) {
          const seenIdentityRow = seenInBatch.identity.get(identityKey);
          if (seenIdentityRow) throw new Error(`Exact duplicate in import batch (also seen at row ${seenIdentityRow})`);
          seenInBatch.identity.set(identityKey, row.row);
        }

        if (row.action === 'create') {
          await dbRunAsync(
            `INSERT INTO products
            (name, description, brand, sub_brand, content, color, price, mrp, uom, sku, barcode, image, stock, category, subcategory, expiry_date, default_discount, discount_type, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              payload.name,
              payload.description,
              payload.brand,
              payload.sub_brand,
              payload.content,
              payload.color,
              payload.price,
              payload.mrp,
              payload.uom,
              payload.sku,
              payload.barcode,
              payload.image,
              payload.stock,
              payload.category,
              payload.subcategory,
              payload.expiry_date,
              payload.default_discount,
              payload.discount_type,
              payload.is_active,
            ]
          );
          await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
          result.created += 1;
        } else {
          await dbRunAsync(
            `UPDATE products SET
             name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
             WHERE id=?`,
            [
              payload.name,
              payload.description,
              payload.brand,
              payload.sub_brand,
              payload.content,
              payload.color,
              payload.price,
              payload.mrp,
              payload.uom,
              payload.sku,
              payload.barcode,
              payload.image,
              payload.stock,
              payload.category,
              payload.subcategory,
              payload.expiry_date,
              payload.default_discount,
              payload.discount_type,
              payload.is_active,
              row.matched_product_id,
            ]
          );
          await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
          result.updated += 1;
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push({ row: row.row, message: err.message });
        throw err;
      }
    }
  });

  productImportBatches.delete(normalizedBatchId);
  await dbRunAsync(`UPDATE import_batches SET status = 'applied' WHERE batch_id = ?`, [normalizedBatchId]);

  return {
    batch_id: normalizedBatchId,
    checksum: normalizedChecksum,
    result,
  };
};

const parseProductFileToRows = ({ fileName, fileContentBase64 }) => {
  if (!fileName || !fileContentBase64) {
    throw new Error('file_name and file_content_base64 are required');
  }
  const ext = String(path.extname(fileName || '')).toLowerCase();
  const buffer = Buffer.from(String(fileContentBase64 || ''), 'base64');
  let workbook;
  if (ext === '.csv') {
    workbook = XLSX.read(buffer.toString('utf8'), { type: 'string' });
  } else if (ext === '.xlsx' || ext === '.xls') {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else {
    throw new Error('Unsupported file format. Use .csv, .xlsx or .xls');
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('No sheet found in file');
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No data rows found');
  return rows;
};

const toProductExportRow = (row) => ({
  id: row.id,
  sku: row.sku || '',
  barcode: row.barcode || '',
  name: row.name || '',
  category: row.category || '',
  subcategory: row.subcategory || '',
  brand: row.brand || '',
  sub_brand: row.sub_brand || '',
  content: row.content || '',
  color: row.color || '',
  uom: row.uom || 'pcs',
  price: Number(row.price || 0),
  mrp: Number(row.mrp || 0),
  stock: Number(row.stock || 0),
  expiry_date: row.expiry_date || '',
  image: row.image || '',
  description: row.description || '',
  defaultDiscount: Number(row.default_discount || 0),
  discountType: row.discount_type || 'fixed',
  is_active: Number(row.is_active ?? 1),
});

const closePostgresScaffold = async () => {
  if (!postgresPool) return;
  const pool = postgresPool;
  postgresPool = null;
  try {
    await pool.end();
  } catch (_) {
    // ignore close failures
  }
};

// Simple notify endpoint used by admin UI to send in-app messages to customers when order status changes.
app.post('/api/notify-order/:orderId', requireAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const userId = order.user_id;
    const senderId = Number(req.body?.sender_id || req.authUser?.id || userId || 0) || null;
    const action = req.body?.action || 'updated';
    const message = `Your order ${order.order_number || `#${order.id}`} was ${action}.`;
    if (userId) {
      await dbRunAsync(
        `INSERT INTO messages (sender_id, recipient_id, subject, body, read) VALUES (?, ?, ?, ?, 0)`,
        [senderId, userId, `Order ${action}`, message]
      );
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const sanitizeUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    email_verified: Number(row.email_verified || 0) === 1,
    phone: row.phone,
    phone_verified: Number(row.phone_verified || 0) === 1,
    address: row.address,
    profile_image: row.profile_image || null,
    must_change_password: Number(row.must_change_password || 0) === 1,
    created_at: row.created_at,
  };
};

app.get('/api/auth/session', requireAuth, async (req, res) => {
  try {
    const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.authUser.id]));
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      success: true,
      user,
      token: generateToken(user),
      auth_provider: isSupabaseEmailAuthUsable() ? 'supabase' : 'legacy',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch session' });
  }
});

const PASSWORD_AUTH_DISABLED_ERROR = 'Password-based authentication is disabled. Use OTP or OAuth login.';

app.post('/api/auth/otp/request', authIpLimiter, async (req, res) => {
  try {
    const authMode = String(req.body?.mode || req.body?.purpose || 'login').trim().toLowerCase() === 'register'
      ? 'register'
      : 'login';
    const normalizedEmail = normalizeEmail(req.body?.email);
    const phoneParsed = parsePhoneInput(req.body?.phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (normalizedEmail && normalizedPhone) {
      return res.status(400).json({ error: 'Provide either email or phone, not both' });
    }
    if (normalizedPhone) {
      return res.status(400).json({ error: 'Phone OTP login is not enabled. Use email OTP or OAuth login.' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        await supabaseAuthProvider.requestEmailOtp({
          email: normalizedEmail,
          shouldCreateUser: authMode === 'register',
        });
        return res.status(201).json({
          success: true,
          message: 'OTP sent to email.',
          delivery_channel: 'email',
          delivery_mode: 'supabase',
          otp_ttl_seconds: OTP_TTL_SECONDS,
          provider: 'supabase',
        });
      } catch (error) {
        return res.status(400).json({ error: error.message || 'Failed to send email OTP' });
      }
    }

    let user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

    if (authMode === 'login' && !user) {
      return res.status(404).json({
        error: 'Account not found. Please register first.',
        register_required: true,
      });
    }
    if (authMode === 'register' && user) {
      return res.status(409).json({
        error: 'Account already exists. Please sign in.',
        login_required: true,
      });
    }

    if (authMode === 'register' && !user) {
      const displayName = normalizedEmail.split('@')[0];
      try {
        const created = await dbRunAsync(
          `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'customer',
            displayName,
            normalizedEmail || null,
            0,
            null,
            0,
            null,
            hashPassword(generateTemporaryPassword()),
            0,
          ]
        );
        user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [created.lastInsertRowid]);
      } catch (error) {
        if (!isUniqueViolationError(error)) throw error;
        user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
      }
    }
    if (!user) {
      return res.status(500).json({ error: 'Unable to prepare OTP login for this account' });
    }

    const otpCode = generateOtpCode(6);
    const otpHash = hashPassword(otpCode);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
    await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE email = ? AND used = 0`, [normalizedEmail]);
    await dbRunAsync(
      `INSERT INTO auth_login_otps (user_id, email, phone, otp_hash, expires_at, attempts, max_attempts, used)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0)`,
      [user.id, normalizedEmail || null, null, otpHash, expiresAt, OTP_MAX_ATTEMPTS]
    );

    const responsePayload = {
      success: true,
      message: 'OTP sent to email.',
      delivery_channel: 'email',
      otp_ttl_seconds: OTP_TTL_SECONDS,
    };
    const preparedEmail = notificationService.prepareEmail({
      type: 'auth_login_otp',
      to: normalizedEmail,
      payload: {
        recipientName: user.name,
        code: otpCode,
        expiresAt,
      },
    });
    const eventId = await createNotificationEvent({
      type: 'auth_login_otp',
      channel: 'email',
      recipient: preparedEmail.to,
      recipientUserId: Number(user.id || 0) || null,
      subject: preparedEmail.subject,
      body: preparedEmail.body,
      metadata: {
        mode: EMAIL_DELIVERY_MODE,
        expires_at: expiresAt,
        mailto_url: preparedEmail.mailto_url,
      },
      status: 'prepared',
    });

    if (EMAIL_DELIVERY_MODE === 'auto') {
      if (!emailVerificationProvider?.isReady) {
        await updateNotificationEventStatus(eventId, {
          status: 'failed',
          errorMessage: 'Email provider is not configured',
        });
        return res.status(503).json({ error: 'Email provider is not configured' });
      }
      await emailVerificationProvider.sendVerification({
        to: normalizedEmail,
        token: otpCode,
        link: '',
        expiresAt,
        subject: preparedEmail.subject,
        body: preparedEmail.body,
      });
      await updateNotificationEventStatus(eventId, { status: 'sent' });
    }

    responsePayload.delivery_mode = EMAIL_DELIVERY_MODE;
    responsePayload.prepared_event_id = eventId;
    if (AUTH_LOGIN_OTP_EXPOSE_CODE) {
      responsePayload.dev_otp_code = otpCode;
      responsePayload.manual_email = {
        subject: preparedEmail.subject,
        body: preparedEmail.body,
        mailto_url: preparedEmail.mailto_url,
      };
    }
    return res.status(201).json(responsePayload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to request OTP' });
  }
});

app.post('/api/auth/otp/verify', authIpLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const phoneParsed = parsePhoneInput(req.body?.phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const otpCode = String(req.body?.otp || req.body?.code || '').trim();
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (normalizedEmail && normalizedPhone) {
      return res.status(400).json({ error: 'Provide either email or phone, not both' });
    }
    if (normalizedPhone) {
      return res.status(400).json({ error: 'Phone OTP login is not enabled. Use email OTP or OAuth login.' });
    }
    if (!otpCode) return res.status(400).json({ error: 'OTP is required' });

    if (isSupabaseEmailAuthUsable()) {
      try {
        const verification = await supabaseAuthProvider.verifySignInOtp({
          email: normalizedEmail,
          token: otpCode,
        });
        const supabaseUser = verification?.user || null;
        const resolvedEmail = normalizeEmail(supabaseUser?.email) || normalizedEmail;
        const synced = await syncLocalUserFromSupabaseAuth({
          email: resolvedEmail,
          metadata: getSupabaseUserMetadata(supabaseUser),
          emailVerified: true,
        });
        if (!synced) {
          return res.status(401).json({ error: 'Unable to sync account after OTP verification' });
        }
        return res.json({
          success: true,
          user: sanitizeUser(synced),
          token: generateToken(synced),
          auth_provider: 'supabase_otp',
          supabase_session: toSupabaseSessionPayload(verification?.session),
        });
      } catch (error) {
        return res.status(400).json({ error: error.message || 'Invalid or expired OTP' });
      }
    }

    const user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const otpRow = await dbGetAsync(
      `SELECT * FROM auth_login_otps
       WHERE user_id = ?
         AND COALESCE(email, '') = COALESCE(?, '')
         AND COALESCE(phone, '') = ''
         AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedEmail || null]
    );
    if (!otpRow) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const now = Date.now();
    const expiresAt = new Date(otpRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    if (Number(otpRow.attempts || 0) >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
      return res.status(400).json({ error: 'OTP attempt limit reached' });
    }

    const otpOk = verifyPassword(otpCode, { password_hash: otpRow.otp_hash });
    if (!otpOk) {
      const nextAttempts = Number(otpRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE auth_login_otps SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(otpRow.used || 0), otpRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await dbRunAsync(`UPDATE auth_login_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
    await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE id = ?`, [user.id]);
    const freshUser = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [user.id]);
    return res.json({
      success: true,
      user: sanitizeUser(freshUser),
      token: generateToken(freshUser),
      auth_provider: 'otp',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

app.post('/api/auth/login', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);
app.post('/api/auth/register', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);
app.post('/api/auth/change-password', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);
app.post('/api/auth/request-password-reset', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);
app.post('/api/auth/password/recovery/complete', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);

app.post('/api/auth/email/verification/request', authIpLimiter, emailVerificationLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        await supabaseAuthProvider.resendSignupVerification({ email: normalizedEmail });
        return res.status(201).json({
          success: true,
          provider: 'supabase',
          message: 'If the account exists, a verification email was sent.',
        });
      } catch (error) {
        if (isSupabaseAuthStrictMode()) {
          return res.status(400).json({ error: error.message || 'Failed to send verification email' });
        }
      }
    }

    const user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE email = ?`, [normalizedEmail]);
    if (!user) {
      return res.status(201).json({
        success: true,
        message: 'If the account exists, verification request was submitted for admin review.',
      });
    }
    if (Number(user.email_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Email is already verified' });
    }
    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestType: 'email',
      requestedFromIp: getRequestIp(req),
    });
    return res.status(201).json({
      success: true,
      message: 'Email verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/email/verification/confirm', authIpLimiter, emailVerificationLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || '').trim();
    const tokenHash = String(req.body?.token_hash || req.body?.tokenHash || '').trim();
    if (!normalizedEmail || (!token && !tokenHash)) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        const verificationResult = await supabaseAuthProvider.verifyEmailOtp({
          email: normalizedEmail,
          token,
          tokenHash,
        });
        const supabaseUser = verificationResult?.user || null;
        const synced = await syncLocalUserFromSupabaseAuth({
          email: normalizeEmail(supabaseUser?.email) || normalizedEmail,
          metadata: getSupabaseUserMetadata(supabaseUser),
          emailVerified: true,
        });
        if (!synced) {
          await syncLocalEmailVerifiedFromSupabase(normalizedEmail);
        }
        const userToComplete = synced
          || await dbGetAsync(`SELECT id FROM users WHERE email = ?`, [normalizedEmail]);
        if (userToComplete?.id) {
          await completeContactVerificationRequests({ userId: userToComplete.id, requestType: 'email' });
        }
        return res.json({
          success: true,
          provider: 'supabase',
          message: 'Email verified successfully',
        });
      } catch (error) {
        if (isSupabaseAuthStrictMode()) {
          return res.status(400).json({ error: error.message || 'Invalid or expired verification token' });
        }
      }
    }

    if (!token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }
    const user = await dbGetAsync(`SELECT id, email_verified FROM users WHERE email = ?`, [normalizedEmail]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification token' });
    if (Number(user.email_verified || 0) === 1) {
      await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
      return res.json({ success: true, message: 'Email is already verified' });
    }

    const tokenRow = await dbGetAsync(
      `SELECT * FROM email_verification_tokens
       WHERE user_id = ? AND email = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedEmail]
    );
    if (!tokenRow) return res.status(400).json({ error: 'Invalid or expired verification token' });

    const now = Date.now();
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    if (Number(tokenRow.attempts || 0) >= Number(tokenRow.max_attempts || EMAIL_VERIFY_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Verification token attempt limit reached' });
    }

    const providedHash = hashVerificationToken(token);
    if (providedHash !== String(tokenRow.token_hash || '')) {
      const nextAttempts = Number(tokenRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(tokenRow.max_attempts || EMAIL_VERIFY_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE email_verification_tokens SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(tokenRow.used || 0), tokenRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE id = ?`, [user.id]);
    await dbRunAsync(`UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND email = ? AND used = 0`, [user.id, normalizedEmail]);
    await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
    return res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/email/verification/status', requireAuth, async (req, res) => {
  try {
    let user = await dbGetAsync(`SELECT id, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (isSupabaseEmailAuthUsable() && user.email) {
      const bearerToken = getBearerTokenFromRequest(req);
      if (bearerToken) {
        try {
          const supabaseUser = await supabaseAuthProvider.getUser({ accessToken: bearerToken });
          if (isSupabaseEmailVerified(supabaseUser) && Number(user.email_verified || 0) !== 1) {
            await syncLocalEmailVerifiedFromSupabase(user.email);
            user = await dbGetAsync(`SELECT id, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]) || user;
            await completeContactVerificationRequests({ userId: user.id, requestType: 'email' });
          }
        } catch (_) {
          // Ignore token mismatch (legacy token) and keep local status.
        }
      }
    }
    return res.json({
      email: user.email || null,
      email_verified: Number(user.email_verified || 0) === 1,
      mode: EMAIL_VERIFICATION_MODE,
      provider_ready: Boolean(emailVerificationProvider?.isReady),
      provider: isSupabaseEmailAuthUsable() ? 'supabase' : 'legacy',
      supabase_auth_enabled: Boolean(supabaseAuthProvider?.isEnabled),
      supabase_auth_mode: SUPABASE_AUTH_MODE,
      supabase_client_ready: Boolean(supabaseAuthProvider?.clientReady),
      supabase_admin_ready: Boolean(supabaseAuthProvider?.adminReady),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/email/verification/request-self', requireAuth, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'No email is set on your profile' });
    }
    if (Number(user.email_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Email is already verified' });
    }

    if (isSupabaseEmailAuthUsable()) {
      try {
        await supabaseAuthProvider.resendSignupVerification({ email: normalizedEmail });
        return res.status(201).json({
          success: true,
          provider: 'supabase',
          message: 'Verification email sent.',
        });
      } catch (error) {
        if (isSupabaseAuthStrictMode()) {
          return res.status(400).json({ error: error.message || 'Failed to send verification email' });
        }
      }
    }

    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestedBy: Number(req.authUser?.id || 0) || null,
      requestedFromIp: getRequestIp(req),
      requestType: 'email',
    });
    return res.status(201).json({
      success: true,
      message: 'Email verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/phone/verification/request', authIpLimiter, async (req, res) => {
  try {
    const phoneParsed = parsePhoneInput(req.body?.phone, { required: true });
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE phone = ?`, [normalizedPhone]);
    if (!user) {
      return res.status(201).json({
        success: true,
        message: 'If the account exists, verification request was submitted for admin review.',
      });
    }
    if (Number(user.phone_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Phone is already verified' });
    }
    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestType: 'phone',
      requestedFromIp: getRequestIp(req),
    });
    return res.status(201).json({
      success: true,
      message: 'Phone verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/phone/verification/confirm', authIpLimiter, async (req, res) => {
  try {
    const phoneParsed = parsePhoneInput(req.body?.phone, { required: true });
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const code = String(req.body?.code || req.body?.token || '').trim();
    if (!code) return res.status(400).json({ error: 'Phone and code are required' });
    const user = await dbGetAsync(`SELECT id, phone_verified FROM users WHERE phone = ?`, [normalizedPhone]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification code' });
    if (Number(user.phone_verified || 0) === 1) {
      await completeContactVerificationRequests({ userId: user.id, requestType: 'phone' });
      return res.json({ success: true, message: 'Phone is already verified' });
    }

    const tokenRow = await dbGetAsync(
      `SELECT * FROM phone_verification_tokens
       WHERE user_id = ? AND phone = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedPhone]
    );
    if (!tokenRow) return res.status(400).json({ error: 'Invalid or expired verification code' });

    const now = Date.now();
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    if (Number(tokenRow.attempts || 0) >= Number(tokenRow.max_attempts || PHONE_VERIFY_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE id = ?`, [tokenRow.id]);
      return res.status(400).json({ error: 'Verification code attempt limit reached' });
    }

    const providedHash = hashOpaqueToken(code);
    if (providedHash !== String(tokenRow.token_hash || '')) {
      const nextAttempts = Number(tokenRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(tokenRow.max_attempts || PHONE_VERIFY_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE phone_verification_tokens SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(tokenRow.used || 0), tokenRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    await dbRunAsync(`UPDATE users SET phone_verified = 1 WHERE id = ?`, [user.id]);
    await dbRunAsync(`UPDATE phone_verification_tokens SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0`, [user.id, normalizedPhone]);
    await completeContactVerificationRequests({ userId: user.id, requestType: 'phone' });
    return res.json({ success: true, message: 'Phone verified successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/phone/verification/status', requireAuth, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT id, phone, phone_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      phone: user.phone || null,
      phone_verified: Number(user.phone_verified || 0) === 1,
      mode: WHATSAPP_DELIVERY_MODE,
      provider_ready: Boolean(whatsappProvider?.isReady),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/phone-change-request/status', requireAuth, async (req, res) => {
  try {
    await processPendingPhoneChangeRequests({ limit: 10 });
    const row = await getLatestPhoneChangeRequestForUser(req.authUser.id);
    if (!row) {
      return res.json({
        request: null,
      });
    }
    return res.json({
      request: serializePhoneChangeRequest(row),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load phone change request status' });
  }
});

app.get('/api/auth/contact-verification/status', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await dbAllAsync(
      `SELECT id, request_type, status, admin_note, processed_at, completed_at, created_at, updated_at
       FROM contact_verification_requests
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );

    const latest = { email: null, phone: null };
    rows.forEach((row) => {
      const type = normalizeContactVerificationRequestType(row?.request_type);
      if (!type || latest[type]) return;
      latest[type] = row;
    });

    return res.json(latest);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load verification request status' });
  }
});

app.post('/api/auth/phone/verification/request-self', requireAuth, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const normalizedPhone = normalizePhone(user.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'No phone is set on your profile' });
    }
    if (Number(user.phone_verified || 0) === 1) {
      return res.status(200).json({ success: true, message: 'Phone is already verified' });
    }
    const requestRow = await queueContactVerificationRequest({
      userId: user.id,
      requestedBy: Number(req.authUser?.id || 0) || null,
      requestedFromIp: getRequestIp(req),
      requestType: 'phone',
    });
    return res.status(201).json({
      success: true,
      message: 'Phone verification request submitted to admin',
      request: requestRow,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/reset-password/otp/verify', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);

app.post('/api/auth/reset-password/otp/complete', authIpLimiter, async (_, res) =>
  res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR })
);

app.get('/api/auth/reset-mode', (_, res) => {
  return res.json({
    auth_flow_mode: AUTH_FLOW_MODE,
    mode: 'otp_login_only',
    auth_methods: {
      otp: true,
      oauth: Boolean(supabaseAuthProvider?.shouldUseOAuth?.()),
      password: false,
    },
    otp_provider: OTP_PROVIDER,
    otp_delivery_mode: OTP_DELIVERY_MODE,
    otp_ready: true,
    otp_verify_session_ttl_seconds: OTP_VERIFY_SESSION_TTL_SECONDS,
    phone_verification_required: PHONE_VERIFICATION_REQUIRED,
    whatsapp_delivery_mode: WHATSAPP_DELIVERY_MODE,
    whatsapp_provider: WHATSAPP_PROVIDER,
    whatsapp_provider_ready: Boolean(whatsappProvider?.isReady),
    email_verification_mode: EMAIL_VERIFICATION_MODE,
    email_delivery_mode: EMAIL_DELIVERY_MODE,
    email_provider_ready: Boolean(emailVerificationProvider?.isReady),
    supabase_auth_enabled: Boolean(supabaseAuthProvider?.isEnabled),
    supabase_auth_mode: SUPABASE_AUTH_MODE,
    supabase_client_ready: Boolean(supabaseAuthProvider?.clientReady),
    supabase_oauth_ready: Boolean(supabaseAuthProvider?.oauthReady),
    supabase_admin_ready: Boolean(supabaseAuthProvider?.adminReady),
    supabase_url: supabaseAuthProvider?.baseUrl || null,
    supabase_email_verify_redirect: SUPABASE_EMAIL_VERIFY_REDIRECT || null,
  });
});

app.post('/api/analytics/session/start', async (req, res) => {
  try {
    let sessionId = normalizeVisitorSessionId(req.body?.session_id || req.body?.sessionId);
    if (!sessionId) sessionId = generateVisitorSessionId();
    const trackedPath = sanitizeTrackedPath(req.body?.path || req.body?.pathname || '/');
    const referrer = sanitizeShortText(req.body?.referrer || req.headers.referer, 500);
    const userAgent = sanitizeShortText(req.headers['user-agent'], 500);
    const ipHash = hashVisitorIp(req);
    const authUser = await getAuthUserFromRequest(req);
    const authUserId = Number(authUser?.id || 0) || null;

    await dbRunAsync(SQL_UPSERT_VISITOR_SESSION, [sessionId, authUserId, trackedPath, referrer, userAgent, ipHash]);

    return res.status(201).json({ success: true, session_id: sessionId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to start visitor session' });
  }
});

app.post('/api/analytics/session/heartbeat', async (req, res) => {
  try {
    let sessionId = normalizeVisitorSessionId(req.body?.session_id || req.body?.sessionId);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    const trackedPath = sanitizeTrackedPath(req.body?.path || req.body?.pathname || '/');
    const referrer = sanitizeShortText(req.body?.referrer || req.headers.referer, 500);
    const userAgent = sanitizeShortText(req.headers['user-agent'], 500);
    const ipHash = hashVisitorIp(req);
    const authUser = await getAuthUserFromRequest(req);
    const authUserId = Number(authUser?.id || 0) || null;

    await dbRunAsync(SQL_UPSERT_VISITOR_SESSION, [sessionId, authUserId, trackedPath, referrer, userAgent, ipHash]);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to track visitor heartbeat' });
  }
});

app.get('/api/admin/analytics/summary', requireAdmin, async (_, res) => {
  try {
    const windowArg = -VISITOR_ONLINE_WINDOW_MINUTES;

    const onlineVisitors = Number(
      (await dbGetAsync(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM visitor_sessions
         WHERE last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`,
        [windowArg]
      ))?.count || 0
    );
    const onlineLoggedInUsers = Number(
      (await dbGetAsync(
        `SELECT COUNT(DISTINCT user_id) AS count
         FROM visitor_sessions
         WHERE user_id IS NOT NULL
           AND last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`,
        [windowArg]
      ))?.count || 0
    );
    const uniqueSessionsToday = Number(
      (await dbGetAsync(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM visitor_sessions
         WHERE DATE(started_at) = CURRENT_DATE`
      ))?.count || 0
    );
    const uniqueSessionsMonth = Number(
      (await dbGetAsync(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM visitor_sessions
         WHERE TO_CHAR(started_at, 'YYYY-MM') = TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM')`
      ))?.count || 0
    );
    const uniqueSessionsYear = Number(
      (await dbGetAsync(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM visitor_sessions
         WHERE EXTRACT(YEAR FROM started_at) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)`
      ))?.count || 0
    );

    return res.json({
      online_visitors: onlineVisitors,
      online_logged_in_users: onlineLoggedInUsers,
      unique_sessions_today: uniqueSessionsToday,
      unique_sessions_month: uniqueSessionsMonth,
      unique_sessions_year: uniqueSessionsYear,
      online_window_minutes: VISITOR_ONLINE_WINDOW_MINUTES,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load analytics summary' });
  }
});

app.post('/api/admin/notifications/email/prepare', requireAdmin, async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim().toLowerCase();
    if (type !== 'email_verification') {
      return res.status(400).json({ error: 'Unsupported notification type' });
    }

    const targetUserId = Number(req.body?.user_id || 0);
    const targetEmail = normalizeEmail(req.body?.email);
    let user = null;

    if (targetUserId) {
      user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE id = ?`, [targetUserId]);
    } else if (targetEmail) {
      user = await dbGetAsync(`SELECT id, name, email, email_verified FROM users WHERE email = ?`, [targetEmail]);
    } else {
      return res.status(400).json({ error: 'user_id or email is required' });
    }

    if (!user || !normalizeEmail(user.email)) {
      return res.status(404).json({ error: 'User with valid email not found' });
    }

    if (Number(user.email_verified || 0) === 1) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    const delivery = await sendEmailVerificationChallenge({
      userId: user.id,
      email: normalizeEmail(user.email),
      recipientName: user.name,
      requestedBy: Number(req.authUser?.id || 0) || null,
      exposeTemplate: true,
      deliveryModeOverride: 'manual',
    });

    return res.status(201).json({
      success: true,
      type,
      user: {
        id: user.id,
        name: user.name,
        email: normalizeEmail(user.email),
      },
      delivery,
      prepared_email: delivery.email || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to prepare notification' });
  }
});

app.post('/api/admin/notifications/whatsapp/prepare', requireAdmin, async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim().toLowerCase();
    if (type !== 'phone_verification') {
      return res.status(400).json({ error: 'Unsupported notification type' });
    }

    const targetUserId = Number(req.body?.user_id || 0);
    const phoneParsed = parsePhoneInput(req.body?.phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const targetPhone = phoneParsed.value;
    let user = null;

    if (targetUserId) {
      user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE id = ?`, [targetUserId]);
    } else if (targetPhone) {
      user = await dbGetAsync(`SELECT id, name, phone, phone_verified FROM users WHERE phone = ?`, [targetPhone]);
    } else {
      return res.status(400).json({ error: 'user_id or phone is required' });
    }

    if (!user || !normalizePhone(user.phone)) {
      return res.status(404).json({ error: 'User with valid phone not found' });
    }

    if (Number(user.phone_verified || 0) === 1) {
      return res.status(400).json({ error: 'Phone is already verified' });
    }

    const delivery = await sendPhoneVerificationChallenge({
      userId: user.id,
      phone: normalizePhone(user.phone),
      recipientName: user.name,
      requestedBy: Number(req.authUser?.id || 0) || null,
      exposeTemplate: true,
      deliveryModeOverride: 'manual',
    });

    return res.status(201).json({
      success: true,
      type,
      user: {
        id: user.id,
        name: user.name,
        phone: normalizePhone(user.phone),
      },
      delivery,
      prepared_whatsapp: delivery.whatsapp || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to prepare notification' });
  }
});

app.post('/api/admin/notifications/:id/mark-sent', requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.id || 0);
    if (!eventId) return res.status(400).json({ error: 'Invalid notification id' });
    const row = await dbGetAsync(`SELECT id FROM notification_events WHERE id = ?`, [eventId]);
    if (!row) return res.status(404).json({ error: 'Notification event not found' });
    await updateNotificationEventStatus(eventId, {
      status: 'sent',
      sentBy: Number(req.authUser?.id || 0) || null,
    });
    return res.json({ success: true, id: eventId, status: 'sent' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update notification status' });
  }
});

app.get('/api/notifications/me', requireAuth, async (req, res) => {
  try {
    const unreadOnly = parseBooleanEnv(req.query?.unread_only, false);
    const requestedLimit = Number(req.query?.limit || 20);
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const params = [Number(req.authUser?.id || 0)];
    const rows = await dbAllAsync(
      `SELECT *
       FROM app_notifications
       WHERE user_id = ?
         ${unreadOnly ? 'AND COALESCE(is_read, 0) = 0' : ''}
       ORDER BY created_at DESC
       LIMIT ?`,
      unreadOnly ? [params[0], limit] : [params[0], limit]
    );
    const payload = (rows || []).map((row) => ({
      ...row,
      is_read: Number(row?.is_read || 0) === 1,
      metadata: parseJsonText(row?.metadata, null),
    }));
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load notifications' });
  }
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const notificationId = Number(req.params.id || 0);
    if (!notificationId) return res.status(400).json({ error: 'Invalid notification id' });
    const row = await dbGetAsync(
      `SELECT * FROM app_notifications WHERE id = ? AND user_id = ?`,
      [notificationId, Number(req.authUser?.id || 0)]
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    await dbRunAsync(
      `UPDATE app_notifications
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [notificationId, Number(req.authUser?.id || 0)]
    );
    return res.json({ success: true, id: notificationId, is_read: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
  }
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await dbRunAsync(
      `UPDATE app_notifications
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND COALESCE(is_read, 0) = 0`,
      [Number(req.authUser?.id || 0)]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to mark notifications as read' });
  }
});

app.get('/api/notifications/message-recipients', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    const requestedLimit = Number(req.query?.limit || 20);
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const like = `%${q}%`;
    const rows = q
      ? await dbAllAsync(
        `SELECT id, name, email, phone
         FROM users
         WHERE role = 'customer'
           AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
         ORDER BY name ASC
         LIMIT ?`,
        [like, like, like, limit]
      )
      : await dbAllAsync(
        `SELECT id, name, email, phone
         FROM users
         WHERE role = 'customer'
         ORDER BY name ASC
         LIMIT ?`,
        [limit]
      );
    return res.json(rows || []);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load recipients' });
  }
});

app.post('/api/notifications/messages/to-admin', requireAuth, async (req, res) => {
  try {
    const senderId = Number(req.authUser?.id || 0);
    if (!senderId) return res.status(401).json({ error: 'Unauthorized' });
    const senderRole = String(req.authUser?.role || '').trim().toLowerCase();
    if (senderRole === 'admin') {
      return res.status(400).json({ error: 'Admins should use customer message endpoint' });
    }
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 1000) return res.status(400).json({ error: 'Message is too long (max 1000 characters)' });
    const senderName = String(req.authUser?.name || '').trim() || `User #${senderId}`;

    await notifyAdmins({
      title: `Message from ${senderName}`,
      message,
      level: 'info',
      entityType: 'conversation',
      metadata: {
        kind: 'chat_message',
        direction: 'customer_to_admin',
        from_user_id: senderId,
        from_user_name: senderName,
        route: '/admin?tab=users',
      },
      createdBy: senderId,
    });

    await createAppNotification({
      userId: senderId,
      title: 'Message sent',
      message: 'Your message was sent to admin inbox.',
      level: 'success',
      entityType: 'conversation',
      metadata: {
        kind: 'chat_message',
        direction: 'outbound',
        route: '/profile',
      },
      createdBy: senderId,
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

app.post('/api/notifications/messages/to-customers', requireAdmin, async (req, res) => {
  try {
    const senderId = Number(req.authUser?.id || 0);
    const senderName = String(req.authUser?.name || '').trim() || 'Admin';
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 1000) return res.status(400).json({ error: 'Message is too long (max 1000 characters)' });
    const recipientIds = Array.from(new Set(
      (Array.isArray(req.body?.recipient_user_ids) ? req.body.recipient_user_ids : [])
        .map((value) => Number(value || 0))
        .filter((value) => value > 0)
    ));
    if (!recipientIds.length) {
      return res.status(400).json({ error: 'Select at least one customer' });
    }
    if (recipientIds.length > 100) {
      return res.status(400).json({ error: 'Too many recipients (max 100)' });
    }

    const placeholders = recipientIds.map(() => '?').join(', ');
    const recipients = await dbAllAsync(
      `SELECT id, name
       FROM users
       WHERE role = 'customer'
         AND id IN (${placeholders})
       ORDER BY name ASC`,
      recipientIds
    );
    if (!recipients.length) {
      return res.status(400).json({ error: 'No valid customer recipients found' });
    }

    for (const recipient of recipients) {
      const recipientId = Number(recipient?.id || 0);
      if (!recipientId) continue;
      await createAppNotification({
        userId: recipientId,
        title: `Message from ${senderName}`,
        message,
        level: 'info',
        entityType: 'conversation',
        metadata: {
          kind: 'chat_message',
          direction: 'admin_to_customer',
          from_user_id: senderId,
          from_user_name: senderName,
          route: '/profile',
        },
        createdBy: senderId,
      });
    }

    await createAppNotification({
      userId: senderId,
      title: 'Message sent',
      message: `Message sent to ${recipients.length} customer${recipients.length === 1 ? '' : 's'}.`,
      level: 'success',
      entityType: 'conversation',
      metadata: {
        kind: 'chat_message',
        direction: 'outbound',
        route: '/admin?tab=users',
      },
      createdBy: senderId,
    });

    return res.json({
      success: true,
      sent_count: recipients.length,
      recipient_names: recipients.map((row) => String(row?.name || '').trim()).filter(Boolean),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to send messages' });
  }
});

app.get('/api/admin/phone-change-requests', requireAdmin, async (req, res) => {
  try {
    await processPendingPhoneChangeRequests();
    const statusFilter = String(req.query?.status || 'open').trim().toLowerCase();
    const params = [];
    let whereClause = '';
    if (statusFilter === 'open') {
      whereClause = `WHERE pcr.status = ? AND COALESCE(pcr.needs_admin_review, 0) = 1`;
      params.push(PHONE_CHANGE_STATUS_PENDING);
    } else if (statusFilter === 'pending_validation') {
      whereClause = `WHERE pcr.status = ?`;
      params.push(PHONE_CHANGE_STATUS_PENDING);
    } else if (statusFilter === 'approved') {
      whereClause = `WHERE pcr.status = ?`;
      params.push(PHONE_CHANGE_STATUS_APPROVED);
    } else if (statusFilter === 'rejected') {
      whereClause = `WHERE pcr.status = ?`;
      params.push(PHONE_CHANGE_STATUS_REJECTED);
    } else if (statusFilter !== 'all') {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const rows = await dbAllAsync(
      `SELECT pcr.*,
              u.name AS user_name,
              u.email AS user_email,
              u.phone AS user_phone,
              cu.name AS conflict_user_name,
              cu.email AS conflict_user_email,
              r.name AS reviewed_by_name
       FROM phone_change_requests pcr
       LEFT JOIN users u ON u.id = pcr.user_id
       LEFT JOIN users cu ON cu.id = pcr.conflict_user_id
       LEFT JOIN users r ON r.id = pcr.reviewed_by
       ${whereClause}
       ORDER BY
         CASE pcr.status
           WHEN '${PHONE_CHANGE_STATUS_PENDING}' THEN 0
           WHEN '${PHONE_CHANGE_STATUS_APPROVED}' THEN 1
           WHEN '${PHONE_CHANGE_STATUS_REJECTED}' THEN 2
           ELSE 9
         END,
         COALESCE(pcr.needs_admin_review, 0) DESC,
         pcr.created_at DESC,
         pcr.id DESC`,
      params
    );
    const payload = (rows || []).map((row) => ({
      ...serializePhoneChangeRequest(row),
      user_name: row.user_name || null,
      user_email: row.user_email || null,
      user_phone: row.user_phone || null,
      conflict_user_name: row.conflict_user_name || null,
      conflict_user_email: row.conflict_user_email || null,
      reviewed_by_name: row.reviewed_by_name || null,
    }));
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load phone change requests' });
  }
});

app.post('/api/admin/phone-change-requests/:id/approve', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id || 0);
    if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
    const requestRow = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
    if (!requestRow) return res.status(404).json({ error: 'Phone change request not found' });
    if (normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING) {
      return res.status(400).json({ error: `Cannot approve request in status "${requestRow.status}"` });
    }

    const adminId = Number(req.authUser?.id || 0) || null;
    const adminNote = String(req.body?.admin_note || '').trim() || null;
    const approved = await approvePhoneChangeRequest({
      id: requestId,
      reviewedBy: adminId,
      decisionSource: PHONE_CHANGE_DECISION_ADMIN,
      adminNote: adminNote || 'Approved by admin',
    });
    if (!approved?.request) {
      return res.status(404).json({ error: 'Phone change request not found' });
    }
    const serialized = serializePhoneChangeRequest(approved.request);
    await notifyPhoneChangeApproved({
      userId: Number(serialized?.user_id || 0),
      requestId,
      newPhone: serialized?.new_phone || '',
      decisionSource: PHONE_CHANGE_DECISION_ADMIN,
    });
    await logAdminAuditAsync(req, {
      action: 'phone_change.approve',
      entityType: 'phone_change_request',
      entityId: requestId,
      details: {
        user_id: serialized?.user_id || null,
        new_phone: serialized?.new_phone || null,
        conflict_user_id: approved?.conflict_user_id || null,
      },
    });
    return res.json({
      success: true,
      message: 'Phone change request approved',
      request: serialized,
      user: sanitizeUser(approved.user),
    });
  } catch (error) {
    const status = Number(error?.status || 0) || 500;
    return res.status(status).json({ error: error.message || 'Failed to approve phone change request' });
  }
});

app.post('/api/admin/phone-change-requests/:id/reject', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id || 0);
    if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
    const requestRow = await dbGetAsync(`SELECT * FROM phone_change_requests WHERE id = ?`, [requestId]);
    if (!requestRow) return res.status(404).json({ error: 'Phone change request not found' });
    if (normalizePhoneChangeRequestStatus(requestRow.status, '') !== PHONE_CHANGE_STATUS_PENDING) {
      return res.status(400).json({ error: `Cannot reject request in status "${requestRow.status}"` });
    }

    const adminNote = String(req.body?.admin_note || '').trim() || null;
    const rejectionReason = String(req.body?.rejection_reason || '').trim() || null;
    const rejected = await rejectPhoneChangeRequest({
      id: requestId,
      reviewedBy: Number(req.authUser?.id || 0) || null,
      adminNote: adminNote || 'Rejected by admin',
      rejectionReason,
    });
    if (!rejected) return res.status(404).json({ error: 'Phone change request not found' });

    const serialized = serializePhoneChangeRequest(rejected);
    await notifyPhoneChangeRejected({
      userId: Number(serialized?.user_id || 0),
      requestId,
      reason: rejectionReason || adminNote,
    });
    await logAdminAuditAsync(req, {
      action: 'phone_change.reject',
      entityType: 'phone_change_request',
      entityId: requestId,
      details: {
        user_id: serialized?.user_id || null,
        new_phone: serialized?.new_phone || null,
        reason: rejectionReason || adminNote || null,
      },
    });
    return res.json({
      success: true,
      message: 'Phone change request rejected',
      request: serialized,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to reject phone change request' });
  }
});

app.get('/api/admin/contact-verification-requests', requireAdmin, async (req, res) => {
  try {
    const statusFilter = String(req.query?.status || 'open').trim().toLowerCase();
    const allowedStatuses = new Set(['pending', 'sent', 'rejected', 'completed']);
    const params = [];
    let whereClause = '';
    if (statusFilter === 'open') {
      whereClause = `WHERE cvr.status IN ('pending', 'sent')`;
    } else if (statusFilter === 'all') {
      whereClause = '';
    } else if (allowedStatuses.has(statusFilter)) {
      whereClause = `WHERE cvr.status = ?`;
      params.push(statusFilter);
    } else {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const rows = await dbAllAsync(
      `SELECT cvr.*,
              u.name AS user_name,
              u.email AS user_email,
              u.phone AS user_phone,
              u.email_verified,
              u.phone_verified,
              p.name AS processed_by_name
       FROM contact_verification_requests cvr
       LEFT JOIN users u ON u.id = cvr.user_id
       LEFT JOIN users p ON p.id = cvr.processed_by
       ${whereClause}
       ORDER BY
         CASE cvr.status
           WHEN 'pending' THEN 0
           WHEN 'sent' THEN 1
           WHEN 'rejected' THEN 2
           WHEN 'completed' THEN 3
           ELSE 9
         END,
         cvr.created_at DESC,
         cvr.id DESC`,
      params
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load verification requests' });
  }
});

app.post('/api/admin/contact-verification-requests/:id/approve-send', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id || 0);
    if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
    const requestRow = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
    if (!requestRow) return res.status(404).json({ error: 'Verification request not found' });

    const requestType = normalizeContactVerificationRequestType(requestRow.request_type);
    if (!requestType) return res.status(400).json({ error: 'Unsupported verification request type' });
    if (!['pending', 'sent'].includes(String(requestRow.status || '').toLowerCase())) {
      return res.status(400).json({ error: `Cannot approve request in status "${requestRow.status}"` });
    }

    const targetUser = await dbGetAsync(
      `SELECT id, name, email, phone, email_verified, phone_verified
       FROM users
       WHERE id = ?`,
      [requestRow.user_id]
    );
    if (!targetUser) return res.status(404).json({ error: 'User not found for this request' });

    const adminId = Number(req.authUser?.id || 0) || null;

    if (requestType === 'email') {
      const normalizedEmail = normalizeEmail(targetUser.email);
      if (!normalizedEmail) return res.status(400).json({ error: 'User does not have a valid email' });
      if (Number(targetUser.email_verified || 0) === 1) {
        await completeContactVerificationRequests({ userId: targetUser.id, requestType: 'email' });
        const updated = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
        return res.json({ success: true, message: 'Email is already verified', request: updated });
      }

      const delivery = await sendEmailVerificationChallenge({
        userId: targetUser.id,
        email: normalizedEmail,
        recipientName: targetUser.name,
        requestedBy: adminId,
        exposeTemplate: true,
        deliveryModeOverride: 'manual',
      });
      const updated = await markContactVerificationRequestSent({
        id: requestId,
        preparedEventId: delivery?.event_id,
        processedBy: adminId,
        adminNote: 'Approved by admin and verification email prepared',
      });
      return res.status(201).json({
        success: true,
        message: 'Email verification instructions prepared',
        request: updated,
        delivery,
        prepared_email: delivery?.email || null,
      });
    }

    const normalizedPhone = normalizePhone(targetUser.phone);
    if (!normalizedPhone) return res.status(400).json({ error: 'User does not have a valid phone number' });
    if (Number(targetUser.phone_verified || 0) === 1) {
      await completeContactVerificationRequests({ userId: targetUser.id, requestType: 'phone' });
      const updated = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
      return res.json({ success: true, message: 'Phone is already verified', request: updated });
    }

    const delivery = await sendPhoneVerificationChallenge({
      userId: targetUser.id,
      phone: normalizedPhone,
      recipientName: targetUser.name,
      requestedBy: adminId,
      exposeTemplate: true,
      deliveryModeOverride: 'manual',
    });
    const updated = await markContactVerificationRequestSent({
      id: requestId,
      preparedEventId: delivery?.event_id,
      processedBy: adminId,
      adminNote: 'Approved by admin and verification WhatsApp message prepared',
    });
    return res.status(201).json({
      success: true,
      message: 'Phone verification instructions prepared',
      request: updated,
      delivery,
      prepared_whatsapp: delivery?.whatsapp || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to approve verification request' });
  }
});

app.post('/api/admin/contact-verification-requests/:id/reject', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id || 0);
    if (!requestId) return res.status(400).json({ error: 'Invalid request id' });
    const requestRow = await dbGetAsync(`SELECT * FROM contact_verification_requests WHERE id = ?`, [requestId]);
    if (!requestRow) return res.status(404).json({ error: 'Verification request not found' });

    if (!['pending', 'sent'].includes(String(requestRow.status || '').toLowerCase())) {
      return res.status(400).json({ error: `Cannot reject request in status "${requestRow.status}"` });
    }

    const updated = await rejectContactVerificationRequest({
      id: requestId,
      processedBy: Number(req.authUser?.id || 0) || null,
      adminNote: String(req.body?.admin_note || '').trim() || 'Rejected by admin',
    });
    return res.json({ success: true, message: 'Verification request rejected', request: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to reject verification request' });
  }
});

app.post('/api/admin/users/:id/email/verify', requireAdmin, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id || 0);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'User does not have an email to verify' });
    }

    if (Number(user.email_verified || 0) !== 1) {
      await dbRunAsync(`UPDATE users SET email_verified = 1 WHERE id = ?`, [targetUserId]);
    }
    await dbRunAsync(
      `UPDATE email_verification_tokens
       SET used = 1
       WHERE user_id = ? AND email = ? AND used = 0`,
      [targetUserId, normalizedEmail]
    );
    await completeContactVerificationRequests({ userId: targetUserId, requestType: 'email' });
    await createNotificationEvent({
      type: 'email_verification_admin_override',
      channel: 'admin_action',
      recipient: normalizedEmail,
      recipientUserId: targetUserId,
      subject: 'Email verified by admin',
      body: `Admin #${Number(req.authUser?.id || 0)} manually marked email as verified.`,
      metadata: {
        action: 'mark_email_verified',
      },
      status: 'sent',
      preparedBy: Number(req.authUser?.id || 0) || null,
      sentBy: Number(req.authUser?.id || 0) || null,
    });
    const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]));
    return res.json({ success: true, user: updated, message: 'Email marked as verified by admin' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to verify email' });
  }
});

app.post('/api/admin/users/:id/phone/verify', requireAdmin, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id || 0);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const normalizedPhone = normalizePhone(user.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'User does not have a phone to verify' });
    }
    if (Number(user.phone_verified || 0) !== 1) {
      await dbRunAsync(`UPDATE users SET phone_verified = 1 WHERE id = ?`, [targetUserId]);
    }
    await dbRunAsync(
      `UPDATE phone_verification_tokens
       SET used = 1
       WHERE user_id = ? AND phone = ? AND used = 0`,
      [targetUserId, normalizedPhone]
    );
    await completeContactVerificationRequests({ userId: targetUserId, requestType: 'phone' });
    await createNotificationEvent({
      type: 'phone_verification_admin_override',
      channel: 'admin_action',
      recipient: normalizedPhone,
      recipientUserId: targetUserId,
      subject: 'Phone verified by admin',
      body: `Admin #${Number(req.authUser?.id || 0)} manually marked phone as verified.`,
      metadata: {
        action: 'mark_phone_verified',
      },
      status: 'sent',
      preparedBy: Number(req.authUser?.id || 0) || null,
      sentBy: Number(req.authUser?.id || 0) || null,
    });
    const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]));
    return res.json({ success: true, user: updated, message: 'Phone marked as verified by admin' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to verify phone' });
  }
});

app.get('/api/admin/password-reset-requests', requireAdmin, async (_, res) => {
  return res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR });
});

app.put('/api/admin/password-reset-requests/:id', requireAdmin, async (_, res) => {
  return res.status(410).json({ error: PASSWORD_AUTH_DISABLED_ERROR });
});

app.get('/api/users', requireAdmin, async (_, res) => {
  try {
    const users = (await dbAllAsync(`SELECT * FROM users ORDER BY created_at DESC`)).map(sanitizeUser);
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, role } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const phoneParsed = parsePhoneInput(phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    if (normalizedEmail && await dbGetAsync(`SELECT id FROM users WHERE email = ?`, [normalizedEmail])) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (normalizedPhone && await dbGetAsync(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone])) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }
    const userRole = role === 'admin' ? 'admin' : 'customer';
    const nextPassword = generateTemporaryPassword();
    const requestedEmailVerified = Number(req.body?.email_verified || 0) === 1;
    const requestedPhoneVerified = Number(req.body?.phone_verified || 0) === 1;
    const emailVerifiedValue = normalizedEmail ? (requestedEmailVerified ? 1 : 0) : 0;
    const phoneVerifiedValue = normalizedPhone ? (requestedPhoneVerified ? 1 : 0) : 0;
    const result = await dbRunAsync(
      `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userRole, String(name).trim(), normalizedEmail, emailVerifiedValue, normalizedPhone, phoneVerifiedValue, address || null, hashPassword(nextPassword), 0]
    );
    const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]));
    if (normalizedEmail && emailVerifiedValue === 0) {
      sendEmailVerificationChallenge({
        userId: user.id,
        email: normalizedEmail,
        recipientName: user.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
      }).catch(() => {});
    }
    if (normalizedPhone && phoneVerifiedValue === 0) {
      sendPhoneVerificationChallenge({
        userId: user.id,
        phone: normalizedPhone,
        recipientName: user.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
      }).catch(() => {});
    }
    return res.status(201).json({ success: true, user, message: 'User created successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser.role === 'admin';
    const isSelf = Number(req.authUser.id) === targetUserId;
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { name, email, phone, address, profile_image, role } = req.body || {};
    const current = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'User not found' });
    if (isAdmin && !isSelf) {
      if (current.role === 'admin') {
        return res.status(400).json({ error: 'Admin users cannot be modified' });
      }
      const emailVerified = Number(current.email_verified || 0) === 1;
      const phoneVerified = Number(current.phone_verified || 0) === 1;
      if (!emailVerified || !phoneVerified) {
        return res.status(403).json({ error: 'User type can be changed only when both email and phone are verified' });
      }
      const nextRole = String(role || current.role).trim().toLowerCase() === 'admin' ? 'admin' : 'customer';
      await dbRunAsync(`UPDATE users SET role = ? WHERE id = ?`, [nextRole, req.params.id]);
      const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
      return res.json(updated);
    }

    const phoneParsed = phone !== undefined ? parsePhoneInput(phone) : { value: current.phone, error: null };
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const requestedPhone = phoneParsed.value;
    const currentEmail = normalizeEmail(current.email);
    const currentPhone = normalizePhone(current.phone);
    const emailValue = email !== undefined ? normalizeEmail(email) : currentEmail;
    const emailChanged = email !== undefined && emailValue !== currentEmail;
    const phoneChangedRequested = phone !== undefined && requestedPhone !== currentPhone;

    if (emailValue) {
      const existing = await dbGetAsync(`SELECT id FROM users WHERE email = ? AND id != ?`, [emailValue, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Email already in use' });
    }

    if (requestedPhone) {
      const existing = await dbGetAsync(`SELECT id FROM users WHERE phone = ? AND id != ?`, [requestedPhone, req.params.id]);
      if (existing) {
        const allowDeferredSelfFlow = isSelf && !isAdmin && phoneChangedRequested;
        if (!allowDeferredSelfFlow) {
          return res.status(400).json({ error: 'Phone number already in use' });
        }
      }
    }

    const shouldQueuePhoneChangeRequest = isSelf && !isAdmin && phoneChangedRequested && Boolean(requestedPhone);
    const persistedPhone = shouldQueuePhoneChangeRequest ? currentPhone : requestedPhone;
    let emailVerifiedValue = Number(current.email_verified || 0) === 1 ? 1 : 0;
    let phoneVerifiedValue = Number(current.phone_verified || 0) === 1 ? 1 : 0;
    const phoneChangedPersisted = phone !== undefined && persistedPhone !== currentPhone;

    if (!emailValue) {
      emailVerifiedValue = 0;
    } else if (emailChanged) {
      emailVerifiedValue = isAdmin && Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
    } else if (isAdmin && email !== undefined && req.body?.email_verified !== undefined) {
      emailVerifiedValue = Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
    }
    if (!persistedPhone) {
      phoneVerifiedValue = 0;
    } else if (phoneChangedPersisted) {
      phoneVerifiedValue = isAdmin && Number(req.body?.phone_verified || 0) === 1 ? 1 : 0;
    } else if (isAdmin && phone !== undefined && req.body?.phone_verified !== undefined) {
      phoneVerifiedValue = Number(req.body?.phone_verified || 0) === 1 ? 1 : 0;
    }
    await dbRunAsync(
      `UPDATE users SET name = ?, email = ?, email_verified = ?, phone = ?, phone_verified = ?, address = ?, profile_image = ?, role = ? WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : current.name,
        emailValue,
        emailVerifiedValue,
        persistedPhone,
        phoneVerifiedValue,
        address !== undefined ? address : current.address,
        profile_image !== undefined ? (String(profile_image || '').trim() || null) : current.profile_image,
        current.role,
        req.params.id,
      ]
    );
    const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
    if (emailChanged && emailValue && emailVerifiedValue === 0) {
      sendEmailVerificationChallenge({
        userId: Number(req.params.id),
        email: emailValue,
        recipientName: name !== undefined ? String(name).trim() : current.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
      }).catch(() => {});
    }
    if (phoneChangedPersisted && persistedPhone && phoneVerifiedValue === 0) {
      sendPhoneVerificationChallenge({
        userId: Number(req.params.id),
        phone: persistedPhone,
        recipientName: name !== undefined ? String(name).trim() : current.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
      }).catch(() => {});
    }

    let phoneChangeRequest = null;
    if (shouldQueuePhoneChangeRequest) {
      const queued = await queuePhoneChangeRequest({
        userId: Number(req.params.id),
        oldPhone: currentPhone,
        newPhone: requestedPhone,
        requestedBy: Number(req.authUser?.id || 0) || null,
        requestedFromIp: getRequestIp(req),
      });
      if (queued) {
        phoneChangeRequest = serializePhoneChangeRequest(queued);
        await notifyPhoneChangeSubmitted({
          userId: Number(req.params.id),
          newPhone: requestedPhone,
        });
      }
    }

    if (!phoneChangeRequest) {
      return res.json(updated);
    }
    return res.json({
      ...updated,
      phone_change_request: phoneChangeRequest,
      message: phoneChangeRequest?.needs_admin_review
        ? 'Phone update request is pending admin review (1-5 days)'
        : 'Phone update request is pending validation and may auto-approve within 1 hour',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:id/profile-image', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser.role === 'admin';
    const isSelf = Number(req.authUser.id) === targetUserId;
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });

    const user = await dbGetAsync(`SELECT id, profile_image FROM users WHERE id = ?`, [targetUserId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const parsed = parseDataUrlImage(req.body?.image_base64);
    if (!parsed) return res.status(400).json({ error: 'Valid image_base64 data URL is required' });
    if (!PROFILE_IMAGE_ALLOWED_MIME.has(parsed.mimeType)) {
      return res.status(400).json({ error: 'Allowed image types: jpeg, png, webp' });
    }

    const imageBuffer = Buffer.from(parsed.base64, 'base64');
    if (!imageBuffer || !imageBuffer.length) {
      return res.status(400).json({ error: 'Invalid image payload' });
    }
    if (imageBuffer.length > PROFILE_IMAGE_MAX_BYTES) {
      return res.status(400).json({ error: 'Image exceeds 2MB limit' });
    }

    const fileExt = mimeToExt(parsed.mimeType);
    const fileName = `user_${targetUserId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
    const absPath = path.join(PROFILE_UPLOAD_DIR, fileName);
    fs.writeFileSync(absPath, imageBuffer);
    const nextPath = buildProfileImagePath(fileName);

    await dbRunAsync(`UPDATE users SET profile_image = ? WHERE id = ?`, [nextPath, targetUserId]);
    if (user.profile_image && user.profile_image !== nextPath) {
      deleteManagedProfileImage(user.profile_image);
    }

    const updated = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [targetUserId]));
    return res.json({ success: true, profile_image: nextPath, user: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin user' });
    await dbRunAsync(`DELETE FROM users WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'user.delete',
      entityType: 'user',
      entityId: req.params.id,
      details: { role: user.role || null, email: normalizeEmail(user.email) },
    });
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers', requireAdmin, async (_, res) => {
  try {
    const customers = await dbAllAsync(`SELECT id, name, email, phone, address, profile_image, created_at FROM users WHERE role = 'customer' ORDER BY name ASC`);
    return res.json(customers);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || req.query.name || '').trim();
    const limit = Number(req.query.limit || 20);
    if (!q) {
      const rows = await dbAllAsync(`SELECT id, name, email, phone, address, profile_image, created_at FROM users WHERE role='customer' ORDER BY name LIMIT ?`, [limit]);
      return res.json(rows);
    }
    const like = `%${q}%`;
    const rows = await dbAllAsync(
      `SELECT id, name, email, phone, address, profile_image, created_at
       FROM users
       WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
       ORDER BY name LIMIT ?`,
      [like, like, like, limit]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const validateCustomerProfile = (user, addressObj) => {
  const issues = [];
  if (!user?.phone || normalizePhone(user.phone)?.length < 10) {
    issues.push({ field: 'phone', message: 'Mobile number is required' });
  }
  const emailVerified = Number(user?.email_verified || 0) === 1;
  const phoneVerified = Number(user?.phone_verified || 0) === 1;
  if (!emailVerified && !phoneVerified) {
    issues.push({ field: 'verification', message: 'Verify at least one contact method (email or phone) before placing orders' });
  }
  if (!addressObj?.street) issues.push({ field: 'street', message: 'Street address is required' });
  if (!addressObj?.city) issues.push({ field: 'city', message: 'City is required' });
  if (!addressObj?.state) issues.push({ field: 'state', message: 'State is required' });
  if (!addressObj?.zip) issues.push({ field: 'zip', message: 'Postal code is required' });
  return { complete: issues.length === 0, issues };
};

app.get('/api/customers/:id/profile', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid customer id' });
    if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await dbGetAsync(`SELECT id, name, email, email_verified, phone, phone_verified, address, profile_image, role FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    let address = {};
    if (user.address) {
      try {
        address = JSON.parse(user.address);
      } catch (_) {
        address = { street: user.address };
      }
    }
    return res.json({
      ...user,
      address,
      profileComplete: validateCustomerProfile(user, address),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/validate-customer', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.body?.user_id || 0);
    if (!userId) return res.status(400).json({ error: 'MISSING_CUSTOMER', message: 'Customer ID is required' });
    if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await dbGetAsync(`SELECT id, name, email, email_verified, phone, phone_verified, address, role FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    let address = {};
    if (user.address) {
      try {
        address = JSON.parse(user.address);
      } catch (_) {
        address = { street: user.address };
      }
    }
    const validation = validateCustomerProfile(user, address);
    return res.json({
      valid: validation.complete,
      isAdmin: user.role === 'admin',
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        email_verified: Number(user.email_verified || 0) === 1,
        phone: user.phone,
        phone_verified: Number(user.phone_verified || 0) === 1,
        address,
      },
      validation,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const qName = String(req.query?.name || '').trim();
    const qCategory = String(req.query?.category || '').trim();
    const qLowStock = String(req.query?.low_stock || '').trim();
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const status = String(req.query?.status || '').trim().toLowerCase();
    let sql = `SELECT * FROM products WHERE 1=1`;
    const params = [];
    if (status === 'active') {
      sql += ` AND COALESCE(is_active, 1) = 1`;
    } else if (status === 'inactive') {
      sql += ` AND COALESCE(is_active, 1) = 0`;
    } else if (!includeInactive) {
      sql += ` AND COALESCE(is_active, 1) = 1`;
    }
    if (qName) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR barcode LIKE ?)`;
      const like = `%${qName}%`;
      params.push(like, like, like, like);
    }
    if (qCategory) {
      sql += ` AND category = ?`;
      params.push(qCategory);
    }
    if (qLowStock === 'true') {
      sql += ` AND stock <= 10`;
    }
    sql += ` ORDER BY created_at DESC`;
    const rows = await dbAllAsync(sql, params);
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id(\\d+)/last-purchase', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Invalid product id' });

    const row = await dbGetAsync(
      `SELECT
         poi.product_id,
         COALESCE(NULLIF(poi.rate, 0), poi.unit_price, 0) as rate,
         poi.unit_price,
         poi.gst_rate,
         poi.uom,
         po.distributor_id,
         d.name as distributor_name,
         po.po_number,
         po.created_at
       FROM purchase_order_items poi
       INNER JOIN purchase_orders po ON po.id = poi.order_id
       LEFT JOIN distributors d ON d.id = po.distributor_id
       WHERE poi.product_id = ?
       ORDER BY po.created_at DESC, poi.id DESC
       LIMIT 1`,
      [productId]
    );

    if (!row) return res.json({ found: false, product_id: productId });
    return res.json({ found: true, ...row });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id(\\d+)', async (req, res) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const product = await dbGetAsync(
      `SELECT * FROM products WHERE id = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'}`,
      [req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json(normalizeProductRecord(product));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/category/:category', async (req, res) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = await dbAllAsync(
      `SELECT * FROM products WHERE category = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'} ORDER BY created_at DESC`,
      [req.params.category]
    );
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const body = normalizeProductInput(req.body || {});
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const duplicate = await findProductConflictAsync(body);
    if (duplicate) {
      const allowIdentical = Boolean(req.body?.allow_identical);
      if (duplicate.severity === 'confirm' && allowIdentical) {
        // allowed by explicit user choice
      } else {
        return res.status(409).json({
          error: duplicate.message,
          field: duplicate.field,
          conflict_type: duplicate.conflict_type,
          conflict: duplicate
        });
      }
    }
    const categoryName = await resolveOrCreateCategoryNameAsync(body.category || 'Groceries');
    const result = await dbRunAsync(
      `INSERT INTO products
      (name, description, brand, sub_brand, content, color, price, mrp, uom, sku, barcode, image, stock, category, subcategory, expiry_date, default_discount, discount_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || null,
        body.brand || null,
        body.sub_brand || null,
        body.content || null,
        body.color || null,
        Number(body.price || 0),
        body.mrp != null ? Number(body.mrp) : Number(body.price || 0),
        body.uom || 'pcs',
        body.sku,
        body.barcode,
        body.image || null,
        Number(body.stock || 0),
        categoryName,
        body.subcategory || null,
        body.expiry_date || null,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
      ]
    );
    return res.status(201).json(normalizeProductRecord(await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [result.lastInsertRowid])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    const body = normalizeProductInput(req.body || {}, current);
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    if (Number(current.is_active ?? 1) !== 1) {
      body.is_active = 1;
    }
    const duplicate = await findProductConflictAsync(body, { excludeId: req.params.id });
    if (duplicate) {
      const allowIdentical = Boolean(req.body?.allow_identical);
      if (duplicate.severity === 'confirm' && allowIdentical) {
        // allowed by explicit user choice
      } else {
        return res.status(409).json({
          error: duplicate.message,
          field: duplicate.field,
          conflict_type: duplicate.conflict_type,
          conflict: duplicate
        });
      }
    }
    const categoryName = await resolveOrCreateCategoryNameAsync(body.category || current.category || 'Groceries');
    await dbRunAsync(
      `UPDATE products SET
       name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
       WHERE id=?`,
      [
        body.name,
        body.description,
        body.brand,
        body.sub_brand,
        body.content,
        body.color,
        Number(body.price),
        Number(body.mrp),
        body.uom,
        body.sku,
        body.barcode,
        body.image,
        Number(body.stock),
        categoryName,
        body.subcategory,
        body.expiry_date,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
        req.params.id,
      ]
    );
    return res.json(normalizeProductRecord(await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    await dbRunAsync(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'product.deactivate',
      entityType: 'product',
      entityId: req.params.id,
      details: { name: current.name || null },
    });
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const logStockLedgerAsync = async ({
  productId,
  transactionType,
  quantityChange,
  previousBalance,
  newBalance,
  referenceType = null,
  referenceId = null,
  userId = null,
  userName = null,
  notes = null,
}) => {
  const product = await dbGetAsync(`SELECT name, sku FROM products WHERE id = ?`, [productId]);
  await dbRunAsync(
    `INSERT INTO stock_ledger
    (product_id, product_name, sku, transaction_type, quantity_change, previous_balance, new_balance, reference_type, reference_id, user_id, user_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      product?.name || null,
      product?.sku || null,
      transactionType,
      Number(quantityChange || 0),
      Number(previousBalance || 0),
      Number(newBalance || 0),
      referenceType || null,
      referenceId || null,
      userId || null,
      userName || null,
      notes || null,
    ]
  );
};

const doesTableExistAsync = async (tableName) => Boolean(
  (await dbGetAsync(
    `SELECT 1 AS ok
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ?
     LIMIT 1`,
    [tableName]
  ))?.ok
);

app.delete('/api/products/:id(\\d+)/permanent', requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!current) return res.status(404).json({ error: 'Product not found' });

    const referenceChecks = [
      { table: 'order_items', sql: `SELECT COUNT(*) as count FROM order_items WHERE product_id = ?` },
      { table: 'purchase_order_items', sql: `SELECT COUNT(*) as count FROM purchase_order_items WHERE product_id = ?` },
      { table: 'purchase_return_items', sql: `SELECT COUNT(*) as count FROM purchase_return_items WHERE product_id = ?` },
      { table: 'stock_ledger', sql: `SELECT COUNT(*) as count FROM stock_ledger WHERE product_id = ?` },
      { table: 'batch_stock', sql: `SELECT COUNT(*) as count FROM batch_stock WHERE product_id = ?` },
    ];

    const blockingRefs = [];
    for (const check of referenceChecks) {
      if (!await doesTableExistAsync(check.table)) continue;
      const count = Number((await dbGetAsync(check.sql, [productId]))?.count || 0);
      if (count > 0) blockingRefs.push(`${check.table} (${count})`);
    }
    if (blockingRefs.length) {
      return res.status(409).json({
        error: `Cannot permanently delete product. Referenced in: ${blockingRefs.join(', ')}`,
        references: blockingRefs,
      });
    }

    await dbRunAsync(`DELETE FROM products WHERE id = ?`, [productId]);
    await logAdminAuditAsync(req, {
      action: 'product.permanent_delete',
      entityType: 'product',
      entityId: productId,
      details: { name: current.name || null },
    });
    return res.json({ success: true, message: 'Product permanently deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/template', requireAdmin, async (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase();
    const rows = [PRODUCT_IMPORT_SAMPLE];
    if (format === 'xlsx' || format === 'xls') {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Products');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="products-template.xlsx"');
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/export', requireAdmin, async (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase();
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = (await dbAllAsync(
      `SELECT * FROM products ${includeInactive ? '' : 'WHERE COALESCE(is_active,1)=1'} ORDER BY created_at DESC`
    )).map(toProductExportRow);
    if (format === 'xlsx' || format === 'xls') {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Products');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/products/import/preview', requireAdmin, async (req, res) => {
  try {
    cleanupExpiredImportBatches();
    const mode = String(req.body?.mode || 'upsert').trim().toLowerCase();
    const stockMode = String(req.body?.stock_mode || 'replace').trim().toLowerCase();
    if (!['create_only', 'update_only', 'upsert'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use create_only, update_only or upsert' });
    }
    if (!['replace', 'delta'].includes(stockMode)) {
      return res.status(400).json({ error: 'Invalid stock_mode. Use replace or delta' });
    }

    const rows = parseProductFileToRows({
      fileName: req.body?.file_name,
      fileContentBase64: req.body?.file_content_base64,
    });

    const normalizedRows = [];
    const preview = [];
    let creates = 0;
    let updates = 0;
    let skips = 0;
    let errors = 0;
    let needsConfirmation = 0;
    const seenInBatch = {
      productIds: new Map(),
      sku: new Map(),
      barcode: new Map(),
      identity: new Map(),
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNo = index + 2;
      const existing = await findExistingProductForImportAsync(row);
      const action = existing ? 'update' : 'create';
      const normalized = normalizeProductInput(
        {
          ...row,
          stock: stockMode === 'delta' && existing
            ? Number(existing.stock || 0) + Number(row.stock || 0)
            : row.stock,
        },
        existing || null
      );
      const rowErrors = validateProductPayload(normalized);

      if (mode === 'create_only' && existing) rowErrors.push('Row matches existing product but mode is create_only');
      if (mode === 'update_only' && !existing) rowErrors.push('Row does not match an existing product but mode is update_only');
      const duplicate = await findProductConflictAsync(normalized, { excludeId: existing?.id || null });
      let requiresIdenticalConfirmation = false;
      let warnings = [];
      if (duplicate) {
        if (duplicate.severity === 'confirm') {
          requiresIdenticalConfirmation = true;
          warnings = [duplicate.message];
        } else {
          rowErrors.push(duplicate.message);
        }
      }

      const matchedId = existing?.id ? Number(existing.id) : null;
      if (matchedId) {
        const seenProductRow = seenInBatch.productIds.get(matchedId);
        if (seenProductRow) rowErrors.push(`Duplicate update target in import file (also row ${seenProductRow})`);
      }
      const skuKey = normalizeTextKey(normalized.sku);
      if (skuKey) {
        const seenSkuRow = seenInBatch.sku.get(skuKey);
        if (seenSkuRow) rowErrors.push(`Duplicate SKU in import file (also row ${seenSkuRow})`);
      }
      const barcodeKey = normalizeTextKey(normalized.barcode);
      if (barcodeKey) {
        const seenBarcodeRow = seenInBatch.barcode.get(barcodeKey);
        if (seenBarcodeRow) rowErrors.push(`Duplicate barcode in import file (also row ${seenBarcodeRow})`);
      }
      const identityKey = buildProductExactKey(normalized);
      if (identityKey) {
        const seenIdentityRow = seenInBatch.identity.get(identityKey);
        if (seenIdentityRow) rowErrors.push(`Exact duplicate in import file (also row ${seenIdentityRow})`);
      }

      if (rowErrors.length) {
        errors += 1;
        preview.push({ row: rowNo, action, status: 'error', errors: rowErrors, matched_product_id: existing?.id || null });
        return;
      }

      if (matchedId) seenInBatch.productIds.set(matchedId, rowNo);
      if (skuKey) seenInBatch.sku.set(skuKey, rowNo);
      if (barcodeKey) seenInBatch.barcode.set(barcodeKey, rowNo);
      if (identityKey) seenInBatch.identity.set(identityKey, rowNo);

      normalizedRows.push({
        row: rowNo,
        action,
        matched_product_id: existing?.id || null,
        payload: normalized,
        barcode: normalized.barcode,
        requires_identical_confirmation: requiresIdenticalConfirmation,
      });

      if (action === 'create') creates += 1;
      if (action === 'update') updates += 1;
      if (requiresIdenticalConfirmation) {
        needsConfirmation += 1;
      }
      preview.push({
        row: rowNo,
        action,
        status: requiresIdenticalConfirmation ? 'needs_confirmation' : 'ready',
        errors: [],
        warnings,
        matched_product_id: existing?.id || null
      });
    }

    if (!normalizedRows.length) {
      return res.status(400).json({
        error: 'No valid rows found in import file',
        preview,
      });
    }

    const batchId = crypto.randomUUID();
    const checksum = createImportBatchChecksum(normalizedRows, mode, stockMode);
    const createdAt = Date.now();
    const expiresAt = createdAt + PRODUCT_IMPORT_BATCH_TTL_MS;

    const batchPayload = {
      mode,
      stockMode,
      rows: normalizedRows,
      createdBy: req.authUser?.id || null,
      createdAt,
      expiresAt,
    };
    productImportBatches.set(batchId, {
      ...batchPayload,
      checksum,
    });
    await dbRunAsync(SQL_UPSERT_IMPORT_BATCH, [
      batchId,
      'products',
      req.authUser?.id || null,
      JSON.stringify(batchPayload),
      checksum,
      errors ? 'staged_with_errors' : 'staged',
      expiresAt,
    ]);

    const responsePayload = {
      batch_id: batchId,
      checksum,
      expires_at: new Date(expiresAt).toISOString(),
      summary: {
        creates,
        updates,
        skips,
        errors,
        needs_confirmation: needsConfirmation,
      },
      preview,
    };

    if (Boolean(req.body?.auto_confirm)) {
      const applied = await applyProductImportBatch({
        batchId,
        checksum,
        authUser: req.authUser,
      });
      responsePayload.auto_confirmed = true;
      responsePayload.apply_result = applied.result;
      responsePayload.notification = {
        type: 'success',
        title: 'Product import completed',
        message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
      };
    }

    return res.json(responsePayload);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/products/import/confirm', requireAdmin, async (req, res) => {
  try {
    const applied = await applyProductImportBatch({
      batchId: req.body?.batch_id,
      checksum: req.body?.checksum,
      authUser: req.authUser,
      allowIdenticalRows: req.body?.allow_identical_rows,
    });
    return res.json({
      success: true,
      ...applied.result,
      notification: {
        type: 'success',
        title: 'Product import completed',
        message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.get('/api/categories', async (_, res) => {
  try {
    const rows = await dbAllAsync(`SELECT id, name, description, created_at FROM categories ORDER BY name ASC`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const result = await dbRunAsync(`INSERT INTO categories (name, description) VALUES (?, ?)`, [name, req.body?.description || null]);
    return res.status(201).json(await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    const current = await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Category not found' });
    await dbRunAsync(`UPDATE categories SET name=?, description=? WHERE id=?`, [
      req.body?.name ?? current.name,
      req.body?.description ?? current.description,
      req.params.id,
    ]);
    return res.json(await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM categories WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', requireAdmin, async (_, res) => {
  try {
    const orders = await dbAllAsync(`SELECT * FROM orders ORDER BY created_at DESC`);
    return res.json(orders.map((order) => ({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const canAccessOrder = (authUser, order) => {
  if (!authUser || !order) return false;
  if (authUser.role === 'admin') return true;
  const ownerId = Number(order.user_id || order.customer_id || 0);
  return ownerId > 0 && Number(authUser.id) === ownerId;
};

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrder(req.authUser, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const items = await dbAllAsync(
      `SELECT oi.*,
              COALESCE(NULLIF(oi.product_name, ''), p.name, 'Item') AS product_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [req.params.id]
    );
    return res.json({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
      items,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id/history', requireAuth, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrder(req.authUser, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = await dbAllAsync(
      `SELECT h.id, h.order_id, h.status, h.description, h.created_by, h.created_at, u.name as created_by_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.order_id = ?
       ORDER BY h.created_at DESC`,
      [req.params.id]
    );
    return res.json(rows.map((row) => ({
      ...row,
      status: normalizeOrderStatus(row?.status, ORDER_STATUS_ORDERED),
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/number/:orderNumber', requireAuth, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM orders WHERE order_number = ?`, [req.params.orderNumber]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrder(req.authUser, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const items = await dbAllAsync(
      `SELECT oi.*,
              COALESCE(NULLIF(oi.product_name, ''), p.name, 'Item') AS product_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [order.id]
    );
    return res.json({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
      items,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/orders', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
    if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const orders = await dbAllAsync(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`, [req.params.userId]);
    return res.json(orders.map((order) => ({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const placeOrder = async (payload) => {
  const {
    user_id = null,
    customer_name,
    customer_email = '',
    customer_phone = null,
    shipping_address = {},
    items = [],
    payment_method = 'cash',
  } = payload;

  if (!customer_name || !items.length) {
    throw new Error('Missing required fields');
  }
  if (!Number(user_id)) {
    throw new Error('AUTH_REQUIRED: Login is required to place orders');
  }
  const normalizedCustomerEmail = normalizeEmail(customer_email) || '';
  const account = await dbGetAsync(`SELECT id, role, email_verified, phone_verified FROM users WHERE id = ?`, [user_id]);
  if (!account) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }
  if (
    String(account.role || '').toLowerCase() !== 'admin' &&
    Number(account.email_verified || 0) !== 1 &&
    Number(account.phone_verified || 0) !== 1
  ) {
    throw new Error('INCOMPLETE_PROFILE: Verify at least one contact method (email or phone) before placing orders');
  }
  const phoneParsed = parsePhoneInput(customer_phone);
  if (phoneParsed.error) {
    throw new Error(phoneParsed.error);
  }
  const normalizedCustomerPhone = phoneParsed.value;

  const parsedItems = items.map((it, index) => {
    const parsedProductId = Number(it?.product_id ?? it?.id ?? 0);
    const productId = Number.isFinite(parsedProductId) && parsedProductId > 0
      ? Math.trunc(parsedProductId)
      : null;
    let quantity = Number(it?.quantity || 0);
    const providedName = String(it?.product_name || it?.name || '').trim();
    const quantityLabel = String(it?.quantity_label || it?.qty_text || '').trim();
    const itemType = String(it?.item_type || '').trim().toLowerCase();
    const manualHint = parseBooleanEnv(it?.is_manual, false) || itemType === 'manual';
    const isManual = manualHint || !productId;
    if ((!Number.isFinite(quantity) || quantity <= 0) && quantityLabel) {
      const quantityFromLabel = Number(String(quantityLabel).match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
      if (Number.isFinite(quantityFromLabel) && quantityFromLabel > 0) {
        quantity = quantityFromLabel;
      }
    }
    const rawPrice = Number(it?.price);
    const priceUnknownHint = parseBooleanEnv(it?.price_unknown, false) || parseBooleanEnv(it?.unknown_price, false);
    let price = Number.isFinite(rawPrice) ? rawPrice : NaN;
    if (isManual && (priceUnknownHint || !Number.isFinite(price) || price < 0)) {
      price = 0;
    }
    return {
      line_index: index,
      // Keep backward compatibility for older schemas where product_id can still be NOT NULL.
      // product_id=0 is treated as manual everywhere in this codebase.
      product_id: isManual ? 0 : productId,
      product_name: providedName,
      quantity,
      price,
      is_manual: isManual ? 1 : 0,
    };
  });
  if (parsedItems.some((it) => it.quantity <= 0 || !Number.isFinite(it.quantity))) {
    throw new Error('Invalid order items');
  }
  if (parsedItems.some((it) => it.price < 0 || !Number.isFinite(it.price))) {
    throw new Error('Invalid order items');
  }
  if (parsedItems.some((it) => it.is_manual === 1 && !it.product_name)) {
    throw new Error('Manual order items must include a product name');
  }

  for (const it of parsedItems) {
    if (it.is_manual === 1) continue;
    const p = await dbGetAsync(`SELECT id, name, stock FROM products WHERE id = ?`, [it.product_id]);
    if (!p) throw new Error(`Product ${it.product_id} not found`);
    if (Number(p.stock) < it.quantity) throw new Error(`Insufficient stock for product ${it.product_id}`);
    if (!it.product_name) {
      it.product_name = String(p.name || '').trim() || 'Item';
    }
  }

  const normalizedPaymentMethod = normalizePaymentMethod(payment_method);
  const subtotal = parsedItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;
  const orderNumber = generateOrderNumber();
  const createdStatus = ORDER_STATUS_ORDERED;

  return await dbTxAsync(async () => {
    const orderInsert = await dbRunAsync(
      `INSERT INTO orders
      (order_number, user_id, customer_name, customer_email, customer_phone, shipping_address, total_amount, status, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        user_id,
        customer_name,
        normalizedCustomerEmail,
        normalizedCustomerPhone,
        JSON.stringify(shipping_address || {}),
        total,
        createdStatus,
        normalizedPaymentMethod,
        normalizeOrderPaymentStatus('pending', createdStatus),
      ]
    );
    const orderId = orderInsert.lastInsertRowid;

    for (const it of parsedItems) {
      await dbRunAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, is_manual, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          Number(it.is_manual || 0) === 1 ? 0 : (it.product_id || null),
          it.product_name || null,
          Number(it.is_manual || 0) === 1 ? 1 : 0,
          it.quantity,
          it.price,
          it.price * it.quantity
        ]
      );
    }
    await dbRunAsync(
      `INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`,
      [orderId, createdStatus, 'Order placed', user_id]
    );

    return { orderId, orderNumber, totalAmount: total };
  });
};

app.post('/api/orders', requireAuth, async (_, res) =>
  res.status(410).json({ error: 'Legacy order endpoint is disabled. Use /api/orders/create-validated.' })
);

app.post('/api/orders/create-validated', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const authUser = req.authUser;
    const isAdminOrder = Boolean(body.is_admin_order) && authUser.role === 'admin';
    const effectiveUserId = isAdminOrder
      ? (Number(body.selected_customer_id || body.user_id || 0) || null)
      : Number(authUser.id);
    if (body.is_admin_order && authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required for admin order mode' });
    }
    if (isAdminOrder && !body.selected_customer_id) {
      return res.status(400).json({ error: 'Selected customer is required for admin order' });
    }
    if (effectiveUserId) {
      const customer = await dbGetAsync(
        `SELECT id, name, email_verified, phone_verified, phone, address, role FROM users WHERE id = ?`,
        [effectiveUserId]
      );
      if (!customer) {
        return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
      }
      let address = {};
      if (customer.address) {
        try {
          address = JSON.parse(customer.address);
        } catch (_) {
          address = { street: customer.address };
        }
      }
      if (String(customer.role || '').toLowerCase() !== 'admin') {
        const submittedAddress = (body.shipping_address && typeof body.shipping_address === 'object')
          ? body.shipping_address
          : {};
        const mergedAddress = {
          street: String(submittedAddress.street || address.street || '').trim(),
          city: String(submittedAddress.city || address.city || '').trim(),
          state: String(submittedAddress.state || address.state || '').trim(),
          zip: String(submittedAddress.zip || address.zip || '').trim(),
          country: String(submittedAddress.country || address.country || '').trim(),
        };
        const profileForValidation = {
          ...customer,
          phone: String(body.customer_phone || customer.phone || '').trim(),
        };
        const validation = validateCustomerProfile(profileForValidation, mergedAddress);
        if (!validation.complete) {
          return res.status(400).json({
            error: 'INCOMPLETE_PROFILE',
            message: 'Customer profile is incomplete',
            issues: validation.issues,
          });
        }
      }
    }

    const result = await placeOrder({
      ...body,
      user_id: effectiveUserId,
      customer_phone: body.customer_phone,
      shipping_address: body.shipping_address || {},
      payment_method: 'cash',
    });
    const orderId = Number(result?.orderId || 0);
    const orderNumber = String(result?.orderNumber || '').trim();
    const customerName = String(body.customer_name || '').trim() || `User #${effectiveUserId}`;
    const actorName = String(authUser?.name || '').trim() || 'System';
    try {
      if (orderId && effectiveUserId) {
        await createAppNotification({
          userId: Number(effectiveUserId),
          title: 'Order placed',
          message: `Order ${orderNumber || `#${orderId}`} has been placed successfully.`,
          level: 'success',
          entityType: 'order',
          entityId: orderId,
          metadata: {
            order_id: orderId,
            order_number: orderNumber || null,
            user_id: Number(effectiveUserId),
          },
          createdBy: Number(authUser?.id || 0) || null,
        });
      }
      if (orderId) {
        await notifyAdmins({
          title: 'New order placed',
          message: `${customerName} placed order ${orderNumber || `#${orderId}`}${isAdminOrder ? ` (created by ${actorName})` : ''}.`,
          level: 'info',
          entityType: 'order',
          entityId: orderId,
          metadata: {
            order_id: orderId,
            order_number: orderNumber || null,
            user_id: Number(effectiveUserId || 0) || null,
            created_by_admin: isAdminOrder ? Number(authUser?.id || 0) || null : null,
          },
          createdBy: Number(authUser?.id || 0) || null,
        });
      }
    } catch (notifyError) {
      console.warn('[NOTIFY] order placement notification failed:', notifyError?.message || notifyError);
    }
    return res.status(201).json({ success: true, ...result, message: 'Order placed successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const requestedStatus = normalizeOrderStatus(req.body?.status, '');
    if (!requestedStatus) return res.status(400).json({ error: 'Status is required' });
    if (requestedStatus !== ORDER_STATUS_RECEIVED) {
      return res.status(400).json({ error: 'Only received confirmation is allowed' });
    }
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const currentStatus = normalizeOrderStatus(order.status, ORDER_STATUS_ORDERED);
    if (currentStatus === ORDER_STATUS_RECEIVED) {
      return res.json({ success: true, applied: false, message: 'Order is already marked as received' });
    }
    if (currentStatus !== ORDER_STATUS_ORDERED) {
      return res.status(400).json({ error: 'Order is not in ordered state' });
    }

    // record status change in history
    const createdBy = req.body?.created_by || null;
    const description = req.body?.description || null;
    const items = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]);
    await dbTxAsync(async () => {
      for (const item of items) {
        const productId = Number(item?.product_id || 0);
        const isManual = Number(item?.is_manual || 0) === 1 || !productId;
        if (isManual) continue;
        const current = await dbGetAsync(`SELECT id, stock FROM products WHERE id = ?`, [item.product_id]);
        if (!current) throw new Error(`Product ${item.product_id} not found`);
        if (Number(current.stock) < Number(item.quantity)) {
          throw new Error(`Insufficient stock for product ${item.product_id}`);
        }
        const before = Number(current.stock);
        await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.product_id]);
        const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
        await logStockLedgerAsync({
          productId: item.product_id,
          transactionType: 'SALE',
          quantityChange: -Number(item.quantity),
          previousBalance: before,
          newBalance: Number(after),
          referenceType: 'ORDER',
          referenceId: String(req.params.id),
          userId: order.user_id || null,
        });
      }

      await dbRunAsync(
        `INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`,
        [req.params.id, ORDER_STATUS_RECEIVED, description || 'Order received/confirmed', createdBy]
      );
      await dbRunAsync(
        `UPDATE orders
         SET status = ?, payment_method = ?, payment_status = ?, stock_applied = 1, credit_applied = 0
          WHERE id = ?`,
        [ORDER_STATUS_RECEIVED, 'cash', normalizeOrderPaymentStatus('paid', ORDER_STATUS_RECEIVED), req.params.id]
      );
    });

    await logAdminAuditAsync(req, {
      action: 'order.status_update',
      entityType: 'order',
      entityId: req.params.id,
      details: {
        status: ORDER_STATUS_RECEIVED,
        applied: true,
        stock_applied: 1,
      },
    });
    try {
      if (Number(order?.user_id || 0)) {
        await createAppNotification({
          userId: Number(order.user_id),
          title: 'Order received',
          message: `Order ${order.order_number || `#${order.id}`} has been marked as received.`,
          level: 'success',
          entityType: 'order',
          entityId: Number(order.id || req.params.id),
          metadata: {
            order_id: Number(order.id || req.params.id),
            order_number: order.order_number || null,
            user_id: Number(order.user_id || 0) || null,
          },
          createdBy: Number(req.authUser?.id || 0) || null,
        });
      }
    } catch (notifyError) {
      console.warn('[NOTIFY] order status notification failed:', notifyError?.message || notifyError);
    }
    return res.json({ success: true, applied: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/api/stats/orders', requireAdmin, async (_, res) => {
  try {
    const totalOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders`))?.count || 0;
    const totalRevenue = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders`))?.total || 0;
    const pendingOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders WHERE status = ?`, [ORDER_STATUS_ORDERED]))?.count || 0;
    return res.json({
      totalOrders,
      totalRevenue,
      pendingOrders,
      byStatus: { ordered: pendingOrders },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/bills', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = await dbAllAsync(
      `SELECT *
       FROM bills
       WHERE customer_id = ?
       ORDER BY created_at DESC`,
      [requestUserId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/bills/:identifier', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const identifier = String(req.params.identifier || '').trim();
    const bill = await dbGetAsync(
      `SELECT *
       FROM bills
       WHERE customer_id = ?
         AND (id = ? OR bill_number = ?)
       LIMIT 1`,
      [requestUserId, identifier, identifier]
    );
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await dbAllAsync(`SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC`, [bill.id]);
    return res.json({ ...bill, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-recommendations', requireAuth, async (req, res) => {
  try {
    const requestedName = String(req.body?.requested_name || req.body?.name || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const phoneParsed = parsePhoneInput(req.body?.contact_phone || req.body?.phone || req.authUser?.phone || null);
    if (phoneParsed.error && (req.body?.contact_phone || req.body?.phone)) {
      return res.status(400).json({ error: phoneParsed.error });
    }
    if (!requestedName) {
      return res.status(400).json({ error: 'Requested product name is required' });
    }
    const result = await dbRunAsync(
      `INSERT INTO product_recommendations (user_id, requested_name, notes, contact_phone, status)
       VALUES (?, ?, ?, ?, ?)`,
      [req.authUser.id, requestedName, notes || null, phoneParsed.value || null, 'open']
    );
    const created = await dbGetAsync(`SELECT * FROM product_recommendations WHERE id = ?`, [result.lastInsertRowid]);
    const recommendationId = Number(created?.id || 0) || Number(result.lastInsertRowid || 0) || null;
    try {
      await createAppNotification({
        userId: Number(req.authUser?.id || 0),
        title: 'Product request received',
        message: `Your product request "${requestedName}" was submitted.`,
        level: 'success',
        entityType: 'product_recommendation',
        entityId: recommendationId,
        metadata: {
          recommendation_id: recommendationId,
          user_id: Number(req.authUser?.id || 0) || null,
          requested_name: requestedName,
          status: 'open',
        },
        createdBy: Number(req.authUser?.id || 0) || null,
      });
      await notifyAdmins({
        title: 'New product request',
        message: `${String(req.authUser?.name || '').trim() || `User #${req.authUser?.id}`} requested "${requestedName}".`,
        level: 'info',
        entityType: 'product_recommendation',
        entityId: recommendationId,
        metadata: {
          recommendation_id: recommendationId,
          user_id: Number(req.authUser?.id || 0) || null,
          requested_name: requestedName,
          status: 'open',
        },
        createdBy: Number(req.authUser?.id || 0) || null,
      });
    } catch (notifyError) {
      console.warn('[NOTIFY] product recommendation notification failed:', notifyError?.message || notifyError);
    }
    return res.status(201).json({ success: true, recommendation: created });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-recommendations/mine', requireAuth, async (req, res) => {
  try {
    const rows = await dbAllAsync(
      `SELECT *
       FROM product_recommendations
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.authUser.id]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/product-recommendations', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query?.status || '').trim().toLowerCase();
    const allowed = new Set(['open', 'reviewed', 'fulfilled', 'rejected']);
    const rows = await dbAllAsync(
      `SELECT pr.*,
              u.name as user_name,
              u.email as user_email,
              u.phone as user_phone
       FROM product_recommendations pr
       LEFT JOIN users u ON u.id = pr.user_id
       ${allowed.has(status) ? 'WHERE pr.status = ?' : ''}
       ORDER BY pr.created_at DESC`,
      allowed.has(status) ? [status] : []
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/product-recommendations/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid recommendation id' });
    const status = String(req.body?.status || '').trim().toLowerCase();
    const allowed = new Set(['open', 'reviewed', 'fulfilled', 'rejected']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const adminNote = String(req.body?.admin_note || '').trim() || null;
    const current = await dbGetAsync(`SELECT * FROM product_recommendations WHERE id = ?`, [id]);
    if (!current) return res.status(404).json({ error: 'Recommendation not found' });
    await dbRunAsync(
      `UPDATE product_recommendations
       SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        status,
        adminNote,
        req.authUser.id,
        status === 'fulfilled' || status === 'rejected' ? new Date().toISOString() : null,
        id,
      ]
    );
    const updated = await dbGetAsync(`SELECT * FROM product_recommendations WHERE id = ?`, [id]);
    await logAdminAuditAsync(req, {
      action: 'product_recommendation.update',
      entityType: 'product_recommendation',
      entityId: id,
      details: { status, admin_note: adminNote },
    });
    try {
      if (Number(updated?.user_id || 0)) {
        await createAppNotification({
          userId: Number(updated.user_id),
          title: 'Product request updated',
          message: `Your product request "${updated.requested_name || `#${id}`}" is now ${status.replace(/_/g, ' ')}${adminNote ? `: ${adminNote}` : ''}.`,
          level: status === 'fulfilled' ? 'success' : (status === 'rejected' ? 'warning' : 'info'),
          entityType: 'product_recommendation',
          entityId: id,
          metadata: {
            recommendation_id: id,
            user_id: Number(updated.user_id || 0) || null,
            status,
          },
          createdBy: Number(req.authUser?.id || 0) || null,
        });
      }
    } catch (notifyError) {
      console.warn('[NOTIFY] product recommendation update notification failed:', notifyError?.message || notifyError);
    }
    return res.json({ success: true, recommendation: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/credit-history', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = await dbAllAsync(
      `SELECT *
       FROM credit_history
       WHERE user_id = ?
       ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC`,
      [req.params.userId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:userId/credit-issues', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
    if (Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const creditEntryId = Number(req.body?.credit_entry_id || 0) || null;
    const issueType = String(req.body?.issue_type || 'wrong_entry').trim().toLowerCase();
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Issue message is required' });
    const allowedIssueTypes = new Set(['wrong_entry', 'missing_entry', 'wrong_amount', 'other']);
    if (!allowedIssueTypes.has(issueType)) {
      return res.status(400).json({ error: 'Invalid issue type' });
    }

    let entry = null;
    if (creditEntryId) {
      entry = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ? AND user_id = ?`, [creditEntryId, requestUserId]);
      if (!entry) return res.status(404).json({ error: 'Credit entry not found for this user' });
    }

    const result = await dbRunAsync(
      `INSERT INTO credit_entry_issues
       (user_id, credit_entry_id, issue_type, message, status, entry_snapshot, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        requestUserId,
        creditEntryId,
        issueType,
        message,
        'open',
        entry ? JSON.stringify(entry) : null,
        req.authUser.id,
      ]
    );
    const created = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [result.lastInsertRowid]);
    const reporterName = String(req.authUser?.name || '').trim() || `User #${requestUserId}`;
    await notifyAdmins({
      title: 'New credit issue reported',
      message: `${reporterName} reported issue #${created?.id || ''} (${issueType.replace(/_/g, ' ')})`,
      level: 'warning',
      entityType: 'credit_entry_issue',
      entityId: Number(created?.id || 0) || null,
      issueId: Number(created?.id || 0) || null,
      metadata: {
        user_id: requestUserId,
        issue_id: Number(created?.id || 0) || null,
        credit_entry_id: creditEntryId || null,
        issue_type: issueType,
      },
      createdBy: Number(req.authUser?.id || 0) || null,
    });
    return res.status(201).json({ success: true, issue: created });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/credit-issues', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const requestedStatus = String(req.query?.status || '').trim().toLowerCase();
    const normalizedStatus = requestedStatus
      ? normalizeCreditIssueStatus(requestedStatus, { fallback: '' })
      : '';
    if (requestedStatus && !normalizedStatus) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }
    const rows = await dbAllAsync(
      `SELECT cei.*,
              corr.amount as correction_amount,
              corr.type as correction_type,
              corr.reference as correction_reference
       FROM credit_entry_issues cei
       LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
       WHERE cei.user_id = ?
         ${normalizedStatus ? 'AND cei.status = ?' : ''}
       ORDER BY cei.created_at DESC`,
      normalizedStatus ? [requestUserId, normalizedStatus] : [requestUserId]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/credit-issues', requireAdmin, async (req, res) => {
  try {
    const requestedStatus = String(req.query?.status || '').trim().toLowerCase();
    const normalizedStatus = requestedStatus
      ? normalizeCreditIssueStatus(requestedStatus, { fallback: '' })
      : '';
    if (requestedStatus && !normalizedStatus) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }
    const rows = await dbAllAsync(
      `SELECT cei.*,
              u.name as user_name,
              u.email as user_email,
              ch.amount as credit_amount,
              ch.balance as credit_balance,
              ch.reference as credit_reference,
              corr.amount as correction_amount,
              corr.type as correction_type,
              corr.reference as correction_reference
       FROM credit_entry_issues cei
       LEFT JOIN users u ON u.id = cei.user_id
       LEFT JOIN credit_history ch ON ch.id = cei.credit_entry_id
       LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
       ${normalizedStatus ? 'WHERE cei.status = ?' : ''}
       ORDER BY cei.created_at DESC`,
      normalizedStatus ? [normalizedStatus] : []
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/credit-issues/:id', requireAdmin, async (req, res) => {
  try {
    const issueId = Number(req.params.id);
    if (!issueId) return res.status(400).json({ error: 'Invalid issue id' });
    const requestedAction = String(req.body?.action || req.body?.status || '').trim().toLowerCase();
    let status = normalizeCreditIssueStatus(requestedAction, { fallback: '' });
    if (!status) {
      if (requestedAction === 'correct' || requestedAction === 'mark_corrected' || requestedAction === 'resolved') {
        status = 'corrected';
      } else if (requestedAction === 'reject' || requestedAction === 'mark_rejected') {
        status = 'rejected';
      } else if (requestedAction === 'review' || requestedAction === 'mark_in_review') {
        status = 'in_review';
      }
    }

    const adminReason = String(req.body?.admin_reason || req.body?.resolution_note || '').trim() || null;

    const correctionType = String(req.body?.correction_type || '').trim().toLowerCase();
    const correctionAmount = Number(req.body?.correction_amount || 0);
    const correctionDescription = String(req.body?.correction_description || '').trim();
    const correctionReference = String(req.body?.correction_reference || '').trim();
    const correctionDateRaw = String(req.body?.correction_date || '').trim();
    if (correctionDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(correctionDateRaw)) {
      return res.status(400).json({ error: 'correction_date must be YYYY-MM-DD' });
    }
    const shouldCreateCorrectionEntry = (
      (correctionType === 'given' || correctionType === 'payment')
      && Number.isFinite(correctionAmount)
      && correctionAmount > 0
    );
    if (!status) {
      if (shouldCreateCorrectionEntry) {
        status = 'corrected';
      } else if (adminReason) {
        status = 'rejected';
      } else {
        status = 'in_review';
      }
    }
    if (status === 'rejected' && !adminReason) {
      return res.status(400).json({ error: 'Reason is required when rejecting an issue' });
    }
    const shouldInsertCorrection = status === 'corrected' && shouldCreateCorrectionEntry;

    const updated = await dbTxAsync(async () => {
      const existing = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [issueId]);
      if (!existing) {
        const notFound = new Error('Credit issue not found');
        notFound.code = 'NOT_FOUND';
        throw notFound;
      }

      let correctionEntryId = Number(existing.correction_entry_id || 0) || null;
      if (shouldInsertCorrection) {
        const userId = Number(existing.user_id || 0);
        const latest = await getLatestCreditEntryAsync(userId);
        const currentBalance = Number(latest?.balance || 0);
        const amountAbs = Math.abs(correctionAmount);
        const nextBalance = correctionType === 'payment'
          ? (currentBalance - amountAbs)
          : (currentBalance + amountAbs);
        const derivedDescription = correctionDescription
          || `Correction for issue #${issueId}${adminReason ? `: ${adminReason}` : ''}`;
        const insert = await dbRunAsync(
          `INSERT INTO credit_history
           (user_id, type, amount, balance, description, reference, transaction_date, created_by, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            userId,
            correctionType,
            amountAbs,
            nextBalance,
            derivedDescription,
            correctionReference || `ISSUE-${issueId}`,
            correctionDateRaw || null,
            Number(req.authUser?.id || 0) || null,
          ]
        );
        correctionEntryId = Number(insert.lastInsertRowid || 0) || null;
        await recalculateCreditBalancesForUser(userId);
      }

      const isFinal = status === 'corrected' || status === 'rejected';
      await dbRunAsync(
        `UPDATE credit_entry_issues
         SET status = ?,
             resolution_note = ?,
             admin_reason = ?,
             resolved_by = ?,
             resolved_at = ?,
             correction_entry_id = ?,
             customer_response_status = ?,
             customer_response_note = NULL,
             customer_response_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          status,
          adminReason,
          adminReason,
          Number(req.authUser?.id || 0) || null,
          isFinal ? new Date().toISOString() : null,
          correctionEntryId,
          isFinal ? 'pending' : null,
          issueId,
        ]
      );
      return await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [issueId]);
    });

    const issueDetails = await dbGetAsync(
      `SELECT cei.*,
              u.name as user_name,
              u.email as user_email,
              corr.amount as correction_amount,
              corr.type as correction_type,
              corr.reference as correction_reference
       FROM credit_entry_issues cei
       LEFT JOIN users u ON u.id = cei.user_id
       LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
       WHERE cei.id = ?`,
      [issueId]
    );

    if (Number(updated?.user_id || 0)) {
      await createAppNotification({
        userId: Number(updated.user_id),
        title: 'Credit issue updated',
        message: `Issue #${issueId} marked as ${status.replace(/_/g, ' ')}${adminReason ? `: ${adminReason}` : ''}`,
        level: status === 'corrected' ? 'success' : (status === 'rejected' ? 'warning' : 'info'),
        entityType: 'credit_entry_issue',
        entityId: issueId,
        issueId,
        metadata: {
          status,
          user_id: Number(updated?.user_id || 0) || null,
          issue_id: issueId,
          credit_entry_id: Number(updated?.credit_entry_id || 0) || null,
          correction_entry_id: Number(updated?.correction_entry_id || 0) || null,
        },
        createdBy: Number(req.authUser?.id || 0) || null,
      });
    }

    await logAdminAuditAsync(req, {
      action: 'credit_issue.update',
      entityType: 'credit_entry_issue',
      entityId: issueId,
      details: {
        status,
        resolution_note: adminReason,
        user_id: Number(updated?.user_id || 0),
        credit_entry_id: Number(updated?.credit_entry_id || 0),
        correction_entry_id: Number(updated?.correction_entry_id || 0),
      },
    });
    return res.json({ success: true, issue: issueDetails || updated });
  } catch (error) {
    if (error?.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Credit issue not found' });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:userId/credit-issues/:id/respond', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId || 0);
    const issueId = Number(req.params.id || 0);
    if (!requestUserId || !issueId) {
      return res.status(400).json({ error: 'Invalid user id or issue id' });
    }
    if (Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const responseStatus = String(req.body?.response_status || '').trim().toLowerCase();
    if (responseStatus !== 'acknowledged' && responseStatus !== 'disputed') {
      return res.status(400).json({ error: 'response_status must be acknowledged or disputed' });
    }
    const responseNote = String(req.body?.message || req.body?.note || '').trim() || null;
    if (responseStatus === 'disputed' && !responseNote) {
      return res.status(400).json({ error: 'Please describe what is still wrong' });
    }

    const existing = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ? AND user_id = ?`, [issueId, requestUserId]);
    if (!existing) return res.status(404).json({ error: 'Credit issue not found' });

    const nextStatus = (
      responseStatus === 'disputed'
      && normalizeCreditIssueStatus(existing.status, { fallback: 'open' }) === 'corrected'
    )
      ? 'in_review'
      : normalizeCreditIssueStatus(existing.status, { fallback: 'open' });

    await dbRunAsync(
      `UPDATE credit_entry_issues
       SET status = ?,
           customer_response_status = ?,
           customer_response_note = ?,
           customer_response_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [nextStatus, responseStatus, responseNote, issueId, requestUserId]
    );
    const updated = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [issueId]);

    await notifyAdmins({
      title: 'Customer responded to credit issue',
      message: `Issue #${issueId} response: ${responseStatus}${responseNote ? ` - ${responseNote}` : ''}`,
      level: responseStatus === 'disputed' ? 'warning' : 'info',
      entityType: 'credit_entry_issue',
      entityId: issueId,
      issueId,
      metadata: {
        user_id: requestUserId,
        issue_id: issueId,
        credit_entry_id: Number(existing?.credit_entry_id || 0) || null,
        response_status: responseStatus,
      },
      createdBy: Number(req.authUser?.id || 0) || null,
    });

    return res.json({ success: true, issue: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to submit response' });
  }
});

app.get('/api/users/:userId/credit-balance', requireAuth, async (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const row = await dbGetAsync(
      `SELECT balance
       FROM credit_history
       WHERE user_id = ?
       ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC
       LIMIT 1`,
      [req.params.userId]
    );
    return res.json({ balance: row?.balance || 0 });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:userId/credit', requireAdmin, async (req, res) => {
  let clientRequestId = null;
  try {
    const idempotency = resolveClientRequestId(req);
    if (idempotency.error) return res.status(400).json({ error: idempotency.error });
    clientRequestId = idempotency.value;
    if (clientRequestId) {
      const existingByRequest = await dbGetAsync(`SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existingByRequest) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          balance: Number(existingByRequest.balance || 0),
          transaction: existingByRequest,
        });
      }
    }

    const { type, amount, description, reference, transactionDate } = req.body || {};
    if (!type || !['given', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    const normalizedDescription = String(description || '').trim();
    const normalizedReference = String(reference || '').trim();
    const createdById = Number(req.authUser?.id || 0);
    const last = await getLatestCreditEntryAsync(req.params.userId);
    const current = Number(last?.balance || 0);
    const next = type === 'given' ? current + parsedAmount : current - parsedAmount;
    const normalizedDate = transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(String(transactionDate))
      ? String(transactionDate)
      : null;

    if (CREDIT_ENTRY_DEDUP_WINDOW_MS > 0) {
      const transactionDateCompareSql = `COALESCE(transaction_date::text, '')`;
      const maybeDuplicate = await dbGetAsync(
        `SELECT id, created_at, balance
         FROM credit_history
         WHERE user_id = ?
           AND type = ?
           AND amount = ?
           AND COALESCE(description, '') = ?
           AND COALESCE(reference, '') = ?
           AND ${transactionDateCompareSql} = ?
           AND COALESCE(created_by, 0) = ?
         ORDER BY id DESC
         LIMIT 1`,
        [
          req.params.userId,
          type,
          parsedAmount,
          normalizedDescription,
          normalizedReference,
          normalizedDate || '',
          createdById,
        ]
      );
      if (maybeDuplicate) {
        const createdAtMs = toTimestampMs(maybeDuplicate.created_at);
        const ageMs = createdAtMs > 0 ? Date.now() - createdAtMs : Number.POSITIVE_INFINITY;
        if (ageMs >= 0 && ageMs <= CREDIT_ENTRY_DEDUP_WINDOW_MS) {
          const existing = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [maybeDuplicate.id]);
          return res.status(200).json({
            success: true,
            deduplicated: true,
            message: 'Duplicate submit prevented',
            balance: Number(maybeDuplicate.balance || current),
            transaction: existing,
          });
        }
      }
    }

    const result = await dbRunAsync(
      `INSERT INTO credit_history (user_id, type, amount, balance, description, reference, transaction_date, created_by, client_request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.userId,
        type,
        parsedAmount,
        next,
        normalizedDescription || null,
        normalizedReference || null,
        normalizedDate,
        createdById || null,
        clientRequestId,
      ]
    );
    const transaction = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [result.lastInsertRowid]);
    await logAdminAuditAsync(req, {
      action: 'credit.create',
      entityType: 'credit_history',
      entityId: result.lastInsertRowid,
      requestId: clientRequestId,
      details: {
        user_id: Number(req.params.userId || 0),
        type,
        amount: parsedAmount,
        transaction_date: normalizedDate,
      },
    });
    return res.status(201).json({
      success: true,
      balance: next,
      transaction,
    });
  } catch (error) {
    if (clientRequestId && isUniqueViolationError(error)) {
      const existingByRequest = await dbGetAsync(`SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existingByRequest) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          balance: Number(existingByRequest.balance || 0),
          transaction: existingByRequest,
        });
      }
    }
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:userId/credit/:entryId', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const entryId = Number(req.params.entryId);
    if (!userId || !entryId) {
      return res.status(400).json({ error: 'Invalid user or transaction id' });
    }

    const existing = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ? AND user_id = ?`, [entryId, userId]);
    if (!existing) {
      return res.status(404).json({ error: 'Credit transaction not found' });
    }

    const latest = await getLatestCreditEntryAsync(userId);
    if (!latest || Number(latest.id) !== entryId) {
      return res.status(400).json({ error: 'Only the latest transaction for this customer can be edited' });
    }

    const { type, amount, description, reference, transactionDate } = req.body || {};
    if (!type || !['given', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const normalizedDate = transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(String(transactionDate))
      ? String(transactionDate)
      : null;

    await dbRunAsync(
      `UPDATE credit_history
       SET type = ?, amount = ?, description = ?, reference = ?, transaction_date = ?, edited = 1, edited_at = CURRENT_TIMESTAMP, edited_by = ?
       WHERE id = ? AND user_id = ?`,
      [
        type,
        parsedAmount,
        description || null,
        reference || null,
        normalizedDate,
        req.authUser?.id || null,
        entryId,
        userId
      ]
    );

    const nextBalance = await recalculateCreditBalancesForUser(userId);
    const updated = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [entryId]);
    await logAdminAuditAsync(req, {
      action: 'credit.update',
      entityType: 'credit_history',
      entityId: entryId,
      details: {
        user_id: userId,
        type,
        amount: parsedAmount,
        transaction_date: normalizedDate,
      },
    });

    return res.json({
      success: true,
      balance: Number(nextBalance || 0),
      transaction: updated
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/credit/ledger', requireAdmin, async (req, res) => {
  try {
    const selectedUserId = Number(req.query.user_id || 0);
    const rows = selectedUserId
      ? await dbAllAsync(
        `SELECT ch.*, u.name AS customer_name
         FROM credit_history ch
         LEFT JOIN users u ON u.id = ch.user_id
         WHERE ch.user_id = ?
         ORDER BY COALESCE(ch.transaction_date, ch.created_at) ASC, ch.id ASC`,
        [selectedUserId]
      )
      : await dbAllAsync(
        `SELECT ch.*, u.name AS customer_name
         FROM credit_history ch
         LEFT JOIN users u ON u.id = ch.user_id
         ORDER BY COALESCE(ch.transaction_date, ch.created_at) ASC, ch.id ASC`
      );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/credit/check-limit', requireAuth, async (req, res) => {
  try {
    const customerId = req.body?.customer_id;
    const additionalAmount = Number(req.body?.additional_amount || 0);
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
    const user = await dbGetAsync(`SELECT id, name, credit_limit FROM users WHERE id = ?`, [customerId]);
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    const last = await getLatestCreditEntryAsync(customerId);
    const currentBalance = Number(last?.balance || 0);
    const creditLimit = Number(user.credit_limit || 0);
    const projected = currentBalance + additionalAmount;
    const allowed = creditLimit <= 0 ? true : projected <= creditLimit;
    return res.json({
      allowed,
      customer_id: user.id,
      customer_name: user.name,
      current_balance: currentBalance,
      additional_amount: additionalAmount,
      projected_balance: projected,
      credit_limit: creditLimit,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/credit/aging', requireAdmin, async (_, res) => {
  try {
    const reportSql = `
      SELECT
        u.id as customer_id,
        u.name as customer_name,
        u.email,
        u.phone,
        COALESCE(u.credit_limit, 0) as credit_limit,
        COALESCE((SELECT balance FROM credit_history ch WHERE ch.user_id = u.id ORDER BY COALESCE(ch.transaction_date, ch.created_at) DESC, ch.id DESC LIMIT 1), 0) as current_balance,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) <= 30), 0) as days_0_30,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) > 30 AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) <= 60), 0) as days_31_60,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) > 60 AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) <= 90), 0) as days_61_90,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) > 90), 0) as days_over_90
      FROM users u
      WHERE u.role = 'customer'
      ORDER BY current_balance DESC, u.name ASC
    `;
    const report = await dbAllAsync(reportSql);
    const summary = report.reduce(
      (acc, r) => {
        acc.total_outstanding += Number(r.current_balance || 0);
        acc.aging_0_30 += Number(r.days_0_30 || 0);
        acc.aging_31_60 += Number(r.days_31_60 || 0);
        acc.aging_61_90 += Number(r.days_61_90 || 0);
        acc.aging_over_90 += Number(r.days_over_90 || 0);
        if (Number(r.days_31_60 || 0) > 0 || Number(r.days_61_90 || 0) > 0 || Number(r.days_over_90 || 0) > 0) {
          acc.customers_overdue += 1;
        }
        return acc;
      },
      { total_outstanding: 0, customers_overdue: 0, aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_over_90: 0 }
    );
    return res.json({ report, summary });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors', requireAdmin, async (_, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM distributors ORDER BY name ASC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id', requireAdmin, async (req, res) => {
  try {
    const row = await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Distributor not found' });
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/distributors', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Distributor name is required' });
    const result = await dbRunAsync(
      `INSERT INTO distributors (name, salesman_name, contacts, address, products_supplied, order_day, delivery_day, payment_terms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(b.name).trim(),
        b.salesman_name || null,
        b.contacts || null,
        b.address || null,
        b.products_supplied || null,
        b.order_day || null,
        b.delivery_day || null,
        b.payment_terms || 'Net 30',
        b.status || 'active',
      ]
    );
    return res.status(201).json(await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/distributors/:id', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Distributor not found' });
    const b = req.body || {};
    await dbRunAsync(
      `UPDATE distributors
       SET name=?, salesman_name=?, contacts=?, address=?, products_supplied=?, order_day=?, delivery_day=?, payment_terms=?, status=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        b.name ?? cur.name,
        b.salesman_name ?? cur.salesman_name,
        b.contacts ?? cur.contacts,
        b.address ?? cur.address,
        b.products_supplied ?? cur.products_supplied,
        b.order_day ?? cur.order_day,
        b.delivery_day ?? cur.delivery_day,
        b.payment_terms ?? cur.payment_terms,
        b.status ?? cur.status,
        req.params.id,
      ]
    );
    return res.json(await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/distributors/:id', requireAdmin, async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM distributors WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const getDistributorLedgerRows = async (req, distributorIdOverride = null) => {
  let sql = `
    SELECT dl.*, d.name as distributor_name,
           po.bill_number as po_bill_number,
           po.invoice_number as po_invoice_number,
           COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
    FROM distributor_ledger dl
    LEFT JOIN distributors d ON d.id = dl.distributor_id
    LEFT JOIN purchase_orders po
      ON dl.source = 'purchase_order'
     AND ${SQL_CAST_TO_INT} = po.id
    WHERE 1=1
  `;
  const params = [];
  const distributorId = distributorIdOverride ?? req.query.distributor_id;
  if (distributorId) {
    sql += ` AND dl.distributor_id = ?`;
    params.push(distributorId);
  }
  if (req.query.type) {
    sql += ` AND LOWER(dl.type) = LOWER(?)`;
    params.push(req.query.type);
  }
  if (req.query.start_date) {
    sql += ` AND date(COALESCE(dl.transaction_date, dl.created_at)) >= date(?)`;
    params.push(req.query.start_date);
  }
  if (req.query.end_date) {
    sql += ` AND date(COALESCE(dl.transaction_date, dl.created_at)) <= date(?)`;
    params.push(req.query.end_date);
  }
  sql += ` ORDER BY COALESCE(dl.transaction_date, dl.created_at) DESC, dl.id DESC`;
  if (req.query.limit) {
    const limit = Math.max(1, Number(req.query.limit) || 100);
    sql += ` LIMIT ${limit}`;
  }
  return await dbAllAsync(sql, params);
};

const createDistributorLedgerEntry = async (distributorIdRaw, body = {}) => {
  const distributorId = Number(distributorIdRaw || body.distributor_id || body.user_id);
  if (!distributorId) throw new Error('distributor_id is required');

  const distributor = await dbGetAsync(`SELECT id FROM distributors WHERE id = ?`, [distributorId]);
  if (!distributor) throw new Error('Distributor not found');

  const rawAmount = Math.abs(Number(body.amount || 0));
  if (!rawAmount) throw new Error('amount must be greater than 0');

  const type = normalizeDistributorLedgerType(body.type || body.transaction_type);
  const signedAmount = type === 'payment' ? -rawAmount : rawAmount;
  const last = await dbGetAsync(
    `SELECT balance FROM distributor_ledger WHERE distributor_id = ? ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC LIMIT 1`,
    [distributorId]
  );
  const previousBalance = Number(last?.balance || 0);
  const nextBalance = previousBalance + signedAmount;
  const transactionDateRaw = body.transaction_date || body.transactionDate || null;
  const transactionDate = transactionDateRaw ? String(transactionDateRaw).slice(0, 10) : null;
  const paymentMode = body.payment_mode || body.mode || null;
  const billNumberRaw = body.bill_number ?? body.billNo ?? body.invoice_number;
  const billNumber = billNumberRaw === undefined || billNumberRaw === null ? null : String(billNumberRaw).trim() || null;
  const sourceIdRaw = body.source_id;
  const sourceIdText = sourceIdRaw === undefined || sourceIdRaw === null ? '' : String(sourceIdRaw).trim();
  const sourceId = sourceIdText
    ? (/^[0-9]+(?:\.0+)?$/.test(sourceIdText) ? String(parseInt(sourceIdText, 10)) : sourceIdText)
    : null;

  const result = await dbRunAsync(
    `INSERT INTO distributor_ledger
    (distributor_id, type, amount, balance, payment_mode, reference, bill_number, description, transaction_date, source, source_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      distributorId,
      type,
      rawAmount,
      nextBalance,
      paymentMode,
      body.reference || null,
      billNumber,
      body.description || null,
      transactionDate,
      body.source || null,
      sourceId,
      body.created_by || null,
    ]
  );

  return await dbGetAsync(
    `SELECT dl.*, d.name as distributor_name,
            po.bill_number as po_bill_number,
            po.invoice_number as po_invoice_number,
            COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
     FROM distributor_ledger dl
     LEFT JOIN distributors d ON d.id = dl.distributor_id
     LEFT JOIN purchase_orders po
       ON dl.source = 'purchase_order'
      AND ${SQL_CAST_TO_INT} = po.id
     WHERE dl.id = ?`,
    [result.lastInsertRowid]
  );
};

app.get('/api/distributor-ledger', requireAdmin, async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/ledger', requireAdmin, async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id/ledger', requireAdmin, async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req, req.params.id));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id/credit-history', requireAdmin, async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req, req.params.id));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const handleDistributorLedgerCreate = async (req, res, distributorId = null) => {
  try {
    const row = await createDistributorLedgerEntry(distributorId, req.body || {});
    return res.status(201).json(row);
  } catch (error) {
    const message = String(error.message || '');
    if (message.includes('required') || message.includes('not found') || message.includes('greater than 0')) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
};

app.post('/api/distributor-ledger', requireAdmin, async (req, res) => handleDistributorLedgerCreate(req, res));
app.post('/api/distributors/ledger', requireAdmin, async (req, res) => handleDistributorLedgerCreate(req, res));
app.post('/api/distributors/:id/ledger', requireAdmin, async (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));
app.post('/api/distributors/:id/transactions', requireAdmin, async (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));
app.post('/api/distributors/:id/credit', requireAdmin, async (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));

app.get('/api/purchase-orders', requireAdmin, async (req, res) => {
  try {
    let sql = `
      SELECT po.*, d.name as distributor_name
      FROM purchase_orders po
      LEFT JOIN distributors d ON d.id = po.distributor_id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.distributor_id) {
      sql += ` AND po.distributor_id = ?`;
      params.push(req.query.distributor_id);
    }
    if (req.query.status) {
      sql += ` AND po.status = ?`;
      params.push(req.query.status);
    }
    if (req.query.start_date) {
      sql += ` AND date(po.created_at) >= date(?)`;
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      sql += ` AND date(po.created_at) <= date(?)`;
      params.push(req.query.end_date);
    }
    sql += ` ORDER BY po.created_at DESC`;
    const baseRows = await dbAllAsync(sql, params);
    const rows = await Promise.all(baseRows.map(async (row) => {
      const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [row.id]);
      return { ...row, items };
    }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    const row = await dbGetAsync(
      `SELECT po.*, d.name as distributor_name, d.address as distributor_address, d.contacts as distributor_contacts
       FROM purchase_orders po
       LEFT JOIN distributors d ON d.id = po.distributor_id
       WHERE po.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Purchase order not found' });
    const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [row.id]);
    return res.json({ ...row, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders', requireAdmin, async (req, res) => {
  let clientRequestId = null;
  try {
    const b = req.body || {};
    const idempotency = resolveClientRequestId(req);
    if (idempotency.error) return res.status(400).json({ error: idempotency.error });
    clientRequestId = idempotency.value;
    if (clientRequestId) {
      const existing = await dbGetAsync(`SELECT id, po_number FROM purchase_orders WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          id: Number(existing.id),
          po_number: existing.po_number,
        });
      }
    }

    if (!b.distributor_id) return res.status(400).json({ error: 'distributor_id is required' });
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'At least one item is required' });

    const normalizedItems = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate ?? it.unit_price ?? 0);
      const gross = qty * rate;
      const discountType = String(it.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
      const discountValue = Number(it.discount_value || 0);
      const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
      const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
      const taxableValue = Number(it.taxable_value ?? (gross - discountAmount));
      const gstRate = Number(it.gst_rate || 0);
      const taxAmount = Number(it.tax_amount ?? ((taxableValue * gstRate) / 100));
      const lineTotal = Number(it.line_total ?? (taxableValue + taxAmount));

      return {
        ...it,
        quantity: qty,
        rate,
        unit_price: rate,
        discount_type: discountType,
        discount_value: discountValue,
        taxable_value: taxableValue,
        gst_rate: gstRate,
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });

    const subtotal = Number(b.subtotal ?? b.taxable_value ?? normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0));
    const taxAmount = Number(b.tax_amount ?? normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0));
    const totalAmount = Number(
      b.total_amount ??
      b.grand_total ??
      b.total ??
      normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
    );

    const poNumber = generatePONumber();
    const orderId = await dbTxAsync(async () => {
      const header = await dbRunAsync(
        `INSERT INTO purchase_orders (po_number, distributor_id, subtotal, tax_amount, total_amount, total, status, notes, expected_delivery, created_by, client_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [poNumber, b.distributor_id, subtotal, taxAmount, totalAmount, totalAmount, 'pending', b.notes || null, b.expected_delivery || null, b.created_by || null, clientRequestId]
      );
      const orderId = header.lastInsertRowid;
      for (const it of normalizedItems) {
        const fallbackName = it.product_id
          ? (await dbGetAsync(`SELECT name FROM products WHERE id = ?`, [it.product_id]))?.name
          : null;
        await dbRunAsync(
          `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            it.product_id || null,
            it.product_name || fallbackName || 'Unknown',
            Number(it.quantity || 0),
            0,
            it.uom || 'pcs',
            Number(it.unit_price || 0),
            Number(it.rate || it.unit_price || 0),
            Number(it.gst_rate || 0),
            it.discount_type || 'percent',
            Number(it.discount_value || 0),
            Number(it.taxable_value || 0),
            Number(it.tax_amount || 0),
            Number(it.line_total || 0),
            Number(it.line_total || 0),
          ]
        );
      }
      return orderId;
    });
    await logAdminAuditAsync(req, {
      action: 'purchase_order.create',
      entityType: 'purchase_order',
      entityId: orderId,
      requestId: clientRequestId,
      details: {
        po_number: poNumber,
        distributor_id: Number(b.distributor_id || 0),
        total_amount: Number(totalAmount || 0),
        items_count: normalizedItems.length,
      },
    });
    return res.status(201).json({ success: true, id: orderId, po_number: poNumber });
  } catch (error) {
    if (clientRequestId && isUniqueViolationError(error)) {
      const existing = await dbGetAsync(`SELECT id, po_number FROM purchase_orders WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          id: Number(existing.id),
          po_number: existing.po_number,
        });
      }
    }
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Purchase order not found' });
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : null;
    if (items && cur.status === 'received') {
      return res.status(400).json({ error: 'Cannot modify items for a received purchase order' });
    }

    const normalizeItems = (rawItems) => rawItems.map((it) => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate ?? it.unit_price ?? 0);
      const gross = qty * rate;
      const discountType = String(it.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
      const discountValue = Number(it.discount_value || 0);
      const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
      const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
      const taxableValue = Number(it.taxable_value ?? (gross - discountAmount));
      const gstRate = Number(it.gst_rate || 0);
      const taxAmount = Number(it.tax_amount ?? ((taxableValue * gstRate) / 100));
      const lineTotal = Number(it.line_total ?? (taxableValue + taxAmount));
      return {
        ...it,
        quantity: qty,
        rate,
        unit_price: rate,
        discount_type: discountType,
        discount_value: discountValue,
        taxable_value: taxableValue,
        gst_rate: gstRate,
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });

    if (items) {
      if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
      const normalizedItems = normalizeItems(items);
      const subtotal = Number(b.subtotal ?? b.taxable_value ?? normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0));
      const taxAmount = Number(b.tax_amount ?? normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0));
      const totalAmount = Number(
        b.total_amount ??
        b.grand_total ??
        b.total ??
        normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
      );
      await dbTxAsync(async () => {
        await dbRunAsync(
          `UPDATE purchase_orders
           SET distributor_id=?, notes=?, expected_delivery=?, status=?, subtotal=?, tax_amount=?, total_amount=?, total=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
          [
            b.distributor_id ?? cur.distributor_id,
            b.notes ?? cur.notes,
            b.expected_delivery ?? cur.expected_delivery,
            b.status ?? cur.status,
            subtotal,
            taxAmount,
            totalAmount,
            totalAmount,
            req.params.id
          ]
        );
        await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
        for (const it of normalizedItems) {
          const fallbackName = it.product_id
            ? (await dbGetAsync(`SELECT name FROM products WHERE id = ?`, [it.product_id]))?.name
            : null;
          await dbRunAsync(
            `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.params.id,
              it.product_id || null,
              it.product_name || fallbackName || 'Unknown',
              Number(it.quantity || 0),
              Number(it.received_quantity || 0),
              it.uom || 'pcs',
              Number(it.unit_price || 0),
              Number(it.rate || it.unit_price || 0),
              Number(it.gst_rate || 0),
              it.discount_type || 'percent',
              Number(it.discount_value || 0),
              Number(it.taxable_value || 0),
              Number(it.tax_amount || 0),
              Number(it.line_total || 0),
              Number(it.line_total || 0),
            ]
          );
        }
      });
    } else {
      await dbRunAsync(
        `UPDATE purchase_orders
         SET distributor_id=?, notes=?, expected_delivery=?, status=?, subtotal=?, tax_amount=?, total_amount=?, total=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          b.distributor_id ?? cur.distributor_id,
          b.notes ?? cur.notes,
          b.expected_delivery ?? cur.expected_delivery,
          b.status ?? cur.status,
          Number(b.subtotal ?? cur.subtotal ?? 0),
          Number(b.tax_amount ?? cur.tax_amount ?? 0),
          Number(b.total_amount ?? cur.total_amount ?? cur.total ?? 0),
          Number(b.total_amount ?? cur.total_amount ?? cur.total ?? 0),
          req.params.id
        ]
      );
    }
    await logAdminAuditAsync(req, {
      action: 'purchase_order.update',
      entityType: 'purchase_order',
      entityId: req.params.id,
      details: {
        status: req.body?.status ?? cur.status,
        has_items_payload: Array.isArray(req.body?.items),
      },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const status = req.body?.status;
    const billNumberRaw = req.body?.bill_number ?? req.body?.invoice_number;
    const billNumber = billNumberRaw === undefined || billNumberRaw === null ? null : String(billNumberRaw).trim();
    if (!status) return res.status(400).json({ error: 'status is required' });
    const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });

    if (status === 'confirmed') {
      const stockAlreadyApplied = Number(order.stock_applied_on_confirm || 0) === 1;
      const capAdjustments = [];

      if (!stockAlreadyApplied) {
        const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
        await dbTxAsync(async () => {
          for (const item of items) {
            const productId = Number(item.product_id || 0);
            if (!productId) continue;
            const product = await dbGetAsync(`SELECT id, stock FROM products WHERE id = ?`, [productId]);
            if (!product) continue;

            const orderedQty = Math.max(0, Number(item.quantity || 0));
            const beforeStock = Number(product.stock || 0);
            const intendedStock = beforeStock + orderedQty;
            const finalStock = Math.min(PURCHASE_STOCK_CAP, Math.max(0, intendedStock));
            const quantityChange = finalStock - beforeStock;
            const capHit = intendedStock > PURCHASE_STOCK_CAP || beforeStock > PURCHASE_STOCK_CAP;

            if (quantityChange !== 0) {
              await dbRunAsync(`UPDATE products SET stock = ? WHERE id = ?`, [finalStock, productId]);
              const noteLines = ['Auto stock update on PO confirmation'];
              if (capHit) {
                noteLines.push(`Stock cap ${PURCHASE_STOCK_CAP} applied (intended ${intendedStock}, final ${finalStock})`);
              }
              await logStockLedgerAsync({
                productId,
                transactionType: quantityChange >= 0 ? 'PURCHASE' : 'ADJUSTMENT',
                quantityChange,
                previousBalance: beforeStock,
                newBalance: finalStock,
                referenceType: 'PO_CONFIRM',
                referenceId: String(req.params.id),
                userId: req.body?.updated_by || req.body?.created_by || null,
                notes: noteLines.join('. '),
              });
            }

            if (capHit) {
              capAdjustments.push({
                product_id: productId,
                product_name: item.product_name || null,
                ordered_quantity: orderedQty,
                before_stock: beforeStock,
                intended_stock: intendedStock,
                final_stock: finalStock,
                discarded_quantity: Math.max(0, intendedStock - finalStock),
              });
            }
          }

          await dbRunAsync(
            `UPDATE purchase_orders
             SET status = ?,
                 bill_number = COALESCE(?, bill_number),
                 invoice_number = COALESCE(?, invoice_number),
                 stock_applied_on_confirm = 1,
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            [status, billNumber || null, billNumber || null, req.params.id]
          );
        });
      } else {
        await dbRunAsync(
          `UPDATE purchase_orders
           SET status = ?,
               bill_number = COALESCE(?, bill_number),
               invoice_number = COALESCE(?, invoice_number),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [status, billNumber || null, billNumber || null, req.params.id]
        );
      }

      await logAdminAuditAsync(req, {
        action: 'purchase_order.status_update',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          status,
          bill_number: billNumber || null,
          stock_applied: !stockAlreadyApplied,
          stock_already_applied: stockAlreadyApplied,
          cap_applied_count: capAdjustments.length,
        },
      });
      return res.json({
        success: true,
        stock_cap: PURCHASE_STOCK_CAP,
        stock_applied: !stockAlreadyApplied,
        stock_already_applied: stockAlreadyApplied,
        cap_applied_count: capAdjustments.length,
        cap_adjustments: capAdjustments,
      });
    } else {
      await dbRunAsync(`UPDATE purchase_orders SET status = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'purchase_order.status_update',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          status,
          bill_number: billNumber || null,
          stock_applied_on_confirm: Number(order.stock_applied_on_confirm || 0),
        },
      });
      return res.json({ success: true });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders/:id/receive', requireAdmin, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    const shouldApplyStockOnReceive = Number(order.stock_applied_on_confirm || 0) !== 1;
    await dbTxAsync(async () => {
      for (const it of items) {
        const item = await dbGetAsync(`SELECT * FROM purchase_order_items WHERE id = ? AND order_id = ?`, [it.item_id, req.params.id]);
        if (!item) continue;
        const qty = Number(it.received_quantity || 0);
        if (qty <= 0) continue;
        const newReceived = Number(item.received_quantity || 0) + qty;
        const unitPrice = Number(it.unit_price || item.unit_price || 0);
        await dbRunAsync(`UPDATE purchase_order_items SET received_quantity = ?, unit_price = ?, total = quantity * ? WHERE id = ?`, [
          newReceived,
          unitPrice,
          unitPrice,
          item.id,
        ]);
        if (item.product_id && shouldApplyStockOnReceive) {
          const before = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
          await dbRunAsync(`UPDATE products SET stock = stock + ? WHERE id = ?`, [qty, item.product_id]);
          const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
          await logStockLedgerAsync({
            productId: item.product_id,
            transactionType: 'PURCHASE',
            quantityChange: qty,
            previousBalance: before,
            newBalance: after,
            referenceType: 'PO',
            referenceId: String(req.params.id),
            userId: b.received_by || null,
          });
        }
      }
      await dbRunAsync(
        `UPDATE purchase_orders SET status = 'received', invoice_number = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,
        [b.invoice_number || order.invoice_number || null, req.params.id]
      );
    });
    await logAdminAuditAsync(req, {
      action: 'purchase_order.receive',
      entityType: 'purchase_order',
      entityId: req.params.id,
      details: {
        items_count: items.length,
        applied_stock_on_receive: shouldApplyStockOnReceive,
      },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
    await dbRunAsync(`DELETE FROM purchase_orders WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'purchase_order.delete',
      entityType: 'purchase_order',
      entityId: req.params.id,
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-returns', requireAdmin, async (req, res) => {
  try {
    let sql = `
      SELECT pr.*, d.name as distributor_name
      FROM purchase_returns pr
      LEFT JOIN distributors d ON d.id = pr.distributor_id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.distributor_id) {
      sql += ` AND pr.distributor_id = ?`;
      params.push(req.query.distributor_id);
    }
    sql += ` ORDER BY pr.created_at DESC`;
    const baseRows = await dbAllAsync(sql, params);
    const rows = await Promise.all(
      baseRows.map(async (row) => ({
        ...row,
        items: await dbAllAsync(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id])
      }))
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
  try {
    const row = await dbGetAsync(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Purchase return not found' });
    return res.json({ ...row, items: await dbAllAsync(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id]) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-returns', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.distributor_id) return res.status(400).json({ error: 'distributor_id is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
    const total = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
    const returnNumber = generateReturnNumber();
    const returnId = await dbTxAsync(async () => {
      const head = await dbRunAsync(
        `INSERT INTO purchase_returns (return_number, distributor_id, total, reason, return_type, reference_po, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [returnNumber, b.distributor_id, total, b.reason || null, b.return_type || 'return', b.reference_po || null, b.created_by || null]
      );
      const returnId = head.lastInsertRowid;
      for (const it of items) {
        const fallbackName = it.product_id
          ? (await dbGetAsync(`SELECT name FROM products WHERE id = ?`, [it.product_id]))?.name
          : null;
        await dbRunAsync(
          `INSERT INTO purchase_return_items (return_id, product_id, product_name, quantity, uom, unit_price, total, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            returnId,
            it.product_id || null,
            it.product_name || fallbackName || 'Unknown',
            Number(it.quantity || 0),
            it.uom || 'pcs',
            Number(it.unit_price || 0),
            Number(it.quantity || 0) * Number(it.unit_price || 0),
            it.reason || b.reason || null,
          ]
        );
        if (it.product_id) {
          const before = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [it.product_id]))?.stock || 0;
          await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [Number(it.quantity || 0), it.product_id]);
          const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [it.product_id]))?.stock || 0;
          await logStockLedgerAsync({
            productId: it.product_id,
            transactionType: 'PURCHASE_RETURN',
            quantityChange: -Number(it.quantity || 0),
            previousBalance: before,
            newBalance: after,
            referenceType: 'PURCHASE_RETURN',
            referenceId: String(returnId),
            userId: b.created_by || null,
          });
        }
      }
      return returnId;
    });
    return res.status(201).json({ success: true, id: returnId, return_number: returnNumber });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Purchase return not found' });
    const b = req.body || {};
    await dbRunAsync(
      `UPDATE purchase_returns SET reason=?, return_type=?, reference_po=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,
      [b.reason ?? cur.reason, b.return_type ?? cur.return_type, b.reference_po ?? cur.reference_po, req.params.id]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/purchase-returns/:id', requireAdmin, async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM purchase_return_items WHERE return_id = ?`, [req.params.id]);
    await dbRunAsync(`DELETE FROM purchase_returns WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger', requireAdmin, async (req, res) => {
  try {
    let sql = `SELECT * FROM stock_ledger WHERE 1=1`;
    const params = [];
    if (req.query.product_id) {
      sql += ` AND product_id = ?`;
      params.push(req.query.product_id);
    }
    if (req.query.transaction_type) {
      sql += ` AND transaction_type = ?`;
      params.push(req.query.transaction_type);
    }
    if (req.query.start_date) {
      sql += ` AND date(created_at) >= date(?)`;
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      sql += ` AND date(created_at) <= date(?)`;
      params.push(req.query.end_date);
    }
    sql += ` ORDER BY created_at DESC`;
    return res.json(await dbAllAsync(sql, params));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger/product/:productId', requireAdmin, async (req, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM stock_ledger WHERE product_id = ? ORDER BY created_at DESC`, [req.params.productId]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger/batch/:batchNumber', requireAdmin, (_, res) => {
  return res.json([]);
});

app.get('/api/stock-ledger/summary', requireAdmin, async (_, res) => {
  try {
    const rows = await dbAllAsync(`SELECT transaction_type, COUNT(*) as count FROM stock_ledger GROUP BY transaction_type`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/stock/verify', requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const result = await Promise.all(items.map(async (it) => {
      const product = await dbGetAsync(`SELECT id, name, stock FROM products WHERE id = ?`, [it.product_id]);
      if (!product) return { product_id: it.product_id, available: false, reason: 'NOT_FOUND' };
      return {
        product_id: it.product_id,
        product_name: product.name,
        available: Number(product.stock) >= Number(it.quantity || 0),
        in_stock: Number(product.stock),
        requested: Number(it.quantity || 0),
      };
    }));
    return res.json({ items: result, allAvailable: result.every((x) => x.available) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/customers/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = q
      ? await dbAllAsync(`SELECT id, name, email, phone, address FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20`, [like, like, like])
      : await dbAllAsync(`SELECT id, name, email, phone, address FROM users WHERE role='customer' ORDER BY name LIMIT 20`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/products/search', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    let sql = `SELECT * FROM products WHERE COALESCE(is_active, 1) = 1`;
    const params = [];
    if (q) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR barcode LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY name LIMIT 50`;
    return res.json((await dbAllAsync(sql, params)).map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills/create', requireAdmin, async (req, res) => {
  let clientRequestId = null;
  try {
    const b = req.body || {};
    const idempotency = resolveClientRequestId(req);
    if (idempotency.error) return res.status(400).json({ error: idempotency.error });
    clientRequestId = idempotency.value;
    if (clientRequestId) {
      const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          bill_id: Number(existing.id),
          bill_number: existing.bill_number,
        });
      }
    }

    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'items are required' });
    const billTypeRaw = String(b.bill_type || 'sales').trim().toLowerCase();
    const billType = billTypeRaw === 'purchase' ? 'purchase' : 'sales';

    const customerId = Number(b.customer_id || 0);
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
    const customer = await dbGetAsync(
      `SELECT id, name, email, phone, address FROM users WHERE id = ? AND role = 'customer'`,
      [customerId]
    );
    if (!customer) return res.status(400).json({ error: 'customer not found' });

    const customerName = String(customer.name || '').trim();
    const customerEmail = normalizeEmail(customer.email);
    const customerPhone = normalizePhone(customer.phone);
    const customerAddress = customer.address ? String(customer.address).trim() : null;
    const productCache = new Map();
    const itemErrors = [];
    const sanitizedItems = [];
    for (let index = 0; index < items.length; index += 1) {
      const it = items[index];
      const rowNo = index + 1;
      const productId = Number(it.product_id || 0);
      if (!productId) {
        itemErrors.push(`Item ${rowNo}: product_id is required`);
        continue;
      }
      if (!productCache.has(productId)) {
        productCache.set(
          productId,
          (await dbGetAsync(`SELECT id, name, stock, is_active FROM products WHERE id = ?`, [productId])) || null
        );
      }
      const product = productCache.get(productId);
      if (!product) {
        itemErrors.push(`Item ${rowNo}: Product ${productId} not found`);
        continue;
      }
      if (Number(product.is_active ?? 1) !== 1) {
        itemErrors.push(`Item ${rowNo}: Product ${productId} is inactive`);
        continue;
      }
      const qty = Math.max(0, Number(it.qty || 0));
      const mrp = Math.max(0, Number(it.mrp || 0));
      const lineSubtotal = mrp * qty;
      const discount = Math.min(lineSubtotal, Math.max(0, Number(it.discount || 0)));
      const amount = Math.max(0, lineSubtotal - discount);
      const productName =
        String(it.product_name || '').trim() ||
        product.name ||
        'Unknown';
      const normalized = {
        product_id: Number(product.id),
        product_name: productName,
        mrp,
        qty,
        unit: String(it.unit || 'pcs'),
        discount,
        amount,
      };
      if (normalized.qty > 0 && normalized.amount >= 0) {
        sanitizedItems.push(normalized);
      }
    }

    if (itemErrors.length) {
      return res.status(400).json({ error: 'Invalid bill items', details: itemErrors });
    }

    if (!sanitizedItems.length) return res.status(400).json({ error: 'At least one valid item is required' });
    const salesQtyByProduct = new Map();
    if (billType === 'sales') {
      sanitizedItems.forEach((it) => {
        salesQtyByProduct.set(
          it.product_id,
          Number(salesQtyByProduct.get(it.product_id) || 0) + Number(it.qty || 0)
        );
      });
      const stockErrors = [];
      for (const [productId, neededQty] of salesQtyByProduct.entries()) {
        const product = productCache.get(productId);
        const currentStock = Number(product?.stock || 0);
        if (currentStock < neededQty) {
          stockErrors.push(`Product ${productId}: requested ${neededQty}, in stock ${currentStock}`);
        }
      }
      if (stockErrors.length) {
        return res.status(400).json({
          error: 'Insufficient stock for one or more items',
          details: stockErrors,
        });
      }
    }
    const subtotal = sanitizedItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const billDiscount = Math.min(subtotal, Math.max(0, Number(b.discount_amount || 0)));
    const totalAmount = Math.max(0, subtotal - billDiscount);
    const paidAmount = Math.max(0, Math.min(totalAmount, Number(b.paid_amount || 0)));
    const creditAmount = Math.max(0, totalAmount - paidAmount);
    const paymentStatus = creditAmount > 0 ? 'pending' : 'paid';
    const createdBy = Number(req.authUser?.id || 0) || null;
    const billNumber = generateBillNumber();
    const billId = await dbTxAsync(async () => {
      const header = await dbRunAsync(
        `INSERT INTO bills (bill_number, customer_id, customer_name, customer_email, customer_phone, customer_address, subtotal, discount_amount, total_amount, paid_amount, credit_amount, payment_method, payment_status, bill_type, created_by, client_request_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billNumber,
          Number(customer.id),
          customerName,
          customerEmail,
          customerPhone,
          customerAddress,
          subtotal,
          billDiscount,
          totalAmount,
          paidAmount,
          creditAmount,
          normalizePaymentMethod(b.payment_method),
          paymentStatus,
          billType,
          createdBy,
          clientRequestId,
          b.notes ? String(b.notes) : null,
        ]
      );
      const billId = header.lastInsertRowid;
      for (const it of sanitizedItems) {
        await dbRunAsync(
          `INSERT INTO bill_items (bill_id, product_id, product_name, mrp, qty, unit, discount, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            billId,
            it.product_id,
            it.product_name,
            it.mrp,
            it.qty,
            it.unit,
            it.discount,
            it.amount,
          ]
        );
      }
      if (billType === 'sales') {
        for (const [productId, neededQty] of salesQtyByProduct.entries()) {
          const before = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [productId]))?.stock || 0);
          if (before < neededQty) {
            const err = new Error(`Insufficient stock for product ${productId}`);
            err.status = 400;
            throw err;
          }
          await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [neededQty, productId]);
          const after = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [productId]))?.stock || 0);
          await logStockLedgerAsync({
            productId,
            transactionType: 'out',
            quantityChange: -Number(neededQty || 0),
            previousBalance: before,
            newBalance: after,
            referenceType: 'bill',
            referenceId: String(billId),
            userId: createdBy,
            userName: req.authUser?.name || null,
            notes: `Sales bill ${billNumber}`,
          });
        }
      }
      return billId;
    });
    await logAdminAuditAsync(req, {
      action: 'bill.create',
      entityType: 'bill',
      entityId: billId,
      requestId: clientRequestId,
      details: {
        bill_number: billNumber,
        customer_id: Number(customer.id),
        bill_type: billType,
        total_amount: Number(totalAmount || 0),
        credit_amount: Number(creditAmount || 0),
        items_count: sanitizedItems.length,
      },
    });
    try {
      const totalAmountText = `Rs ${Number(totalAmount || 0).toFixed(2)}`;
      await createAppNotification({
        userId: Number(customer.id),
        title: `Bill ${billNumber} created`,
        message: `A new bill of ${totalAmountText} was created for your account.`,
        level: 'info',
        entityType: 'bill',
        entityId: billId,
        metadata: {
          route: '/my-bills',
          bill_id: Number(billId || 0),
          bill_number: billNumber,
          total_amount: Number(totalAmount || 0),
          credit_amount: Number(creditAmount || 0),
          paid_amount: Number(paidAmount || 0),
        },
        createdBy,
      });
    } catch (notifyError) {
      console.warn('[NOTIFY] bill creation notification failed:', notifyError?.message || notifyError);
    }
    return res.status(201).json({ success: true, bill_id: billId, bill_number: billNumber });
  } catch (error) {
    if (clientRequestId && isUniqueViolationError(error)) {
      const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
      if (existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          bill_id: Number(existing.id),
          bill_number: existing.bill_number,
        });
      }
    }
    return res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/bills', requireAdmin, async (_, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM bills ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const bill = await dbGetAsync(`SELECT * FROM bills WHERE id = ? OR bill_number = ?`, [id, id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await dbAllAsync(`SELECT * FROM bill_items WHERE bill_id = ?`, [bill.id]);
    return res.json({ ...bill, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/bills/:id/payment', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM bills WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Bill not found' });
    await dbRunAsync(`UPDATE bills SET payment_status = ?, payment_method = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [
      req.body?.payment_status || cur.payment_status,
      req.body?.payment_method || cur.payment_method,
      req.params.id,
    ]);
    await logAdminAuditAsync(req, {
      action: 'bill.payment_update',
      entityType: 'bill',
      entityId: req.params.id,
      details: {
        payment_status: req.body?.payment_status || cur.payment_status,
        payment_method: req.body?.payment_method || cur.payment_method,
      },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/stats/summary', requireAdmin, async (_, res) => {
  try {
    const totalBills = (await dbGetAsync(`SELECT COUNT(*) as count FROM bills`))?.count || 0;
    const totalSales = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'sales'`))?.total || 0;
    const totalPurchase = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'purchase'`))?.total || 0;
    return res.json({ totalBills, totalSales, totalPurchase });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/offers', async (_, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM offers ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/offers', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.type) return res.status(400).json({ error: 'name and type are required' });
    const result = await dbRunAsync(
      `INSERT INTO offers
      (name, description, type, value, min_quantity, apply_to_category, apply_to_product, buy_product_id, buy_quantity, get_product_id, get_quantity, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.name,
        b.description || null,
        b.type,
        Number(b.value || 0),
        Number(b.min_quantity || 1),
        b.apply_to_category || null,
        b.apply_to_product || null,
        b.buy_product_id || null,
        Number(b.buy_quantity || 1),
        b.get_product_id || null,
        Number(b.get_quantity || 1),
        b.start_date || null,
        b.end_date || null,
        b.status || 'active',
      ]
    );
    const created = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [result.lastInsertRowid]);
    await logAdminAuditAsync(req, {
      action: 'offer.create',
      entityType: 'offer',
      entityId: result.lastInsertRowid,
      details: { name: b.name, type: b.type },
    });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/offers/:id', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Offer not found' });
    const b = req.body || {};
    await dbRunAsync(
      `UPDATE offers SET
       name=?, description=?, type=?, value=?, min_quantity=?, apply_to_category=?, apply_to_product=?, buy_product_id=?, buy_quantity=?, get_product_id=?, get_quantity=?, start_date=?, end_date=?, status=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        b.name ?? cur.name,
        b.description ?? cur.description,
        b.type ?? cur.type,
        Number(b.value ?? cur.value ?? 0),
        Number(b.min_quantity ?? cur.min_quantity ?? 1),
        b.apply_to_category ?? cur.apply_to_category,
        b.apply_to_product ?? cur.apply_to_product,
        b.buy_product_id ?? cur.buy_product_id,
        Number(b.buy_quantity ?? cur.buy_quantity ?? 1),
        b.get_product_id ?? cur.get_product_id,
        Number(b.get_quantity ?? cur.get_quantity ?? 1),
        b.start_date ?? cur.start_date,
        b.end_date ?? cur.end_date,
        b.status ?? cur.status,
        req.params.id,
      ]
    );
    const updated = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'offer.update',
      entityType: 'offer',
      entityId: req.params.id,
      details: { name: updated?.name || null, status: updated?.status || null },
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/offers/:id', requireAdmin, async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM offers WHERE id = ?`, [req.params.id]);
    await logAdminAuditAsync(req, {
      action: 'offer.delete',
      entityType: 'offer',
      entityId: req.params.id,
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-versions/:internalId', (_, res) => res.json([]));
app.get('/api/product-versions/sku/:sku', (_, res) => res.json([]));
app.get('/api/uom-conversions/:productId', requireAdmin, (_, res) => res.json([]));
app.post('/api/uom-conversions', requireAdmin, (_, res) => res.status(201).json({ success: true }));
app.delete('/api/uom-conversions/:id', requireAdmin, (_, res) => res.json({ success: true }));
app.get('/api/batch-stock', requireAdmin, (_, res) => res.json([]));
app.post('/api/batch-stock', requireAdmin, (_, res) => res.status(201).json({ success: true }));

// Root route
app.get('/', (_, res) => {
  res.json({
    success: true,
    message: 'BARMAN STORE API',
    status: 'running',
    version: '1.0.0',
  });
});

const startServer = async () => {
  await ensureRuntimeReady();
  startPhoneChangeWorker();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BARMAN STORE API running on http://localhost:${PORT}`);
  });
};

if (!IS_VERCEL_RUNTIME) {
  void startServer().catch((error) => {
    console.error(`[SYSTEM] Server start aborted: ${error.message}`);
    process.exit(1);
  });
} else {
  console.log('[SYSTEM] Vercel runtime detected. Using serverless request handling.');
}

const shutdownServer = (signal) => {
  console.log(`[SYSTEM] Received ${signal}. Shutting down...`);
  stopPhoneChangeWorker();
  void Promise.allSettled([closePostgresScaffold()]).finally(() => {
    process.exit(0);
  });
};

if (!IS_VERCEL_RUNTIME) {
  process.once('SIGINT', () => shutdownServer('SIGINT'));
  process.once('SIGTERM', () => shutdownServer('SIGTERM'));
}

module.exports = app;

