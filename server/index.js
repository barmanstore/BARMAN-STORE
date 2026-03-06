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
const { registerOrderRoutes } = require('./routes/orderRoutes');
const { registerBillingRoutes } = require('./routes/billingRoutes');
const { registerAuthRoutes } = require('./routes/authRoutes');
const { registerProductRoutes } = require('./routes/productRoutes');

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
const SQL_INSERT_IGNORE_CATEGORY = `INSERT INTO categories (name, description, parent_id) VALUES (?, ?, NULL) ON CONFLICT DO NOTHING`;
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
const AUTH_LOGIN_OTP_EXPOSE_CODE_REQUESTED = parseBooleanEnv(
  process.env.AUTH_LOGIN_OTP_EXPOSE_CODE,
  process.env.NODE_ENV === 'test'
);
const AUTH_LOGIN_OTP_EXPOSE_CODE = process.env.NODE_ENV === 'production'
  ? false
  : AUTH_LOGIN_OTP_EXPOSE_CODE_REQUESTED;
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
const PHONE_CHANGE_MIN_AUTO_APPROVE_DELAY_MS = process.env.NODE_ENV === 'test' ? 500 : 5 * 60 * 1000;
const PHONE_CHANGE_AUTO_APPROVE_DELAY_MS = Math.max(
  PHONE_CHANGE_MIN_AUTO_APPROVE_DELAY_MS,
  Number(process.env.PHONE_CHANGE_AUTO_APPROVE_DELAY_MS || 60 * 60 * 1000)
);
const PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS_RAW = Number(process.env.PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS || 5);
const PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS = process.env.NODE_ENV === 'test'
  ? Math.max(0, PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS_RAW)
  : Math.max(1, Math.min(14, PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS_RAW));
const PHONE_CHANGE_PROCESS_INTERVAL_MS = Math.max(
  30 * 1000,
  Number(process.env.PHONE_CHANGE_PROCESS_INTERVAL_MS || 60 * 1000)
);
const PHONE_CHANGE_AUTO_BATCH_SIZE = Math.max(
  1,
  Math.min(100, Number(process.env.PHONE_CHANGE_AUTO_BATCH_SIZE || 25))
);
const PHONE_CHANGE_CRON_ENABLED = parseBooleanEnv(process.env.PHONE_CHANGE_CRON_ENABLED, true);
const PHONE_CHANGE_CRON_SECRET = String(
  process.env.PHONE_CHANGE_CRON_SECRET || process.env.CRON_SECRET || ''
).trim();
const APP_NOTIFICATION_RETENTION_DAYS = Math.max(
  1,
  Math.min(365, Number(process.env.APP_NOTIFICATION_RETENTION_DAYS || 30))
);
const APP_NOTIFICATION_PURGE_INTERVAL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.APP_NOTIFICATION_PURGE_INTERVAL_MS || 12 * 60 * 60 * 1000)
);
const APP_NOTIFICATION_PURGE_BATCH_LIMIT = Math.max(
  100,
  Math.min(20000, Number(process.env.APP_NOTIFICATION_PURGE_BATCH_LIMIT || 5000))
);
const CUSTOMER_REQUEST_RETENTION_DAYS = Math.max(
  7,
  Math.min(365, Number(process.env.CUSTOMER_REQUEST_RETENTION_DAYS || 60))
);
const CUSTOMER_REQUEST_PURGE_INTERVAL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.CUSTOMER_REQUEST_PURGE_INTERVAL_MS || 12 * 60 * 60 * 1000)
);
const CUSTOMER_REQUEST_PURGE_BATCH_LIMIT = Math.max(
  50,
  Math.min(10000, Number(process.env.CUSTOMER_REQUEST_PURGE_BATCH_LIMIT || 500))
);
const PHONE_CHANGE_EXPIRED_REASON = 'Admin review window expired. Please submit phone update again.';
const BUSINESS_NAME = String(
  process.env.BUSINESS_NAME
  || process.env.PUBLIC_BUSINESS_NAME
  || 'BARMAN STORE'
).trim() || 'BARMAN STORE';
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
const SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK_REQUESTED = parseBooleanEnv(
  process.env.SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
  false
);
const SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK = process.env.NODE_ENV === 'production'
  ? false
  : SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK_REQUESTED;
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
if (process.env.NODE_ENV === 'production') {
  if (AUTH_LOGIN_OTP_EXPOSE_CODE_REQUESTED) {
    console.warn('[AUTH] AUTH_LOGIN_OTP_EXPOSE_CODE=true ignored in production for security.');
  }
  if (SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK_REQUESTED) {
    console.warn('[AUTH] SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK=true ignored in production for security.');
  }
}
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
const PO_LIFECYCLE_REGISTERED = 'registered';
const PO_LIFECYCLE_PROCESSED = 'processed';
const PO_LIFECYCLE_CANCELLED = 'cancelled';
const PO_PAYMENT_UNPAID = 'unpaid';
const PO_PAYMENT_PART_PAID = 'part_paid';
const PO_PAYMENT_PAID = 'paid';
const ORDER_STATUS_ORDERED = 'ordered';
const ORDER_STATUS_RECEIVED = 'received';
const ORDER_ALLOWED_PAYMENT_STATUSES = new Set(['pending', 'paid', 'partial', 'refunded', 'declined']);
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
  const raw = String(status || '').trim().toLowerCase();
  if (ORDER_ALLOWED_PAYMENT_STATUSES.has(raw)) return raw;
  const normalizedOrderStatus = normalizeOrderStatus(orderStatus, ORDER_STATUS_ORDERED);
  return normalizedOrderStatus === ORDER_STATUS_RECEIVED ? 'pending' : 'pending';
};

const normalizePoLifecycleStatus = (status, fallback = PO_LIFECYCLE_REGISTERED) => {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === PO_LIFECYCLE_REGISTERED || raw === 'pending' || raw === 'draft') return PO_LIFECYCLE_REGISTERED;
  if (raw === PO_LIFECYCLE_PROCESSED || raw === 'confirmed' || raw === 'shipped' || raw === 'received') return PO_LIFECYCLE_PROCESSED;
  if (raw === PO_LIFECYCLE_CANCELLED || raw === 'canceled') return PO_LIFECYCLE_CANCELLED;
  return fallback;
};

const getPurchaseOrderLifecycleStatus = (order, fallback = PO_LIFECYCLE_REGISTERED) => {
  if (!order) return fallback;
  return normalizePoLifecycleStatus(order.po_status || order.status, fallback);
};

const normalizePoPaymentStatus = (value, fallback = PO_PAYMENT_UNPAID) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === PO_PAYMENT_UNPAID || raw === 'pending') return PO_PAYMENT_UNPAID;
  if (raw === PO_PAYMENT_PART_PAID || raw === 'partpaid' || raw === 'partial') return PO_PAYMENT_PART_PAID;
  if (raw === PO_PAYMENT_PAID) return PO_PAYMENT_PAID;
  return fallback;
};

const calculatePoPaymentSnapshot = (totalAmountValue, paidAmountValue = 0) => {
  const totalAmount = Math.max(0, Number(totalAmountValue || 0));
  const paidAmountRaw = Math.max(0, Number(paidAmountValue || 0));
  const paidAmount = Math.min(totalAmount, paidAmountRaw);
  const balanceDue = Math.max(0, totalAmount - paidAmount);
  let paymentStatus = PO_PAYMENT_UNPAID;
  if (totalAmount > 0 && paidAmount >= totalAmount) {
    paymentStatus = PO_PAYMENT_PAID;
  } else if (paidAmount > 0) {
    paymentStatus = PO_PAYMENT_PART_PAID;
  }
  return {
    totalAmount,
    paidAmount,
    balanceDue,
    paymentStatus,
  };
};

const normalizeTransactionDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.slice(0, 10);
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

const getNormalizedPhoneFromUnknownText = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = normalizePhone(raw);
  if (direct) return direct;
  const candidates = raw.match(/\+?[0-9][0-9\s().-]{8,}/g) || [];
  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) return normalized;
  }
  return '';
};

const getDistributorWhatsappPhone = (distributor = null) => {
  if (!distributor) return '';
  const direct = getNormalizedPhoneFromUnknownText(distributor.phone);
  if (direct) return direct;

  const contactsRaw = distributor.contacts;
  if (!contactsRaw) return '';
  if (typeof contactsRaw === 'object') {
    const objectCandidates = [
      contactsRaw.phone,
      contactsRaw.mobile,
      contactsRaw.whatsapp,
      contactsRaw.primary_phone,
      contactsRaw.contact,
    ];
    for (const candidate of objectCandidates) {
      const normalized = getNormalizedPhoneFromUnknownText(candidate);
      if (normalized) return normalized;
    }
    if (Array.isArray(contactsRaw.phones)) {
      for (const candidate of contactsRaw.phones) {
        const normalized = getNormalizedPhoneFromUnknownText(candidate);
        if (normalized) return normalized;
      }
    }
  }

  const contactsText = String(contactsRaw || '').trim();
  if (!contactsText) return '';
  try {
    const parsed = JSON.parse(contactsText);
    if (parsed && typeof parsed === 'object') {
      const parsedCandidates = [
        parsed.phone,
        parsed.mobile,
        parsed.whatsapp,
        parsed.primary_phone,
        parsed.contact,
      ];
      for (const candidate of parsedCandidates) {
        const normalized = getNormalizedPhoneFromUnknownText(candidate);
        if (normalized) return normalized;
      }
      if (Array.isArray(parsed.phones)) {
        for (const candidate of parsed.phones) {
          const normalized = getNormalizedPhoneFromUnknownText(candidate);
          if (normalized) return normalized;
        }
      }
    }
  } catch (_) {
    // plain-text contacts are handled below
  }

  return getNormalizedPhoneFromUnknownText(contactsText);
};

const normalizeWhatsAppRecipientPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
};

const notifyDistributorPurchaseOrderAsync = async ({
  purchaseOrderId = null,
  distributorId,
  poNumber,
  totalAmount,
  paymentStatus = PO_PAYMENT_UNPAID,
  balanceDue = 0,
  expectedDelivery = null,
  notes = '',
  billNumber = '',
  isUpdate = false,
  items = [],
  messageDate = null,
  title = '',
  preparedBy = null,
} = {}) => {
  const normalizedDistributorId = Number(distributorId || 0);
  if (!normalizedDistributorId) return { queued: false, reason: 'missing_distributor' };
  const distributor = await dbGetAsync(`SELECT id, name, contacts FROM distributors WHERE id = ?`, [normalizedDistributorId]);
  if (!distributor) return { queued: false, reason: 'distributor_not_found' };
  const normalizedPhone = getDistributorWhatsappPhone(distributor);
  if (!normalizedPhone) return { queued: false, reason: 'missing_phone' };

  const recipientPhone = normalizeWhatsAppRecipientPhone(normalizedPhone);
  if (!recipientPhone) return { queued: false, reason: 'invalid_phone' };

  const normalizedPurchaseOrderId = Number(purchaseOrderId || 0);
  let noticeItems = Array.isArray(items) ? items : [];
  if (!noticeItems.length && normalizedPurchaseOrderId) {
    noticeItems = await dbAllAsync(
      `SELECT product_name, quantity, rate, unit_price
       FROM purchase_order_items
       WHERE order_id = ?
       ORDER BY id ASC`,
      [normalizedPurchaseOrderId]
    );
  }

  const orderDate = normalizeTransactionDate(messageDate) || new Date().toISOString().slice(0, 10);
  const preparedWhatsApp = notificationService.prepareWhatsApp({
    type: 'purchase_order_distributor_notice',
    to: recipientPhone,
    payload: {
      title: String(title || '').trim() || `Order for ${orderDate}`,
      order_date: orderDate,
      items: noticeItems,
    },
  });
  const text = preparedWhatsApp.text;
  const normalizedRecipientPhone = preparedWhatsApp.to;
  const whatsappUrl = preparedWhatsApp.whatsapp_url;

  const eventId = await createNotificationEvent({
    type: 'purchase_order_distributor_notice',
    channel: 'whatsapp',
    recipient: normalizedRecipientPhone,
    recipientUserId: null,
    subject: `PO ${isUpdate ? 'update' : 'register'} ${poNumber || ''}`.trim(),
    body: text,
    metadata: {
      mode: WHATSAPP_DELIVERY_MODE,
      po_number: poNumber || null,
      distributor_id: normalizedDistributorId,
      items_count: noticeItems.length,
      order_date: orderDate,
      title: String(title || '').trim() || `Order for ${orderDate}`,
      balance_due: Number(balanceDue || 0),
      payment_status: normalizePoPaymentStatus(paymentStatus, PO_PAYMENT_UNPAID),
      bill_number: billNumber || null,
      expected_delivery: expectedDelivery ? String(expectedDelivery).slice(0, 10) : null,
    },
    status: 'prepared',
    preparedBy,
  });

  if (WHATSAPP_DELIVERY_MODE !== 'auto') {
    return {
      queued: false,
      reason: 'manual_send_required',
      mode: 'manual',
      event_id: eventId,
      whatsapp: {
        to: normalizedRecipientPhone,
        text,
        whatsapp_url: whatsappUrl,
      },
    };
  }

  if (!whatsappProvider?.isReady) {
    await updateNotificationEventStatus(eventId, {
      status: 'failed',
      errorMessage: 'WhatsApp provider is not configured',
    });
    return { queued: false, reason: 'provider_not_ready', event_id: eventId, whatsapp: { to: normalizedRecipientPhone, text, whatsapp_url: whatsappUrl } };
  }

  try {
    await whatsappProvider.sendMessage({ to: normalizedRecipientPhone, text });
    await updateNotificationEventStatus(eventId, { status: 'sent' });
    return { queued: true, mode: 'auto', event_id: eventId, whatsapp: { to: normalizedRecipientPhone, text, whatsapp_url: whatsappUrl } };
  } catch (error) {
    await updateNotificationEventStatus(eventId, {
      status: 'failed',
      errorMessage: error?.message || String(error || 'WhatsApp send failed'),
    });
    return {
      queued: false,
      reason: 'send_failed',
      event_id: eventId,
      error: error?.message || String(error || 'WhatsApp send failed'),
      whatsapp: { to: normalizedRecipientPhone, text, whatsapp_url: whatsappUrl },
    };
  }
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

const generateSku = (name, brand, content, price, mrp) => {
  const part = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const n = part(name).slice(0, 4).padEnd(4, 'X');
  const b = part(brand).slice(0, 4).padEnd(4, 'X');
  const c = part(content).slice(0, 2).padEnd(2, 'X');
  const p = String(Math.round(Number(price || mrp || 0))).replace(/\D/g, '').slice(-4).padStart(4, '0');
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
  clientRequestId = null,
}) => {
  const normalizedUserId = Number(userId || 0);
  if (!normalizedUserId) return 0;
  const normalizedTitle = String(title || '').trim();
  const normalizedMessage = String(message || '').trim();
  if (!normalizedTitle || !normalizedMessage) return 0;
  const result = await dbRunAsync(
    `INSERT INTO app_notifications
    (user_id, title, message, level, entity_type, entity_id, issue_id, is_read, metadata, created_by, read_at, client_request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
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
      clientRequestId ? normalizeClientRequestId(clientRequestId) || null : null,
    ]
  );
  return Number(result.lastInsertRowid || 0);
};

const purgeOldAppNotificationsAsync = async ({
  olderThanDays = APP_NOTIFICATION_RETENTION_DAYS,
  limit = APP_NOTIFICATION_PURGE_BATCH_LIMIT,
} = {}) => {
  const normalizedDays = Math.max(1, Math.min(365, Number(olderThanDays || APP_NOTIFICATION_RETENTION_DAYS)));
  const normalizedLimit = Math.max(1, Math.min(50000, Number(limit || APP_NOTIFICATION_PURGE_BATCH_LIMIT)));
  const cutoffDate = new Date(Date.now() - (normalizedDays * 24 * 60 * 60 * 1000));
  const cutoffIso = cutoffDate.toISOString();
  const result = await dbRunAsync(
    `WITH old_rows AS (
      SELECT id
      FROM app_notifications
      WHERE created_at < ?
      ORDER BY id ASC
      LIMIT ?
    )
    DELETE FROM app_notifications
    WHERE id IN (SELECT id FROM old_rows)`,
    [cutoffIso, normalizedLimit]
  );
  return {
    deleted: Number(result?.changes || 0),
    cutoff: cutoffIso,
    older_than_days: normalizedDays,
    limit: normalizedLimit,
  };
};

const purgeOldCustomerRequestsAsync = async ({
  olderThanDays = CUSTOMER_REQUEST_RETENTION_DAYS,
  limit = CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
} = {}) => {
  const normalizedDays = Math.max(7, Math.min(365, Number(olderThanDays || CUSTOMER_REQUEST_RETENTION_DAYS)));
  const normalizedLimit = Math.max(1, Math.min(20000, Number(limit || CUSTOMER_REQUEST_PURGE_BATCH_LIMIT)));
  const cutoffDate = new Date(Date.now() - (normalizedDays * 24 * 60 * 60 * 1000));
  const cutoffIso = cutoffDate.toISOString();

  const productResult = await dbRunAsync(
    `WITH old_rows AS (
      SELECT id
      FROM product_recommendations
      WHERE status IN ('fulfilled', 'rejected')
        AND COALESCE(resolved_at, updated_at, created_at) < ?
      ORDER BY id ASC
      LIMIT ?
    )
    DELETE FROM product_recommendations
    WHERE id IN (SELECT id FROM old_rows)`,
    [cutoffIso, normalizedLimit]
  );

  const creditIssueResult = await dbRunAsync(
    `WITH old_rows AS (
      SELECT id
      FROM credit_entry_issues
      WHERE status IN ('corrected', 'rejected')
        AND COALESCE(resolved_at, updated_at, created_at) < ?
      ORDER BY id ASC
      LIMIT ?
    )
    DELETE FROM credit_entry_issues
    WHERE id IN (SELECT id FROM old_rows)`,
    [cutoffIso, normalizedLimit]
  );

  const phoneRequestResult = await dbRunAsync(
    `WITH old_rows AS (
      SELECT id
      FROM phone_change_requests
      WHERE status IN (?, ?)
        AND COALESCE(reviewed_at, updated_at, created_at) < ?
      ORDER BY id ASC
      LIMIT ?
    )
    DELETE FROM phone_change_requests
    WHERE id IN (SELECT id FROM old_rows)`,
    [PHONE_CHANGE_STATUS_APPROVED, PHONE_CHANGE_STATUS_REJECTED, cutoffIso, normalizedLimit]
  );

  const deletedProductRecommendations = Number(productResult?.changes || 0);
  const deletedCreditIssues = Number(creditIssueResult?.changes || 0);
  const deletedPhoneRequests = Number(phoneRequestResult?.changes || 0);

  return {
    deleted_product_recommendations: deletedProductRecommendations,
    deleted_credit_issues: deletedCreditIssues,
    deleted_phone_requests: deletedPhoneRequests,
    total_deleted: deletedProductRecommendations + deletedCreditIssues + deletedPhoneRequests,
    cutoff: cutoffIso,
    older_than_days: normalizedDays,
    limit: normalizedLimit,
  };
};

const runCustomerRequestPurge = async () => {
  try {
    const result = await purgeOldCustomerRequestsAsync({
      olderThanDays: CUSTOMER_REQUEST_RETENTION_DAYS,
      limit: CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
    });
    if (Number(result?.total_deleted || 0) > 0) {
      console.log(
        `[CUSTOMER_REQUESTS] Purged ${result.total_deleted} rows older than ${CUSTOMER_REQUEST_RETENTION_DAYS} days`
      );
    }
    return result;
  } catch (error) {
    console.warn('[CUSTOMER_REQUESTS] Retention purge failed:', error?.message || error);
    return null;
  }
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

const getPhoneMergeImpactSummary = async (sourceUserId) => {
  const id = Number(sourceUserId || 0);
  if (!id) return null;
  const [
    creditHistoryRow,
    creditIssueRow,
    billsRow,
    ordersRow,
    recommendationsRow,
  ] = await Promise.all([
    dbGetAsync(`SELECT COUNT(*) AS count FROM credit_history WHERE user_id = ?`, [id]),
    dbGetAsync(`SELECT COUNT(*) AS count FROM credit_entry_issues WHERE user_id = ?`, [id]),
    dbGetAsync(`SELECT COUNT(*) AS count FROM bills WHERE customer_id = ?`, [id]),
    dbGetAsync(`SELECT COUNT(*) AS count FROM orders WHERE user_id = ?`, [id]),
    dbGetAsync(`SELECT COUNT(*) AS count FROM product_recommendations WHERE user_id = ?`, [id]),
  ]);
  const summary = {
    credit_history: Number(creditHistoryRow?.count || 0),
    credit_entry_issues: Number(creditIssueRow?.count || 0),
    bills: Number(billsRow?.count || 0),
    orders: Number(ordersRow?.count || 0),
    product_recommendations: Number(recommendationsRow?.count || 0),
  };
  return {
    source_user_id: id,
    ...summary,
    total_records: Object.values(summary).reduce((total, value) => total + Number(value || 0), 0),
  };
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
  allowConflictMerge = false,
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
    let mergeImpact = null;
    if (conflictUserId) {
      mergeImpact = await getPhoneMergeImpactSummary(conflictUserId);
    }
    if (source === PHONE_CHANGE_DECISION_ADMIN && conflictUserId && !Boolean(allowConflictMerge)) {
      const err = new Error('Conflict detected. Confirm identity merge to approve this request.');
      err.status = 409;
      err.code = 'PHONE_CONFLICT_REQUIRES_MERGE';
      err.details = {
        requires_merge_confirmation: true,
        conflict_user_id: conflictUserId,
        merge_impact: mergeImpact,
      };
      throw err;
    }
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
      merge_impact: mergeImpact,
      merge_identity_applied: Boolean(conflictUserId && allowConflictMerge),
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

const notifyPhoneChangeSubmitted = async ({ userId }) => {
  await createAppNotification({
    userId,
    title: 'Phone update request received',
    message: 'Phone update is pending. You will be notified once it is updated.',
    level: 'info',
    entityType: 'phone_change_request',
    metadata: {
      route: '/profile',
      status: PHONE_CHANGE_STATUS_PENDING,
    },
    createdBy: Number(userId || 0) || null,
  });
};

const notifyPhoneChangeAdminReview = async ({ userId, requestId }) => {
  await createAppNotification({
    userId,
    title: 'Phone update under admin review',
    message: 'Phone update is pending. You will be notified once it is updated.',
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
  if (phoneChangeWorkerRunning) return null;
  phoneChangeWorkerRunning = true;
  const stats = {
    auto_approved: 0,
    escalated_admin_review: 0,
    auto_rejected_invalid: 0,
    expired_rejected: 0,
    scanned_auto_candidates: 0,
    scanned_overdue_candidates: 0,
  };
  try {
    const numericLimit = Number(limit || PHONE_CHANGE_AUTO_BATCH_SIZE);
    const rows = await dbAllAsync(
      `SELECT *
       FROM phone_change_requests
       WHERE status = ?
         AND COALESCE(needs_admin_review, 0) = 0
         AND auto_check_at IS NOT NULL
         AND auto_check_at <= CURRENT_TIMESTAMP
       ORDER BY auto_check_at ASC, id ASC
       LIMIT ?`,
      [PHONE_CHANGE_STATUS_PENDING, numericLimit]
    );
    stats.scanned_auto_candidates = Array.isArray(rows) ? rows.length : 0;
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
            stats.auto_rejected_invalid += 1;
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
            stats.escalated_admin_review += 1;
            const owner = await dbGetAsync(`SELECT id, name FROM users WHERE id = ?`, [userId]);
            await notifyAdminsPhoneChangeReview({
              requestId,
              userName: owner?.name || `User #${userId}`,
              newPhone: parsedPhone.value,
            });
            await notifyPhoneChangeAdminReview({
              userId,
              requestId,
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
          stats.auto_approved += 1;
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
    const overdueRows = await dbAllAsync(
      `SELECT *
       FROM phone_change_requests
       WHERE status = ?
         AND COALESCE(needs_admin_review, 0) = 1
         AND final_due_at IS NOT NULL
         AND final_due_at <= CURRENT_TIMESTAMP
       ORDER BY final_due_at ASC, id ASC
       LIMIT ?`,
      [PHONE_CHANGE_STATUS_PENDING, numericLimit]
    );
    stats.scanned_overdue_candidates = Array.isArray(overdueRows) ? overdueRows.length : 0;
    for (const row of overdueRows || []) {
      const requestId = Number(row?.id || 0);
      const userId = Number(row?.user_id || 0);
      if (!requestId || !userId) continue;
      try {
        const rejected = await rejectPhoneChangeRequest({
          id: requestId,
          reviewedBy: null,
          adminNote: 'Auto-closed after review window expired',
          rejectionReason: PHONE_CHANGE_EXPIRED_REASON,
        });
        if (!rejected) continue;
        stats.expired_rejected += 1;
        await notifyPhoneChangeRejected({
          userId,
          requestId,
          reason: PHONE_CHANGE_EXPIRED_REASON,
        });
      } catch (error) {
        console.warn('[PHONE_CHANGE] Failed expiring request:', error?.message || error);
      }
    }
    return stats;
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

const runAppNotificationPurge = async () => {
  try {
    const result = await purgeOldAppNotificationsAsync({
      olderThanDays: APP_NOTIFICATION_RETENTION_DAYS,
      limit: APP_NOTIFICATION_PURGE_BATCH_LIMIT,
    });
    if (Number(result?.deleted || 0) > 0) {
      console.log(`[NOTIFY] Purged ${result.deleted} app notifications older than ${APP_NOTIFICATION_RETENTION_DAYS} days`);
    }
  } catch (error) {
    console.warn('[NOTIFY] Notification purge failed:', error?.message || error);
  }
};

const startAppNotificationPurgeWorker = () => {
  if (IS_VERCEL_RUNTIME) return;
  if (appNotificationPurgeTimer) return;
  appNotificationPurgeTimer = setInterval(() => {
    void runAppNotificationPurge();
  }, APP_NOTIFICATION_PURGE_INTERVAL_MS);
  void runAppNotificationPurge();
};

const stopAppNotificationPurgeWorker = () => {
  if (!appNotificationPurgeTimer) return;
  clearInterval(appNotificationPurgeTimer);
  appNotificationPurgeTimer = null;
};

const startCustomerRequestPurgeWorker = () => {
  if (IS_VERCEL_RUNTIME) return;
  if (customerRequestPurgeTimer) return;
  customerRequestPurgeTimer = setInterval(() => {
    void runCustomerRequestPurge();
  }, CUSTOMER_REQUEST_PURGE_INTERVAL_MS);
  void runCustomerRequestPurge();
};

const stopCustomerRequestPurgeWorker = () => {
  if (!customerRequestPurgeTimer) return;
  clearInterval(customerRequestPurgeTimer);
  customerRequestPurgeTimer = null;
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
  'base_unit',
  'uom_type',
  'conversion_factor',
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
  base_unit: 'pcs',
  uom_type: 'selling',
  conversion_factor: 1,
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
let appNotificationPurgeTimer = null;
let customerRequestPurgeTimer = null;

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
  if (parts.length < 2 || parts.some((part) => !part)) {
    return { parent: raw, child: '', invalid: true };
  }
  const [parent, ...tail] = parts;
  return { parent, child: tail.join(` ${HIERARCHY_SEPARATOR} `), invalid: false };
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
  out.uom = String(out.uom || 'pcs').trim() || 'pcs';
  out.base_unit = String(out.base_unit || out.uom || 'pcs').trim() || 'pcs';
  const uomType = String(out.uom_type || 'selling').trim().toLowerCase();
  out.uom_type = ['selling', 'purchasing', 'both'].includes(uomType) ? uomType : 'selling';
  const conversionFactor = Number(out.conversion_factor ?? 1);
  out.conversion_factor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
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
  const baseUnitRaw = body.base_unit ?? existing.base_unit ?? uom ?? 'pcs';
  const uomTypeRaw = body.uom_type ?? existing.uom_type ?? 'selling';
  const conversionFactorRaw = body.conversion_factor ?? existing.conversion_factor ?? 1;
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
  const normalizedUom = String(uom || 'pcs').trim() || 'pcs';
  const normalizedBaseUnit = String(baseUnitRaw || normalizedUom || 'pcs').trim() || 'pcs';
  const normalizedUomType = ['selling', 'purchasing', 'both'].includes(String(uomTypeRaw || '').trim().toLowerCase())
    ? String(uomTypeRaw || '').trim().toLowerCase()
    : 'selling';
  const conversionFactor = Number(conversionFactorRaw);
  const normalizedConversionFactor = Number.isFinite(conversionFactor) && conversionFactor > 0
    ? conversionFactor
    : 1;
  const sku = String(skuCandidate || '').trim() || generateSku(name, brandFromInput, content, price, mrp);
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
    uom: normalizedUom,
    base_unit: normalizedBaseUnit,
    uom_type: normalizedUomType,
    conversion_factor: normalizedConversionFactor,
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
  if (!partial || payload.uom !== undefined) {
    if (!String(payload.uom || '').trim()) errors.push('uom is required');
  }
  if (!partial || payload.base_unit !== undefined) {
    if (!String(payload.base_unit || '').trim()) errors.push('base_unit is required');
  }
  if (payload.uom_type !== undefined) {
    const uomType = String(payload.uom_type || '').trim().toLowerCase();
    if (!['selling', 'purchasing', 'both'].includes(uomType)) errors.push('uom_type must be selling, purchasing or both');
  }
  if (payload.conversion_factor !== undefined) {
    const factor = Number(payload.conversion_factor);
    if (!Number.isFinite(factor) || factor <= 0) errors.push('conversion_factor must be greater than 0');
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
  const contentKey = normalizeTextKey(payload?.content);
  const colorKey = normalizeTextKey(payload?.color);
  if (!nameKey) return null;

  const byNameBrand = excludeId
    ? await dbAllAsync(
      `SELECT id, name, brand, sub_brand, content, color, price, mrp
       FROM products
       WHERE lower(trim(name)) = ?
         AND lower(trim(COALESCE(brand, ''))) = ?
         AND lower(trim(COALESCE(sub_brand, ''))) = ?
         AND id <> ?
       ORDER BY id DESC`,
      [nameKey, brandKey, subBrandKey, Number(excludeId)]
    )
    : await dbAllAsync(
      `SELECT id, name, brand, sub_brand, content, color, price, mrp
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

  if (contentKey) {
    const sameContentDifferentPrice = byNameBrand.find((row) =>
      normalizeTextKey(row?.content) === contentKey
        && (
          normalizeMoneyValue(row?.price) !== price
          || normalizeMoneyValue(row?.mrp) !== mrp
        )
    );
    if (sameContentDifferentPrice) {
      return {
        field: 'content_price',
        conflict_type: 'exact',
        severity: 'block',
        product_id: sameContentDifferentPrice.id,
        product_name: sameContentDifferentPrice.name,
        message: `Same content/size already exists with a different price/MRP (Product #${sameContentDifferentPrice.id}: ${sameContentDifferentPrice.name}). Use a different content value for a different price.`
      };
    }
  }

  const matchingVariantRows = byNameBrand.filter((row) =>
    normalizeTextKey(row?.content) === contentKey
      && normalizeTextKey(row?.color) === colorKey
  );
  if (!matchingVariantRows.length) return null;

  const exact = matchingVariantRows.find((row) =>
    normalizeMoneyValue(row?.price) === price && normalizeMoneyValue(row?.mrp) === mrp
  );
  if (exact) {
    return {
      field: 'name_brand_content_color_price_mrp',
      conflict_type: 'exact',
      severity: 'block',
      product_id: exact.id,
      product_name: exact.name,
      message: `Exact duplicate exists (Product #${exact.id}: ${exact.name}) for name + brand/sub-brand + content + color + price + MRP`
    };
  }

  const firstMatch = matchingVariantRows[0];
  return {
    field: 'name_brand_content_color',
    conflict_type: 'identical',
    severity: 'confirm',
    product_id: firstMatch.id,
    product_name: firstMatch.name,
    message: `Identical product variant exists (Product #${firstMatch.id}: ${firstMatch.name}) for name + brand/sub-brand + content + color. Choose to allow or cancel.`
  };
};

const buildProductExactKey = (payload) => {
  const nameKey = normalizeTextKey(payload?.name);
  if (!nameKey) return '';
  const brandKey = normalizeTextKey(payload?.brand);
  const subBrandKey = normalizeTextKey(payload?.sub_brand);
  const contentKey = normalizeTextKey(payload?.content);
  const colorKey = normalizeTextKey(payload?.color);
  const price = normalizeMoneyValue(payload?.price);
  const mrp = normalizeMoneyValue(payload?.mrp);
  return `${nameKey}::${brandKey}::${subBrandKey}::${contentKey}::${colorKey}::${price ?? ''}::${mrp ?? ''}`;
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
  const existing = await dbGetAsync(
    `SELECT name
     FROM categories
     WHERE parent_id IS NULL
       AND lower(name) = lower(?)`,
    [requested]
  );
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
            (name, description, brand, sub_brand, content, color, price, mrp, uom, base_unit, uom_type, conversion_factor, sku, barcode, image, stock, category, subcategory, expiry_date, default_discount, discount_type, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              payload.base_unit,
              payload.uom_type,
              payload.conversion_factor,
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
             name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, base_unit=?, uom_type=?, conversion_factor=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
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
              payload.base_unit,
              payload.uom_type,
              payload.conversion_factor,
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
  base_unit: row.base_unit || row.uom || 'pcs',
  uom_type: row.uom_type || 'selling',
  conversion_factor: Number(row.conversion_factor || 1),
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

registerAuthRoutes({
  app,
  requireAuth,
  authIpLimiter,
  emailVerificationLimiter,
  requireInternalCron,
  dbGetAsync,
  dbRunAsync,
  dbAllAsync,
  normalizeEmail,
  parsePhoneInput,
  normalizePhone,
  hashPassword,
  generateTemporaryPassword,
  isUniqueViolationError,
  generateOtpCode,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  notificationService,
  createNotificationEvent,
  EMAIL_DELIVERY_MODE,
  emailVerificationProvider,
  updateNotificationEventStatus,
  AUTH_LOGIN_OTP_EXPOSE_CODE,
  isSupabaseEmailAuthUsable,
  supabaseAuthProvider,
  syncLocalUserFromSupabaseAuth,
  getSupabaseUserMetadata,
  sanitizeUser,
  generateToken,
  toSupabaseSessionPayload,
  verifyPassword,
  isSupabaseAuthStrictMode,
  queueContactVerificationRequest,
  getRequestIp,
  syncLocalEmailVerifiedFromSupabase,
  completeContactVerificationRequests,
  EMAIL_VERIFY_MAX_ATTEMPTS,
  hashVerificationToken,
  getBearerTokenFromRequest,
  isSupabaseEmailVerified,
  EMAIL_VERIFICATION_MODE,
  SUPABASE_AUTH_MODE,
  WHATSAPP_DELIVERY_MODE,
  whatsappProvider,
  processPendingPhoneChangeRequests,
  getLatestPhoneChangeRequestForUser,
  serializePhoneChangeRequest,
  getOpenPhoneChangeRequestForUser,
  rejectPhoneChangeRequest,
  createAppNotification,
  PHONE_CHANGE_STATUS_REJECTED,
  PHONE_CHANGE_AUTO_BATCH_SIZE,
  normalizeContactVerificationRequestType,
  AUTH_FLOW_MODE,
  OTP_PROVIDER,
  OTP_DELIVERY_MODE,
  OTP_VERIFY_SESSION_TTL_SECONDS,
  PHONE_VERIFICATION_REQUIRED,
  WHATSAPP_PROVIDER,
  SUPABASE_EMAIL_VERIFY_REDIRECT,
  PHONE_VERIFY_MAX_ATTEMPTS,
  hashOpaqueToken,
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
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const unreadOnly = parseBooleanEnv(req.query?.unread_only, false);
    const rawBeforeId = Number(req.query?.before_id || 0);
    const beforeId = Number.isFinite(rawBeforeId) && rawBeforeId > 0 ? Math.floor(rawBeforeId) : 0;
    const requestedLimit = Number(req.query?.limit || 20);
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const params = [userId];
    let sql = `SELECT *
      FROM app_notifications
      WHERE user_id = ?`;
    if (unreadOnly) {
      sql += ` AND COALESCE(is_read, 0) = 0`;
    }
    if (beforeId > 0) {
      sql += ` AND id < ?`;
      params.push(beforeId);
    }
    sql += ` ORDER BY id DESC LIMIT ?`;
    params.push(limit);

    const rows = await dbAllAsync(sql, params);
    const items = (rows || []).map((row) => ({
      ...row,
      is_read: Number(row?.is_read || 0) === 1,
      metadata: parseJsonText(row?.metadata, null),
    }));
    const nextBeforeId = items.length === limit
      ? Number(items[items.length - 1]?.id || 0) || null
      : null;
    return res.json({
      items,
      paging: {
        limit,
        next_before_id: nextBeforeId,
        has_more: Boolean(nextBeforeId),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load notifications' });
  }
});

app.get('/api/notifications/me/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const row = await dbGetAsync(
      `SELECT COUNT(*) AS count
       FROM app_notifications
       WHERE user_id = ? AND COALESCE(is_read, 0) = 0`,
      [userId]
    );
    return res.json({ count: Number(row?.count || 0) });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load unread notification count' });
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

app.post('/api/internal/notifications/purge', requireCronSecret, async (req, res) => {
  try {
    const rawDays = Number(req.body?.older_than_days ?? req.query?.older_than_days ?? APP_NOTIFICATION_RETENTION_DAYS);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(365, Math.floor(rawDays))) : APP_NOTIFICATION_RETENTION_DAYS;
    const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? APP_NOTIFICATION_PURGE_BATCH_LIMIT);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50000, Math.floor(rawLimit))) : APP_NOTIFICATION_PURGE_BATCH_LIMIT;
    const result = await purgeOldAppNotificationsAsync({
      olderThanDays: days,
      limit,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to purge old notifications' });
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
           AND (
             LOWER(COALESCE(name, '')) LIKE LOWER(?)
             OR LOWER(COALESCE(email, '')) LIKE LOWER(?)
             OR LOWER(COALESCE(phone, '')) LIKE LOWER(?)
           )
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
  let clientRequestId = null;
  try {
    const senderId = Number(req.authUser?.id || 0);
    const idempotency = resolveClientRequestId(req);
    if (idempotency.error) return res.status(400).json({ error: idempotency.error });
    clientRequestId = idempotency.value;
    const senderName = String(req.authUser?.name || '').trim() || 'Admin';
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 1000) return res.status(400).json({ error: 'Message is too long (max 1000 characters)' });
    if (clientRequestId) {
      const existingBatch = await dbGetAsync(
        `SELECT id, sent_count, recipient_names, recipient_count
         FROM notification_send_batches
         WHERE client_request_id = ? AND sender_user_id = ?
         LIMIT 1`,
        [clientRequestId, senderId]
      );
      if (existingBatch) {
        return res.json({
          success: true,
          deduplicated: true,
          sent_count: Number(existingBatch.sent_count || 0),
          recipient_names: parseJsonText(existingBatch.recipient_names, []) || [],
        });
      }
    }
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
    const recipientNames = recipients.map((row) => String(row?.name || '').trim()).filter(Boolean);
    const sendResult = await dbTxAsync(async () => {
      let batchId = null;
      if (clientRequestId) {
        const inserted = await dbRunAsync(
          `INSERT INTO notification_send_batches
          (client_request_id, sender_user_id, message, recipient_user_ids, recipient_names, recipient_count, sent_count, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clientRequestId,
            senderId,
            message,
            safeSerializeJson(recipientIds),
            safeSerializeJson(recipientNames),
            recipients.length,
            0,
            'processing',
          ]
        );
        batchId = Number(inserted.lastInsertRowid || 0) || null;
      }

      for (const recipient of recipients) {
        const recipientId = Number(recipient?.id || 0);
        if (!recipientId) continue;
        const recipientRequestId = clientRequestId
          ? `notif:${crypto.createHash('sha1').update(`${clientRequestId}:${recipientId}`).digest('hex').slice(0, 32)}`
          : null;
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
          clientRequestId: recipientRequestId,
        });
      }

      const senderRequestId = clientRequestId
        ? `notif:${crypto.createHash('sha1').update(`${clientRequestId}:sender`).digest('hex').slice(0, 32)}`
        : null;
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
        clientRequestId: senderRequestId,
      });

      if (batchId) {
        await dbRunAsync(
          `UPDATE notification_send_batches
           SET status = ?, sent_count = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          ['sent', recipients.length, batchId]
        );
      }

      return {
        sentCount: recipients.length,
      };
    });

    return res.json({
      success: true,
      sent_count: Number(sendResult?.sentCount || 0),
      recipient_names: recipientNames,
    });
  } catch (error) {
    if (clientRequestId && isUniqueViolationError(error)) {
      const senderId = Number(req.authUser?.id || 0);
      const existingBatch = await dbGetAsync(
        `SELECT sent_count, recipient_names
         FROM notification_send_batches
         WHERE client_request_id = ? AND sender_user_id = ?
         LIMIT 1`,
        [clientRequestId, senderId]
      );
      if (existingBatch) {
        return res.json({
          success: true,
          deduplicated: true,
          sent_count: Number(existingBatch.sent_count || 0),
          recipient_names: parseJsonText(existingBatch.recipient_names, []) || [],
        });
      }
    }
    return res.status(500).json({ error: error.message || 'Failed to send messages' });
  }
});

app.get('/api/admin/phone-change-requests', requireAdmin, async (req, res) => {
  try {
    await runCustomerRequestPurge();
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
    const payload = await Promise.all((rows || []).map(async (row) => {
      const conflictUserId = Number(row?.conflict_user_id || 0) || null;
      const mergeImpact = conflictUserId ? await getPhoneMergeImpactSummary(conflictUserId) : null;
      return {
        ...serializePhoneChangeRequest(row),
        user_name: row.user_name || null,
        user_email: row.user_email || null,
        user_phone: row.user_phone || null,
        conflict_user_name: row.conflict_user_name || null,
        conflict_user_email: row.conflict_user_email || null,
        reviewed_by_name: row.reviewed_by_name || null,
        merge_impact: mergeImpact,
      };
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
    const mergeIdentity = parseBooleanEnv(req.body?.merge_identity, false);
    const approved = await approvePhoneChangeRequest({
      id: requestId,
      reviewedBy: adminId,
      decisionSource: PHONE_CHANGE_DECISION_ADMIN,
      adminNote: adminNote || 'Approved by admin',
      allowConflictMerge: mergeIdentity,
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
        merge_identity_applied: Boolean(approved?.merge_identity_applied),
        merge_impact: approved?.merge_impact || null,
      },
    });
    return res.json({
      success: true,
      message: 'Phone change request approved',
      request: serialized,
      user: sanitizeUser(approved.user),
      merge_identity_applied: Boolean(approved?.merge_identity_applied),
      merge_impact: approved?.merge_impact || null,
    });
  } catch (error) {
    const status = Number(error?.status || 0) || 500;
    return res.status(status).json({
      error: error.message || 'Failed to approve phone change request',
      code: error?.code || null,
      ...(error?.details && typeof error.details === 'object' ? error.details : {}),
    });
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

app.get('/api/admin/password-reset-requests', requireAdmin, async (_, res) =>
  res.status(410).json({ error: 'Password-based authentication is disabled. Use OTP or OAuth login.' })
);
app.put('/api/admin/password-reset-requests/:id', requireAdmin, async (_, res) =>
  res.status(410).json({ error: 'Password-based authentication is disabled. Use OTP or OAuth login.' })
);

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
        });
      }
    }

    if (!phoneChangeRequest) {
      return res.json(updated);
    }
    return res.json({
      ...updated,
      phone_change_request: phoneChangeRequest,
      message: 'Phone update is pending. You will be notified once it is updated.',
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

registerProductRoutes({
  app,
  requireAdmin,
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  logAdminAuditAsync,
  normalizeProductRecord,
  normalizeProductInput,
  validateProductPayload,
  findProductConflictAsync,
  resolveOrCreateCategoryNameAsync,
  XLSX,
  toProductExportRow,
  PRODUCT_IMPORT_HEADERS,
  PRODUCT_IMPORT_SAMPLE,
  cleanupExpiredImportBatches,
  parseProductFileToRows,
  findExistingProductForImportAsync,
  normalizeTextKey,
  buildProductExactKey,
  crypto,
  createImportBatchChecksum,
  PRODUCT_IMPORT_BATCH_TTL_MS,
  productImportBatches,
  SQL_UPSERT_IMPORT_BATCH,
  applyProductImportBatch,
});

registerOrderRoutes({
  app,
  requireAdmin,
  requireAuth,
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  normalizeOrderStatus,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  normalizeOrderPaymentStatus,
  parseOrderAddress,
  normalizeEmail,
  parsePhoneInput,
  parseBooleanEnv,
  normalizePaymentMethod,
  generateOrderNumber,
  validateCustomerProfile,
  createAppNotification,
  notifyAdmins,
  logAdminAuditAsync,
  logStockLedgerAsync,
});

registerBillingRoutes({
  app,
  requireAuth,
  requireAdmin,
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  normalizeEmail,
  normalizePhone,
  normalizeOrderStatus,
  normalizePaymentMethod,
  normalizeProductRecord,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  resolveClientRequestId,
  isUniqueViolationError,
  generateBillNumber,
  logStockLedgerAsync,
  logAdminAuditAsync,
  createAppNotification,
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
    await runCustomerRequestPurge();
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
    await runCustomerRequestPurge();
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
    await runCustomerRequestPurge();
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
    await runCustomerRequestPurge();
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
           pop.purchase_order_id as payment_purchase_order_id,
           po.id as linked_po_id,
           po.po_status as linked_po_status,
           po.payment_status as linked_po_payment_status,
           po.bill_number as po_bill_number,
           po.invoice_number as po_invoice_number,
           COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
    FROM distributor_ledger dl
    LEFT JOIN distributors d ON d.id = dl.distributor_id
    LEFT JOIN purchase_order_payments pop
      ON dl.source = 'po_payment'
     AND ${SQL_CAST_TO_INT} = pop.id
    LEFT JOIN purchase_orders po
      ON (
        dl.source IN ('purchase_order', 'po_correction')
        AND ${SQL_CAST_TO_INT} = po.id
      )
      OR (
        dl.source = 'po_payment'
        AND pop.purchase_order_id = po.id
      )
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
            pop.purchase_order_id as payment_purchase_order_id,
            po.id as linked_po_id,
            po.po_status as linked_po_status,
            po.payment_status as linked_po_payment_status,
            po.bill_number as po_bill_number,
            po.invoice_number as po_invoice_number,
            COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
     FROM distributor_ledger dl
     LEFT JOIN distributors d ON d.id = dl.distributor_id
     LEFT JOIN purchase_order_payments pop
       ON dl.source = 'po_payment'
      AND ${SQL_CAST_TO_INT} = pop.id
     LEFT JOIN purchase_orders po
       ON (
         dl.source IN ('purchase_order', 'po_correction')
         AND ${SQL_CAST_TO_INT} = po.id
       )
       OR (
         dl.source = 'po_payment'
         AND pop.purchase_order_id = po.id
       )
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

const normalizePurchaseUomToken = (value, fallback = 'pcs') =>
  String(value || fallback).trim().toLowerCase() || fallback;

const PURCHASE_UNIT_FAMILY_BASE_BY_UNIT = Object.freeze({
  pcs: 'pcs',
  dozen: 'pcs',
  kg: 'kg',
  g: 'kg',
  l: 'l',
  ml: 'l',
});

const PURCHASE_UNIT_FAMILY_MULTIPLIERS = Object.freeze({
  pcs: Object.freeze({ pcs: 1, dozen: 12 }),
  kg: Object.freeze({ kg: 1, g: 0.001 }),
  l: Object.freeze({ l: 1, ml: 0.001 }),
});

const getPurchaseUnitFamily = (baseUnit = 'pcs') => {
  const normalizedBase = normalizePurchaseUomToken(baseUnit, 'pcs');
  const familyBase = PURCHASE_UNIT_FAMILY_BASE_BY_UNIT[normalizedBase];
  if (!familyBase) return null;
  const multipliers = PURCHASE_UNIT_FAMILY_MULTIPLIERS[familyBase];
  if (!multipliers || !Number.isFinite(multipliers[normalizedBase])) return null;
  return {
    normalizedBase,
    multipliers,
  };
};

const getAllowedPurchaseUnitsFromBaseUnit = (baseUnit = 'pcs') => {
  const family = getPurchaseUnitFamily(baseUnit);
  if (!family) return [];
  const allUnits = Object.keys(family.multipliers);
  return [family.normalizedBase, ...allUnits.filter((unit) => unit !== family.normalizedBase)];
};

const convertPurchaseQtyBetweenFamilyUnits = (qty, fromUnit, toUnit, baseUnit = 'pcs') => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const family = getPurchaseUnitFamily(baseUnit);
  if (!family) return null;
  const from = normalizePurchaseUomToken(fromUnit, family.normalizedBase);
  const to = normalizePurchaseUomToken(toUnit, family.normalizedBase);
  const fromMultiplier = family.multipliers[from];
  const toMultiplier = family.multipliers[to];
  if (!Number.isFinite(fromMultiplier) || !Number.isFinite(toMultiplier) || toMultiplier <= 0) {
    return null;
  }
  const qtyInCanonicalBase = numericQty * fromMultiplier;
  return qtyInCanonicalBase / toMultiplier;
};

const getPurchaseProductUomProfile = (product = null) => {
  const sellingUnit = normalizePurchaseUomToken(product?.uom, 'pcs');
  const baseUnit = normalizePurchaseUomToken(product?.base_unit, sellingUnit);
  const conversionFactorRaw = Number(product?.conversion_factor ?? 1);
  const conversionFactor = Number.isFinite(conversionFactorRaw) && conversionFactorRaw > 0
    ? conversionFactorRaw
    : 1;
  return {
    sellingUnit,
    baseUnit,
    conversionFactor,
  };
};

const getAllowedPurchaseUnitsForProductRow = (product = null) => {
  const profile = getPurchaseProductUomProfile(product);
  const familyUnits = getAllowedPurchaseUnitsFromBaseUnit(profile.baseUnit);
  if (familyUnits.length) return familyUnits;
  if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
  return [...new Set([profile.baseUnit, profile.sellingUnit])];
};

const toPurchaseBaseQty = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const profile = getPurchaseProductUomProfile(product);
  const requestedUnit = normalizePurchaseUomToken(unit, profile.baseUnit);
  const familyConverted = convertPurchaseQtyBetweenFamilyUnits(numericQty, requestedUnit, profile.baseUnit, profile.baseUnit);
  if (familyConverted !== null) return familyConverted;
  if (requestedUnit === profile.baseUnit) return numericQty;
  if (requestedUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

const createPurchaseValidationError = (message, details = []) => {
  const error = new Error(message);
  error.status = 400;
  if (details.length) error.details = details;
  return error;
};

const normalizePurchaseOrderItems = async (rawItems = []) => {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const productCache = new Map();
  const itemErrors = [];
  const normalizedItems = [];

  for (let index = 0; index < items.length; index += 1) {
    const rowNo = index + 1;
    const it = items[index] || {};
    const productId = Number(it.product_id || 0) || 0;
    if (productId && !productCache.has(productId)) {
      const product = await dbGetAsync(
        `SELECT id, name, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
        [productId]
      );
      productCache.set(productId, product || null);
    }
    const product = productId ? productCache.get(productId) : null;
    if (productId && !product) {
      itemErrors.push(`Item ${rowNo}: product ${productId} not found`);
      continue;
    }

    const quantity = Math.max(0, Number(it.quantity || 0));
    if (quantity <= 0) {
      itemErrors.push(`Item ${rowNo}: quantity must be greater than 0`);
      continue;
    }

    const providedUomRaw = String(it.uom || '').trim();
    let normalizedUom = normalizePurchaseUomToken(providedUomRaw, 'pcs');
    if (product) {
      const allowedUnits = getAllowedPurchaseUnitsForProductRow(product);
      if (providedUomRaw) {
        const requestedUnit = normalizePurchaseUomToken(providedUomRaw, allowedUnits[0] || 'pcs');
        if (!allowedUnits.includes(requestedUnit)) {
          itemErrors.push(
            `Item ${rowNo}: unit "${providedUomRaw}" is invalid for product ${product.id}. Allowed: ${allowedUnits.join(', ')}`
          );
          continue;
        }
        normalizedUom = requestedUnit;
      } else {
        normalizedUom = allowedUnits[0] || getPurchaseProductUomProfile(product).baseUnit;
      }
    }

    const quantityBase = product ? toPurchaseBaseQty(quantity, normalizedUom, product) : quantity;
    const rate = Math.max(0, Number(it.rate ?? it.unit_price ?? 0));
    const gross = quantityBase * rate;
    const discountType = String(it.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
    const discountValue = Math.max(0, Number(it.discount_value || 0));
    const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
    const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
    const taxableValue = Math.max(0, gross - discountAmount);
    const gstRate = Math.max(0, Number(it.gst_rate || 0));
    const taxAmount = (taxableValue * gstRate) / 100;
    const lineTotal = taxableValue + taxAmount;

    normalizedItems.push({
      ...it,
      product_id: productId || null,
      product_name: String(it.product_name || '').trim() || String(product?.name || '').trim() || 'Unknown',
      quantity,
      quantity_base: quantityBase,
      uom: normalizedUom,
      rate,
      unit_price: rate,
      discount_type: discountType,
      discount_value: discountValue,
      taxable_value: taxableValue,
      gst_rate: gstRate,
      tax_amount: taxAmount,
      line_total: lineTotal,
      total: lineTotal,
    });
  }

  if (itemErrors.length) throw createPurchaseValidationError('Invalid purchase order items', itemErrors);
  return normalizedItems;
};

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
      const lifecycleStatus = normalizePoLifecycleStatus(req.query.status, '');
      if (lifecycleStatus) {
        sql += ` AND LOWER(COALESCE(po.po_status, po.status, '')) = LOWER(?)`;
        params.push(lifecycleStatus);
      } else {
        sql += ` AND po.status = ?`;
        params.push(req.query.status);
      }
    }
    if (req.query.payment_status) {
      sql += ` AND LOWER(COALESCE(po.payment_status, 'unpaid')) = LOWER(?)`;
      params.push(normalizePoPaymentStatus(req.query.payment_status));
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
    const payments = await dbAllAsync(
      `SELECT *
       FROM purchase_order_payments
       WHERE purchase_order_id = ?
       ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC`,
      [row.id]
    );
    return res.json({ ...row, items, payments });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders/:id/distributor-whatsapp', requireAdmin, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });

    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    if (lifecycleStatus !== PO_LIFECYCLE_REGISTERED) {
      return res.status(400).json({ error: 'WhatsApp action is available only for registered purchase orders' });
    }

    const items = await dbAllAsync(
      `SELECT product_name, quantity, rate, unit_price
       FROM purchase_order_items
       WHERE order_id = ?
       ORDER BY id ASC`,
      [req.params.id]
    );

    const orderDate = normalizeTransactionDate(order.created_at || order.order_date) || new Date().toISOString().slice(0, 10);
    const distributorNotice = await notifyDistributorPurchaseOrderAsync({
      purchaseOrderId: Number(req.params.id || 0),
      distributorId: Number(order.distributor_id || 0),
      poNumber: order.po_number,
      totalAmount: Number(order.total_amount ?? order.total ?? 0),
      paymentStatus: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
      balanceDue: Number(order.balance_due || 0),
      expectedDelivery: order.expected_delivery || null,
      notes: order.notes || '',
      billNumber: order.bill_number || order.invoice_number || '',
      isUpdate: false,
      items,
      messageDate: orderDate,
      title: `Order for ${orderDate}`,
      preparedBy: req?.authUser?.id || req.body?.created_by || null,
    });

    return res.json({
      success: true,
      distributor_notice: distributorNotice || undefined,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to prepare distributor WhatsApp message' });
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

    const normalizedItems = await normalizePurchaseOrderItems(items);
    const subtotal = normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0);
    const taxAmount = normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
    const totalAmount = normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
    const paymentSnapshot = calculatePoPaymentSnapshot(totalAmount, 0);

    const poNumber = generatePONumber();
    const orderId = await dbTxAsync(async () => {
      const header = await dbRunAsync(
        `INSERT INTO purchase_orders (po_number, distributor_id, subtotal, tax_amount, total_amount, total, status, po_status, payment_status, paid_amount, balance_due, notes, expected_delivery, created_by, client_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          poNumber,
          b.distributor_id,
          subtotal,
          taxAmount,
          totalAmount,
          totalAmount,
          'pending',
          PO_LIFECYCLE_REGISTERED,
          paymentSnapshot.paymentStatus,
          paymentSnapshot.paidAmount,
          paymentSnapshot.balanceDue,
          b.notes || null,
          b.expected_delivery || null,
          b.created_by || null,
          clientRequestId,
        ]
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
    let distributorNotice = null;
    try {
      distributorNotice = await notifyDistributorPurchaseOrderAsync({
        purchaseOrderId: Number(orderId || 0),
        distributorId: Number(b.distributor_id || 0),
        poNumber,
        totalAmount,
        paymentStatus: paymentSnapshot.paymentStatus,
        balanceDue: paymentSnapshot.balanceDue,
        expectedDelivery: b.expected_delivery || null,
        notes: b.notes || '',
        items: normalizedItems,
        messageDate: new Date().toISOString().slice(0, 10),
        isUpdate: false,
        preparedBy: req?.authUser?.id || b.created_by || null,
      });
    } catch (notifyError) {
      console.warn('[NOTIFY] purchase order distributor notification failed:', notifyError?.message || notifyError);
    }

    return res.status(201).json({
      success: true,
      id: orderId,
      po_number: poNumber,
      po_status: PO_LIFECYCLE_REGISTERED,
      payment_status: paymentSnapshot.paymentStatus,
      paid_amount: paymentSnapshot.paidAmount,
      balance_due: paymentSnapshot.balanceDue,
      distributor_notice: distributorNotice || undefined,
    });
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
    if (error.status === 400) {
      return res.status(400).json({ error: error.message, details: error.details || undefined });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Purchase order not found' });
    const currentPoStatus = getPurchaseOrderLifecycleStatus(cur);
    if (currentPoStatus !== PO_LIFECYCLE_REGISTERED) {
      return res.status(400).json({ error: 'Only registered purchase orders can be edited' });
    }
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : null;

    let finalTotalAmount = Number(cur.total_amount ?? cur.total ?? 0);
    let updatedDistributorId = Number(b.distributor_id ?? cur.distributor_id ?? 0) || null;
    let updatedNotes = b.notes ?? cur.notes ?? '';
    let updatedExpectedDelivery = b.expected_delivery ?? cur.expected_delivery ?? null;
    let noticeItems = [];
    if (items) {
      if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
      const normalizedItems = await normalizePurchaseOrderItems(items);
      noticeItems = normalizedItems;
      const subtotal = normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0);
      const taxAmount = normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
      const totalAmount = normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
      const paymentSnapshot = calculatePoPaymentSnapshot(totalAmount, Number(cur.paid_amount || 0));
      finalTotalAmount = totalAmount;
      await dbTxAsync(async () => {
        await dbRunAsync(
          `UPDATE purchase_orders
           SET distributor_id=?, notes=?, expected_delivery=?, status=?, po_status=?, subtotal=?, tax_amount=?, total_amount=?, total=?, payment_status=?, paid_amount=?, balance_due=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
          [
            updatedDistributorId,
            updatedNotes || null,
            updatedExpectedDelivery || null,
            'pending',
            PO_LIFECYCLE_REGISTERED,
            subtotal,
            taxAmount,
            totalAmount,
            totalAmount,
            paymentSnapshot.paymentStatus,
            paymentSnapshot.paidAmount,
            paymentSnapshot.balanceDue,
            req.params.id
          ]
        );
        await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
        for (const it of normalizedItems) {
          await dbRunAsync(
            `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.params.id,
              it.product_id || null,
              it.product_name || 'Unknown',
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
      const nextSubtotal = Number(b.subtotal ?? cur.subtotal ?? 0);
      const nextTaxAmount = Number(b.tax_amount ?? cur.tax_amount ?? 0);
      const nextTotalAmount = Number(b.total_amount ?? cur.total_amount ?? cur.total ?? 0);
      const paymentSnapshot = calculatePoPaymentSnapshot(nextTotalAmount, Number(cur.paid_amount || 0));
      finalTotalAmount = nextTotalAmount;
      await dbRunAsync(
        `UPDATE purchase_orders
         SET distributor_id=?, notes=?, expected_delivery=?, status=?, po_status=?, subtotal=?, tax_amount=?, total_amount=?, total=?, payment_status=?, paid_amount=?, balance_due=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          updatedDistributorId,
          updatedNotes || null,
          updatedExpectedDelivery || null,
          'pending',
          PO_LIFECYCLE_REGISTERED,
          nextSubtotal,
          nextTaxAmount,
          nextTotalAmount,
          nextTotalAmount,
          paymentSnapshot.paymentStatus,
          paymentSnapshot.paidAmount,
          paymentSnapshot.balanceDue,
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
    let distributorNotice = null;
    try {
      distributorNotice = await notifyDistributorPurchaseOrderAsync({
        purchaseOrderId: Number(req.params.id || 0),
        distributorId: updatedDistributorId,
        poNumber: cur.po_number,
        totalAmount: finalTotalAmount,
        paymentStatus: PO_PAYMENT_UNPAID,
        balanceDue: finalTotalAmount,
        expectedDelivery: updatedExpectedDelivery || null,
        notes: updatedNotes || '',
        items: noticeItems,
        messageDate: new Date().toISOString().slice(0, 10),
        isUpdate: true,
        preparedBy: req?.authUser?.id || b.created_by || null,
      });
    } catch (notifyError) {
      console.warn('[NOTIFY] purchase order update distributor notification failed:', notifyError?.message || notifyError);
    }

    return res.json({ success: true, distributor_notice: distributorNotice || undefined });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message, details: error.details || undefined });
    }
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
    const currentPoStatus = getPurchaseOrderLifecycleStatus(order);
    const normalizedRequestedPoStatus = normalizePoLifecycleStatus(status, currentPoStatus);
    const requestedStatusRaw = String(status || '').trim().toLowerCase();
    const isProcessRequest = normalizedRequestedPoStatus === PO_LIFECYCLE_PROCESSED || requestedStatusRaw === 'confirmed';

    if (isProcessRequest) {
      if (currentPoStatus === PO_LIFECYCLE_PROCESSED) {
        return res.status(400).json({ error: 'Purchase order is already processed' });
      }
      if (currentPoStatus === PO_LIFECYCLE_CANCELLED) {
        return res.status(400).json({ error: 'Cancelled purchase order cannot be processed' });
      }
      if (!billNumber) {
        return res.status(400).json({ error: 'bill_number is required when processing a purchase order' });
      }

      const initialPaidAmountRaw = Number(
        req.body?.paid_amount ?? req.body?.initial_paid_amount ?? req.body?.payment_amount ?? 0
      );
      const initialPaidAmount = Math.max(0, initialPaidAmountRaw);
      const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
      const paymentReference = String(req.body?.payment_reference || req.body?.reference || billNumber || '').trim() || null;
      const paymentNotes = String(req.body?.payment_notes || req.body?.notes || '').trim() || null;
      const paymentDate = normalizeTransactionDate(req.body?.payment_date || req.body?.transaction_date || null);

      const totalSnapshot = calculatePoPaymentSnapshot(Number(order.total_amount ?? order.total ?? 0), initialPaidAmount);
      if (initialPaidAmount > totalSnapshot.totalAmount) {
        return res.status(400).json({ error: 'Initial paid amount cannot exceed PO total amount' });
      }

      const stockAlreadyApplied = Number(order.stock_applied_on_confirm || 0) === 1;
      const capAdjustments = [];
      let createdPaymentId = null;
      await dbTxAsync(async () => {
        if (!stockAlreadyApplied) {
          const items = await dbAllAsync(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
          for (const item of items) {
            const productId = Number(item.product_id || 0);
            if (!productId) continue;
            const product = await dbGetAsync(
              `SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
              [productId]
            );
            if (!product) continue;

            const orderedQtyInput = Math.max(0, Number(item.quantity || 0));
            const orderedQty = toPurchaseBaseQty(orderedQtyInput, item.uom, product);
            const beforeStock = Number(product.stock || 0);
            const intendedStock = beforeStock + orderedQty;
            const finalStock = Math.min(PURCHASE_STOCK_CAP, Math.max(0, intendedStock));
            const quantityChange = finalStock - beforeStock;
            const capHit = intendedStock > PURCHASE_STOCK_CAP || beforeStock > PURCHASE_STOCK_CAP;

            if (quantityChange !== 0) {
              await dbRunAsync(`UPDATE products SET stock = ? WHERE id = ?`, [finalStock, productId]);
              const noteLines = ['Auto stock update on PO processing'];
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
                ordered_quantity: orderedQtyInput,
                ordered_quantity_base: orderedQty,
                before_stock: beforeStock,
                intended_stock: intendedStock,
                final_stock: finalStock,
                discarded_quantity: Math.max(0, intendedStock - finalStock),
                discarded_quantity_base: Math.max(0, intendedStock - finalStock),
              });
            }
          }
        }

        const existingPoCredit = await dbGetAsync(
          `SELECT id
           FROM distributor_ledger
           WHERE distributor_id = ?
             AND source = 'purchase_order'
             AND LOWER(type) = 'credit'
             AND (source_id = ? OR source_id = ?)
           ORDER BY id DESC
           LIMIT 1`,
          [order.distributor_id, String(req.params.id), `${req.params.id}.0`]
        );
        if (!existingPoCredit && Number(order.distributor_id || 0) > 0 && totalSnapshot.totalAmount > 0) {
          await createDistributorLedgerEntry(order.distributor_id, {
            type: 'credit',
            transaction_type: 'credit',
            amount: totalSnapshot.totalAmount,
            payment_mode: 'credit',
            reference: order.po_number || `PO-${req.params.id}`,
            bill_number: billNumber || null,
            description: `Purchase Order ${order.po_number || req.params.id}${billNumber ? ` (Bill: ${billNumber})` : ''}`.trim(),
            transaction_date: normalizeTransactionDate(req.body?.transaction_date) || new Date().toISOString().slice(0, 10),
            source: 'purchase_order',
            source_id: req.params.id,
            created_by: req.body?.updated_by || req.body?.created_by || null,
          });
        }

        if (totalSnapshot.paidAmount > 0 && Number(order.distributor_id || 0) > 0) {
          const paymentResult = await dbRunAsync(
            `INSERT INTO purchase_order_payments
             (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.params.id,
              order.distributor_id,
              totalSnapshot.paidAmount,
              paymentMode,
              paymentReference,
              paymentNotes,
              paymentDate,
              req.body?.updated_by || req.body?.created_by || null,
            ]
          );
          createdPaymentId = Number(paymentResult.lastInsertRowid || 0) || null;
          if (createdPaymentId) {
            await createDistributorLedgerEntry(order.distributor_id, {
              type: 'payment',
              transaction_type: 'payment',
              amount: totalSnapshot.paidAmount,
              payment_mode: paymentMode,
              reference: paymentReference || order.po_number || `PO-${req.params.id}`,
              bill_number: billNumber || null,
              description: `PO payment on processing ${order.po_number || req.params.id}`,
              transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
              source: 'po_payment',
              source_id: createdPaymentId,
              created_by: req.body?.updated_by || req.body?.created_by || null,
            });
          }
        }

        await dbRunAsync(
          `UPDATE purchase_orders
           SET status = 'confirmed',
               po_status = ?,
               payment_status = ?,
               paid_amount = ?,
               balance_due = ?,
               bill_number = COALESCE(?, bill_number),
               invoice_number = COALESCE(?, invoice_number),
               stock_applied_on_confirm = 1,
               processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          [
            PO_LIFECYCLE_PROCESSED,
            totalSnapshot.paymentStatus,
            totalSnapshot.paidAmount,
            totalSnapshot.balanceDue,
            billNumber || null,
            billNumber || null,
            req.params.id,
          ]
        );
      });

      let distributorNotice = null;
      try {
        distributorNotice = await notifyDistributorPurchaseOrderAsync({
          purchaseOrderId: Number(req.params.id || 0),
          distributorId: Number(order.distributor_id || 0),
          poNumber: order.po_number,
          totalAmount: totalSnapshot.totalAmount,
          paymentStatus: totalSnapshot.paymentStatus,
          balanceDue: totalSnapshot.balanceDue,
          expectedDelivery: order.expected_delivery || null,
          notes: order.notes || '',
          billNumber: billNumber || '',
          messageDate: new Date().toISOString().slice(0, 10),
          isUpdate: true,
          preparedBy: req?.authUser?.id || req.body?.updated_by || req.body?.created_by || null,
        });
      } catch (notifyError) {
        console.warn('[NOTIFY] processed purchase order distributor notification failed:', notifyError?.message || notifyError);
      }

      await logAdminAuditAsync(req, {
        action: 'purchase_order.status_update',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          status: 'processed',
          po_status: PO_LIFECYCLE_PROCESSED,
          bill_number: billNumber || null,
          initial_paid_amount: totalSnapshot.paidAmount,
          balance_due: totalSnapshot.balanceDue,
          payment_status: totalSnapshot.paymentStatus,
          stock_applied: !stockAlreadyApplied,
          stock_already_applied: stockAlreadyApplied,
          cap_applied_count: capAdjustments.length,
          process_payment_id: createdPaymentId,
        },
      });
      return res.json({
        success: true,
        po_status: PO_LIFECYCLE_PROCESSED,
        payment_status: totalSnapshot.paymentStatus,
        paid_amount: totalSnapshot.paidAmount,
        balance_due: totalSnapshot.balanceDue,
        stock_cap: PURCHASE_STOCK_CAP,
        stock_applied: !stockAlreadyApplied,
        stock_already_applied: stockAlreadyApplied,
        cap_applied_count: capAdjustments.length,
        cap_adjustments: capAdjustments,
        distributor_notice: distributorNotice || undefined,
      });
    }

    if (normalizedRequestedPoStatus === PO_LIFECYCLE_CANCELLED) {
      if (currentPoStatus === PO_LIFECYCLE_PROCESSED) {
        return res.status(400).json({ error: 'Processed purchase order cannot be cancelled' });
      }
      await dbRunAsync(
        `UPDATE purchase_orders
         SET status = 'cancelled',
             po_status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [PO_LIFECYCLE_CANCELLED, req.params.id]
      );
      await logAdminAuditAsync(req, {
        action: 'purchase_order.status_update',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          status: 'cancelled',
          po_status: PO_LIFECYCLE_CANCELLED,
          bill_number: billNumber || null,
        },
      });
      return res.json({ success: true, po_status: PO_LIFECYCLE_CANCELLED });
    }

    if (currentPoStatus !== PO_LIFECYCLE_REGISTERED) {
      return res.status(400).json({ error: 'Only registered purchase orders can be set to pending' });
    }

    await dbRunAsync(
      `UPDATE purchase_orders
       SET status = 'pending',
           po_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [PO_LIFECYCLE_REGISTERED, req.params.id]
    );
    await logAdminAuditAsync(req, {
      action: 'purchase_order.status_update',
      entityType: 'purchase_order',
      entityId: req.params.id,
      details: {
        status: 'pending',
        po_status: PO_LIFECYCLE_REGISTERED,
        bill_number: billNumber || null,
      },
    });
    return res.json({ success: true, po_status: PO_LIFECYCLE_REGISTERED });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders/:id/payments', requireAdmin, async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    const poStatus = getPurchaseOrderLifecycleStatus(order);
    if (poStatus !== PO_LIFECYCLE_PROCESSED) {
      return res.status(400).json({ error: 'Payments are allowed only for processed purchase orders' });
    }

    const amount = Math.max(0, Number(req.body?.amount || 0));
    if (amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });

    const totalSnapshotBefore = calculatePoPaymentSnapshot(
      Number(order.total_amount ?? order.total ?? 0),
      Number(order.paid_amount || 0)
    );
    if (amount > totalSnapshotBefore.balanceDue) {
      return res.status(400).json({ error: 'Payment amount cannot exceed balance due' });
    }

    const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
    const reference = String(req.body?.reference || req.body?.payment_reference || order.bill_number || order.po_number || '').trim() || null;
    const notes = String(req.body?.notes || req.body?.description || '').trim() || null;
    const transactionDate = normalizeTransactionDate(req.body?.transaction_date || req.body?.payment_date || null);
    let paymentId = null;
    let nextSnapshot = totalSnapshotBefore;

    await dbTxAsync(async () => {
      const paymentResult = await dbRunAsync(
        `INSERT INTO purchase_order_payments
         (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          order.distributor_id,
          amount,
          paymentMode,
          reference,
          notes,
          transactionDate,
          req.body?.created_by || req?.authUser?.id || null,
        ]
      );
      paymentId = Number(paymentResult.lastInsertRowid || 0) || null;

      if (paymentId && Number(order.distributor_id || 0) > 0) {
        await createDistributorLedgerEntry(order.distributor_id, {
          type: 'payment',
          transaction_type: 'payment',
          amount,
          payment_mode: paymentMode,
          reference: reference || order.po_number || `PO-${req.params.id}`,
          bill_number: order.bill_number || order.invoice_number || null,
          description: `PO payment for ${order.po_number || req.params.id}`,
          transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
          source: 'po_payment',
          source_id: paymentId,
          created_by: req.body?.created_by || req?.authUser?.id || null,
        });
      }

      nextSnapshot = calculatePoPaymentSnapshot(totalSnapshotBefore.totalAmount, totalSnapshotBefore.paidAmount + amount);
      await dbRunAsync(
        `UPDATE purchase_orders
         SET payment_status = ?,
             paid_amount = ?,
             balance_due = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextSnapshot.paymentStatus, nextSnapshot.paidAmount, nextSnapshot.balanceDue, req.params.id]
      );
    });

    await logAdminAuditAsync(req, {
      action: 'purchase_order.payment_add',
      entityType: 'purchase_order',
      entityId: req.params.id,
      details: {
        amount,
        payment_mode: paymentMode,
        reference,
        payment_id: paymentId,
        payment_status: nextSnapshot.paymentStatus,
        paid_amount: nextSnapshot.paidAmount,
        balance_due: nextSnapshot.balanceDue,
      },
    });

    return res.status(201).json({
      success: true,
      payment_id: paymentId,
      payment_status: nextSnapshot.paymentStatus,
      paid_amount: nextSnapshot.paidAmount,
      balance_due: nextSnapshot.balanceDue,
    });
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
        const receivedQty = Math.max(0, Number(it.received_quantity || 0));
        if (receivedQty <= 0) continue;
        const orderedQtyLimit = Math.max(0, Number(item.quantity || 0));
        const newReceived = Math.min(orderedQtyLimit, Number(item.received_quantity || 0) + receivedQty);
        const appliedReceivedQty = Math.max(0, newReceived - Number(item.received_quantity || 0));
        if (appliedReceivedQty <= 0) continue;
        const product = item.product_id
          ? await dbGetAsync(
            `SELECT id, stock, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
            [item.product_id]
          )
          : null;
        const receivedQtyBase = product ? toPurchaseBaseQty(appliedReceivedQty, item.uom, product) : appliedReceivedQty;
        const unitPrice = Math.max(0, Number(it.unit_price || item.unit_price || item.rate || 0));
        const orderedQtyBase = product ? toPurchaseBaseQty(Number(item.quantity || 0), item.uom, product) : Number(item.quantity || 0);
        const gross = orderedQtyBase * unitPrice;
        const discountType = String(item.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
        const discountValue = Math.max(0, Number(item.discount_value || 0));
        const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
        const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
        const taxableValue = Math.max(0, gross - discountAmount);
        const gstRate = Math.max(0, Number(item.gst_rate || 0));
        const taxAmount = (taxableValue * gstRate) / 100;
        const lineTotal = taxableValue + taxAmount;
        await dbRunAsync(
          `UPDATE purchase_order_items
           SET received_quantity = ?,
               unit_price = ?,
               rate = ?,
               taxable_value = ?,
               tax_amount = ?,
               line_total = ?,
               total = ?
           WHERE id = ?`,
          [
          newReceived,
          unitPrice,
          unitPrice,
          taxableValue,
          taxAmount,
          lineTotal,
          lineTotal,
          item.id,
          ]
        );
        if (item.product_id && shouldApplyStockOnReceive && product) {
          const before = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
          await dbRunAsync(`UPDATE products SET stock = stock + ? WHERE id = ?`, [receivedQtyBase, item.product_id]);
          const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [item.product_id]))?.stock || 0;
          await logStockLedgerAsync({
            productId: item.product_id,
            transactionType: 'PURCHASE',
            quantityChange: receivedQtyBase,
            previousBalance: before,
            newBalance: after,
            referenceType: 'PO',
            referenceId: String(req.params.id),
            userId: b.received_by || null,
          });
        }
      }
      const totals = await dbGetAsync(
        `SELECT
           COALESCE(SUM(taxable_value), 0) AS subtotal,
           COALESCE(SUM(tax_amount), 0) AS tax_amount,
           COALESCE(SUM(line_total), 0) AS total_amount
         FROM purchase_order_items
         WHERE order_id = ?`,
        [req.params.id]
      );
      const receivePaymentSnapshot = calculatePoPaymentSnapshot(
        Number(totals?.total_amount || 0),
        Number(order.paid_amount || 0)
      );
      await dbRunAsync(
        `UPDATE purchase_orders
         SET status = 'received',
             po_status = ?,
             invoice_number = ?,
             subtotal = ?,
             tax_amount = ?,
             total_amount = ?,
             total = ?,
             payment_status = ?,
             paid_amount = ?,
             balance_due = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          PO_LIFECYCLE_PROCESSED,
          b.invoice_number || order.invoice_number || null,
          Number(totals?.subtotal || 0),
          Number(totals?.tax_amount || 0),
          Number(totals?.total_amount || 0),
          Number(totals?.total_amount || 0),
          receivePaymentSnapshot.paymentStatus,
          receivePaymentSnapshot.paidAmount,
          receivePaymentSnapshot.balanceDue,
          req.params.id
        ]
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
    const existing = await dbGetAsync(`SELECT id, po_status, status FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    if (getPurchaseOrderLifecycleStatus(existing) !== PO_LIFECYCLE_REGISTERED) {
      return res.status(400).json({ error: 'Only registered purchase orders can be deleted' });
    }
    await dbRunAsync(`DELETE FROM purchase_order_payments WHERE purchase_order_id = ?`, [req.params.id]);
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
    const productCache = new Map();
    const itemErrors = [];
    const normalizedItems = [];
    for (let index = 0; index < items.length; index += 1) {
      const rowNo = index + 1;
      const it = items[index] || {};
      const productId = Number(it.product_id || 0) || 0;
      if (!productId) {
        itemErrors.push(`Item ${rowNo}: product_id is required`);
        continue;
      }
      if (!productCache.has(productId)) {
        const product = await dbGetAsync(
          `SELECT id, name, uom, base_unit, conversion_factor FROM products WHERE id = ?`,
          [productId]
        );
        productCache.set(productId, product || null);
      }
      const product = productCache.get(productId);
      if (!product) {
        itemErrors.push(`Item ${rowNo}: product ${productId} not found`);
        continue;
      }
      const quantity = Math.max(0, Number(it.quantity || 0));
      if (quantity <= 0) {
        itemErrors.push(`Item ${rowNo}: quantity must be greater than 0`);
        continue;
      }
      const providedUomRaw = String(it.uom || '').trim();
      const allowedUnits = getAllowedPurchaseUnitsForProductRow(product);
      let normalizedUom = allowedUnits[0] || getPurchaseProductUomProfile(product).baseUnit;
      if (providedUomRaw) {
        const requestedUom = normalizePurchaseUomToken(providedUomRaw, normalizedUom);
        if (!allowedUnits.includes(requestedUom)) {
          itemErrors.push(
            `Item ${rowNo}: unit "${providedUomRaw}" is invalid for product ${product.id}. Allowed: ${allowedUnits.join(', ')}`
          );
          continue;
        }
        normalizedUom = requestedUom;
      }
      const quantityBase = toPurchaseBaseQty(quantity, normalizedUom, product);
      const unitPrice = Math.max(0, Number(it.unit_price || 0));
      normalizedItems.push({
        product_id: productId,
        product_name: String(it.product_name || '').trim() || String(product.name || '').trim() || 'Unknown',
        quantity,
        quantity_base: quantityBase,
        uom: normalizedUom,
        unit_price: unitPrice,
        total: quantityBase * unitPrice,
        reason: it.reason || b.reason || null,
      });
    }

    if (itemErrors.length) {
      return res.status(400).json({ error: 'Invalid purchase return items', details: itemErrors });
    }

    const total = normalizedItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
    const returnNumber = generateReturnNumber();
    const returnId = await dbTxAsync(async () => {
      const head = await dbRunAsync(
        `INSERT INTO purchase_returns (return_number, distributor_id, total, reason, return_type, reference_po, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [returnNumber, b.distributor_id, total, b.reason || null, b.return_type || 'return', b.reference_po || null, b.created_by || null]
      );
      const returnId = head.lastInsertRowid;
      for (const it of normalizedItems) {
        await dbRunAsync(
          `INSERT INTO purchase_return_items (return_id, product_id, product_name, quantity, uom, unit_price, total, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            returnId,
            it.product_id || null,
            it.product_name || 'Unknown',
            Number(it.quantity || 0),
            it.uom || 'pcs',
            Number(it.unit_price || 0),
            Number(it.total || 0),
            it.reason || b.reason || null,
          ]
        );
        if (it.product_id) {
          const before = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [it.product_id]))?.stock || 0;
          await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [Number(it.quantity_base || 0), it.product_id]);
          const after = (await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [it.product_id]))?.stock || 0;
          await logStockLedgerAsync({
            productId: it.product_id,
            transactionType: 'PURCHASE_RETURN',
            quantityChange: -Number(it.quantity_base || 0),
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
  startAppNotificationPurgeWorker();
  startCustomerRequestPurgeWorker();

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
  stopAppNotificationPurgeWorker();
  stopCustomerRequestPurgeWorker();
  void Promise.allSettled([closePostgresScaffold()]).finally(() => {
    process.exit(0);
  });
};

if (!IS_VERCEL_RUNTIME) {
  process.once('SIGINT', () => shutdownServer('SIGINT'));
  process.once('SIGTERM', () => shutdownServer('SIGTERM'));
}

module.exports = app;

