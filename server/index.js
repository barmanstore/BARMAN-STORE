require('./loadEnv');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
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
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('./db/postgresScaffold');
const { createExecutionAdapter, normalizeExecutionMode } = require('./db/executionAdapter');
const { createQueryAdapter } = require('./db/queryAdapter');
const {
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
} = require('./db/postgresBootstrap');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'barman-store.db');
const DB_EXECUTION_MODE = normalizeExecutionMode(process.env.DB_EXECUTION_MODE || process.env.DB_CLIENT || 'postgres');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const PROFILE_UPLOAD_DIR = path.join(UPLOADS_DIR, 'profiles');
const POSTGRES_MIGRATIONS_DIR = process.env.POSTGRES_MIGRATIONS_DIR || path.join(__dirname, '..', 'supabase', 'migrations');
const dbExecution = createExecutionAdapter({ mode: DB_EXECUTION_MODE, sqlitePath: DB_PATH });
const db = {
  prepare: (...args) => dbExecution.prepare(...args),
  exec: (...args) => dbExecution.exec(...args),
  pragma: (...args) => dbExecution.pragma(...args),
  transaction: (...args) => dbExecution.transaction(...args),
  close: (...args) => dbExecution.close(...args),
};
let postgresPool = null;
const dbQuery = createQueryAdapter({
  mode: DB_EXECUTION_MODE,
  db,
  getPostgresPool: () => postgresPool,
});
const txStorage = new AsyncLocalStorage();
const getActiveTransaction = () => txStorage.getStore();

const dbRun = (sql, params = []) => dbQuery.run(sql, params);
const dbGet = (sql, params = []) => dbQuery.get(sql, params);
const dbAll = (sql, params = []) => dbQuery.all(sql, params);
const dbTx = (handler) => dbQuery.transaction(handler);
const dbPrepare = (sql) => dbQuery.prepare(sql);
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
const IS_MYSQL_EXECUTION = DB_EXECUTION_MODE === 'mysql';
const IS_POSTGRES_EXECUTION = DB_EXECUTION_MODE === 'postgres';
const SQL_INSERT_IGNORE_CATEGORY = IS_POSTGRES_EXECUTION
  ? `INSERT INTO categories (name, description) VALUES (?, ?) ON CONFLICT (name) DO NOTHING`
  : `INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`;
const SQL_UPSERT_VISITOR_SESSION = IS_POSTGRES_EXECUTION
  ? `INSERT INTO visitor_sessions (session_id, user_id, started_at, last_seen_at, last_path, referrer, user_agent, ip_hash)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       last_seen_at = CURRENT_TIMESTAMP,
       last_path = EXCLUDED.last_path,
       user_id = COALESCE(visitor_sessions.user_id, EXCLUDED.user_id),
       referrer = COALESCE(visitor_sessions.referrer, EXCLUDED.referrer),
       user_agent = COALESCE(visitor_sessions.user_agent, EXCLUDED.user_agent),
       ip_hash = COALESCE(visitor_sessions.ip_hash, EXCLUDED.ip_hash),
       ended_at = NULL`
  : `INSERT INTO visitor_sessions (session_id, user_id, started_at, last_seen_at, last_path, referrer, user_agent, ip_hash)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       last_seen_at = CURRENT_TIMESTAMP,
       last_path = excluded.last_path,
       user_id = COALESCE(visitor_sessions.user_id, excluded.user_id),
       referrer = COALESCE(visitor_sessions.referrer, excluded.referrer),
       user_agent = COALESCE(visitor_sessions.user_agent, excluded.user_agent),
       ip_hash = COALESCE(visitor_sessions.ip_hash, excluded.ip_hash),
       ended_at = NULL`;
const SQL_UPSERT_IMPORT_BATCH = IS_POSTGRES_EXECUTION
  ? `INSERT INTO import_batches (batch_id, kind, created_by, payload, checksum, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, TO_TIMESTAMP(? / 1000.0))
     ON CONFLICT(batch_id) DO UPDATE SET
       kind = EXCLUDED.kind,
       created_by = EXCLUDED.created_by,
       payload = EXCLUDED.payload,
       checksum = EXCLUDED.checksum,
       status = EXCLUDED.status,
       expires_at = EXCLUDED.expires_at`
  : `INSERT OR REPLACE INTO import_batches (batch_id, kind, created_by, payload, checksum, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime(? / 1000, 'unixepoch'))`;
const SQL_CAST_TO_INT = IS_POSTGRES_EXECUTION
  ? `CAST(dl.source_id AS BIGINT)`
  : `CAST(dl.source_id AS INTEGER)`;

const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const startDatabaseScaffolding = async () => {
  console.log(`[DB] Execution mode: ${DB_EXECUTION_MODE}`);

  if (IS_MYSQL_EXECUTION) {
    console.error('[DB] MySQL execution mode is no longer supported in this repo. Set DB_EXECUTION_MODE=postgres.');
    return false;
  }

  if (!IS_POSTGRES_EXECUTION) {
    console.log(`[DB] SQLite mode active (DB_EXECUTION_MODE=${DB_EXECUTION_MODE}, DB_CLIENT=${process.env.DB_CLIENT || 'sqlite'}) | path=${DB_PATH}`);
    return true;
  }

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
    return true;
  } catch (error) {
    console.error(`[DB] Postgres/Supabase initialization failed: ${error.message}`);
    await closePostgresScaffold();
    return false;
  }
};

const AUTO_BACKUP_ENABLED = parseBooleanEnv(process.env.AUTO_BACKUP_ENABLED, false);
const AUTO_BACKUP_ON_STARTUP = parseBooleanEnv(process.env.AUTO_BACKUP_ON_STARTUP, false);
const AUTO_BACKUP_INTERVAL_MINUTES = Math.max(1, Number(process.env.AUTO_BACKUP_INTERVAL_MINUTES || 360));
const AUTO_BACKUP_RETENTION_COUNT = Math.max(0, Number(process.env.AUTO_BACKUP_RETENTION_COUNT || 30));
const AUTO_BACKUP_RETENTION_DAYS = Math.max(0, Number(process.env.AUTO_BACKUP_RETENTION_DAYS || 30));
const PURCHASE_STOCK_CAP_RAW = Number(process.env.PURCHASE_STOCK_CAP || 50);
const PURCHASE_STOCK_CAP = Number.isFinite(PURCHASE_STOCK_CAP_RAW) && PURCHASE_STOCK_CAP_RAW >= 0
  ? PURCHASE_STOCK_CAP_RAW
  : 50;
const AUTO_BACKUP_INTERVAL_MS = AUTO_BACKUP_INTERVAL_MINUTES * 60 * 1000;
let autoBackupTimer = null;
let autoBackupRunning = false;
const autoBackupState = {
  enabled: AUTO_BACKUP_ENABLED,
  interval_minutes: AUTO_BACKUP_INTERVAL_MINUTES,
  retention_count: AUTO_BACKUP_RETENTION_COUNT,
  retention_days: AUTO_BACKUP_RETENTION_DAYS,
  on_startup: AUTO_BACKUP_ON_STARTUP,
  last_run_at: null,
  last_success_at: null,
  last_error: null,
  last_backup_file: null,
  next_run_at: null,
};

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
  'https://narenbarman.github.io',
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
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PROFILE_UPLOAD_DIR)) fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/api/uploads', express.static(UPLOADS_DIR));
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
const OTP_DELIVERY_MODE = String(
  process.env.OTP_DELIVERY_MODE || (AUTH_FLOW_MODE === 'provider' ? 'auto' : 'manual')
).trim().toLowerCase() === 'auto'
  ? 'auto'
  : 'manual';
const OTP_VERIFY_SESSION_TTL_SECONDS = Math.max(60, Number(process.env.OTP_VERIFY_SESSION_TTL_SECONDS || 900));
const BUSINESS_NAME = String(process.env.BUSINESS_NAME || 'BARMAN STORE').trim() || 'BARMAN STORE';
const PASSWORD_RESET_LOGIN_URL = String(
  process.env.PASSWORD_RESET_LOGIN_URL || 'https://narenbarman.github.io/BARMAN_STORE_REACT/#/login'
).trim();
const PHONE_VERIFY_BASE_URL = String(
  process.env.PHONE_VERIFY_BASE_URL || 'https://narenbarman.github.io/BARMAN_STORE_REACT/#/login'
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

const getAuthUserFromRequest = async (req) => {
  const header = String(req.headers.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = sanitizeUser(await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [payload.uid]));
  return user || null;
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
const normalizePaymentMethod = (method) => {
  const raw = String(method || '').trim().toLowerCase();
  if (!raw) return 'cash';
  if (raw === 'cod' || raw === 'cash') return 'cash';
  if (raw === 'credit' || raw === 'store_credit' || raw === 'store-credit') return 'credit';
  return 'cash';
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

const getLatestCreditEntry = (userId) => dbGet(
  `SELECT *
   FROM credit_history
   WHERE user_id = ?
   ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC
   LIMIT 1`,
  [userId]
);

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

const findProductConflict = (payload, { excludeId = null } = {}) => {
  const sku = normalizeTextKey(payload?.sku);
  if (sku) {
    const bySku = excludeId
      ? dbGet(`SELECT id, name, sku FROM products WHERE lower(sku) = ? AND id <> ? LIMIT 1`, [sku, Number(excludeId)])
      : dbGet(`SELECT id, name, sku FROM products WHERE lower(sku) = ? LIMIT 1`, [sku]);
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
      ? dbGet(`SELECT id, name, barcode FROM products WHERE lower(barcode) = ? AND id <> ? LIMIT 1`, [barcode, Number(excludeId)])
      : dbGet(`SELECT id, name, barcode FROM products WHERE lower(barcode) = ? LIMIT 1`, [barcode]);
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
    ? dbAll(
      `SELECT id, name, brand, sub_brand, price, mrp
       FROM products
       WHERE lower(trim(name)) = ?
         AND lower(trim(COALESCE(brand, ''))) = ?
         AND lower(trim(COALESCE(sub_brand, ''))) = ?
         AND id <> ?
       ORDER BY id DESC`,
      [nameKey, brandKey, subBrandKey, Number(excludeId)]
    )
    : dbAll(
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

const findExistingProductForImport = (row) => {
  const id = toPositiveIntOrNull(row.id);
  if (id) {
    const byId = dbGet(`SELECT * FROM products WHERE id = ?`, [id]);
    if (byId) return byId;
  }
  const sku = String(row.sku || '').trim();
  if (sku) {
    const bySku = dbGet(`SELECT * FROM products WHERE lower(sku) = ?`, [sku.toLowerCase()]);
    if (bySku) return bySku;
  }
  const barcode = String(row.barcode || '').trim();
  if (barcode) {
    const byBarcode = dbGet(`SELECT * FROM products WHERE lower(barcode) = ?`, [barcode.toLowerCase()]);
    if (byBarcode) return byBarcode;
  }
  return null;
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

const resolveOrCreateCategoryName = (inputCategory) => {
  const requested = String(inputCategory || '').trim() || 'Groceries';
  const existing = dbGet(`SELECT name FROM categories WHERE lower(name) = lower(?)`, [requested]);
  if (existing?.name) return existing.name;
  dbRun(SQL_INSERT_IGNORE_CATEGORY, [requested, 'Product category']);
  return requested;
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

const closeDatabase = () => {
  try {
    if (db) db.close();
  } catch (_) {
    // ignore close failures
  }
};

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

const reopenDatabase = () => {
  dbExecution.reopen();
};

const ensureBackupDir = () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const makeBackupFileName = (tag = 'manual') => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `barman-store-${tag}-${stamp}.db`;
};

const validateBackupFileName = (name) => /^[a-zA-Z0-9._-]+\.db$/i.test(String(name || ''));

const createDatabaseBackup = (tag = 'manual') => {
  ensureBackupDir();
  const fileName = makeBackupFileName(tag);
  const filePath = path.join(BACKUP_DIR, fileName);
  const escapedPath = filePath.replace(/'/g, "''");

  // Flush WAL changes before creating backup snapshot.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) {
    // not fatal if journal mode is not WAL
  }

  db.exec(`VACUUM INTO '${escapedPath}'`);
  const stat = fs.statSync(filePath);
  return {
    file_name: fileName,
    size_bytes: stat.size,
    created_at: stat.mtime.toISOString(),
    path: filePath,
  };
};

const listDatabaseBackups = () => {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((name) => validateBackupFileName(name))
    .map((name) => {
      const filePath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(filePath);
      return {
        file_name: name,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return files;
};

const isAutoBackupFileName = (name) => /^barman-store-auto-\d{8}-\d{6}\.db$/i.test(String(name || ''));

const pruneAutoBackups = () => {
  ensureBackupDir();
  const allAutoBackups = fs.readdirSync(BACKUP_DIR)
    .filter((name) => validateBackupFileName(name) && isAutoBackupFileName(name))
    .map((name) => {
      const filePath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(filePath);
      return {
        file_name: name,
        path: filePath,
        created_at: stat.mtime,
      };
    })
    .sort((a, b) => b.created_at - a.created_at);

  const now = Date.now();
  const maxAgeMs = AUTO_BACKUP_RETENTION_DAYS > 0 ? AUTO_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000 : 0;
  const removed = [];

  allAutoBackups.forEach((backup, index) => {
    const olderThanDays = maxAgeMs > 0 && (now - backup.created_at.getTime()) > maxAgeMs;
    const beyondCount = AUTO_BACKUP_RETENTION_COUNT > 0 && index >= AUTO_BACKUP_RETENTION_COUNT;
    if (!olderThanDays && !beyondCount) return;
    try {
      fs.unlinkSync(backup.path);
      removed.push(backup.file_name);
    } catch (_) {
      // Ignore cleanup failures; they should not break backup flow.
    }
  });

  return removed;
};

const runAutoBackup = (trigger = 'interval') => {
  if (!AUTO_BACKUP_ENABLED || autoBackupRunning) return null;
  autoBackupRunning = true;
  autoBackupState.last_run_at = new Date().toISOString();
  try {
    const backup = createDatabaseBackup('auto');
    const removed = pruneAutoBackups();
    autoBackupState.last_success_at = new Date().toISOString();
    autoBackupState.last_backup_file = backup.file_name;
    autoBackupState.last_error = null;
    console.log(`[AUTO_BACKUP] Success (${trigger}): ${backup.file_name}${removed.length ? ` | pruned: ${removed.join(', ')}` : ''}`);
    return { backup, removed };
  } catch (error) {
    autoBackupState.last_error = String(error?.message || error);
    console.error(`[AUTO_BACKUP] Failed (${trigger}):`, error?.message || error);
    return null;
  } finally {
    autoBackupRunning = false;
    if (AUTO_BACKUP_ENABLED) {
      autoBackupState.next_run_at = new Date(Date.now() + AUTO_BACKUP_INTERVAL_MS).toISOString();
    }
  }
};

const startAutoBackupScheduler = () => {
  if (!AUTO_BACKUP_ENABLED) {
    autoBackupState.next_run_at = null;
    console.log('[AUTO_BACKUP] Disabled');
    return;
  }
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
  }
  autoBackupState.next_run_at = new Date(Date.now() + AUTO_BACKUP_INTERVAL_MS).toISOString();
  if (AUTO_BACKUP_ON_STARTUP) {
    runAutoBackup('startup');
  } else {
    try {
      const removed = pruneAutoBackups();
      if (removed.length) {
        console.log(`[AUTO_BACKUP] Pruned old auto backups: ${removed.join(', ')}`);
      }
    } catch (_) {
      // Keep startup resilient.
    }
  }
  autoBackupTimer = setInterval(() => {
    runAutoBackup('interval');
  }, AUTO_BACKUP_INTERVAL_MS);
  console.log(`[AUTO_BACKUP] Enabled | every ${AUTO_BACKUP_INTERVAL_MINUTES} minute(s) | retention count=${AUTO_BACKUP_RETENTION_COUNT || 'unlimited'} | retention days=${AUTO_BACKUP_RETENTION_DAYS || 'unlimited'} | startup=${AUTO_BACKUP_ON_STARTUP}`);
};

const assertBackupIntegrity = (filePath) => {
  const checkDb = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const row = checkDb.prepare('PRAGMA integrity_check').get();
    const result = String(row?.integrity_check || '').toLowerCase();
    if (result !== 'ok') {
      throw new Error(`Backup integrity check failed: ${result || 'unknown result'}`);
    }
  } finally {
    checkDb.close();
  }
};

const alterTableSafe = (sql) => {
  try {
    db.exec(sql);
  } catch (_) {
    // ignore duplicate-column failures
  }
};

const initDB = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL DEFAULT 'customer',
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      email_verified INTEGER DEFAULT 0,
      phone TEXT UNIQUE,
      phone_verified INTEGER DEFAULT 0,
      address TEXT,
      profile_image TEXT,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      brand TEXT,
      sub_brand TEXT,
      content TEXT,
      color TEXT,
      price REAL NOT NULL,
      mrp REAL,
      uom TEXT DEFAULT 'pcs',
      sku TEXT,
      barcode TEXT,
      image TEXT,
      stock INTEGER DEFAULT 0,
      category TEXT NOT NULL,
      subcategory TEXT,
      expiry_date DATE,
      default_discount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'fixed',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      shipping_address TEXT,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'pending',
      stock_applied INTEGER DEFAULT 0,
      credit_applied INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance REAL DEFAULT 0,
      description TEXT,
      reference TEXT,
      edited INTEGER DEFAULT 0,
      edited_at DATETIME,
      edited_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      product_name TEXT,
      sku TEXT,
      transaction_type TEXT NOT NULL,
      quantity_change REAL NOT NULL,
      previous_balance REAL DEFAULT 0,
      new_balance REAL DEFAULT 0,
      reference_type TEXT,
      reference_id TEXT,
      user_id INTEGER,
      user_name TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      salesman_name TEXT,
      contacts TEXT,
      address TEXT,
      products_supplied TEXT,
      order_day TEXT,
      delivery_day TEXT,
      payment_terms TEXT DEFAULT 'Net 30',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distributor_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distributor_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance REAL DEFAULT 0,
      payment_mode TEXT,
      reference TEXT,
      bill_number TEXT,
      description TEXT,
      transaction_date DATE,
      source TEXT,
      source_id TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      distributor_id INTEGER NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      expected_delivery DATE,
      invoice_number TEXT,
      stock_applied_on_confirm INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      received_quantity REAL DEFAULT 0,
      uom TEXT DEFAULT 'pcs',
      unit_price REAL NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE NOT NULL,
      distributor_id INTEGER NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      reason TEXT,
      return_type TEXT DEFAULT 'return',
      reference_po TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      uom TEXT DEFAULT 'pcs',
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'pending',
      bill_type TEXT DEFAULT 'sales',
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      mrp REAL DEFAULT 0,
      qty REAL NOT NULL,
      unit TEXT DEFAULT 'pcs',
      discount REAL DEFAULT 0,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER,
      subject TEXT,
      body TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT,
      phone TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      requested_from_ip TEXT,
      processed_by INTEGER,
      processed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      phone TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS phone_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_verification_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_from_ip TEXT,
      requested_by INTEGER,
      admin_note TEXT,
      prepared_event_id INTEGER,
      processed_by INTEGER,
      processed_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      recipient TEXT NOT NULL,
      recipient_user_id INTEGER,
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'prepared',
      error_message TEXT,
      metadata TEXT,
      prepared_by INTEGER,
      sent_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      value REAL DEFAULT 0,
      min_quantity INTEGER DEFAULT 1,
      apply_to_category TEXT,
      apply_to_product INTEGER,
      buy_product_id INTEGER,
      buy_quantity INTEGER DEFAULT 1,
      get_product_id INTEGER,
      get_quantity INTEGER DEFAULT 1,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL,
      created_by INTEGER,
      payload TEXT NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT DEFAULT 'staged',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS visitor_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      last_path TEXT,
      referrer TEXT,
      user_agent TEXT,
      ip_hash TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started_at ON visitor_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_seen_at ON visitor_sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_user_id ON visitor_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_contact_verification_requests_status ON contact_verification_requests(status);
    CREATE INDEX IF NOT EXISTS idx_contact_verification_requests_user_type
      ON contact_verification_requests(user_id, request_type, created_at DESC);
  `);

  alterTableSafe(`ALTER TABLE products ADD COLUMN brand TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN sub_brand TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN content TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN color TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN mrp REAL`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN uom TEXT DEFAULT 'pcs'`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN sku TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN barcode TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN subcategory TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN expiry_date DATE`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN default_discount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN discount_type TEXT DEFAULT 'fixed'`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN order_number TEXT`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN user_id INTEGER`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN shipping_address TEXT`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cash'`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN stock_applied INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN credit_applied INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE order_items ADD COLUMN total REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN email TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN phone TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN address TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN profile_image TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN credit_limit REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE password_reset_requests ADD COLUMN requested_from_ip TEXT`);
  alterTableSafe(`ALTER TABLE password_reset_requests ADD COLUMN processed_by INTEGER`);
  alterTableSafe(`ALTER TABLE password_reset_requests ADD COLUMN processed_at DATETIME`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN requested_from_ip TEXT`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN requested_by INTEGER`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN admin_note TEXT`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN prepared_event_id INTEGER`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN processed_by INTEGER`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN processed_at DATETIME`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN completed_at DATETIME`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN created_at DATETIME`);
  alterTableSafe(`ALTER TABLE contact_verification_requests ADD COLUMN updated_at DATETIME`);
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN transaction_date DATE`);
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN created_by INTEGER`);
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN edited INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN edited_at DATETIME`);
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN edited_by INTEGER`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN product_name TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN sku TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN transaction_type TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN quantity_change REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN previous_balance REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN new_balance REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN reference_type TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN reference_id TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN user_id INTEGER`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN user_name TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN notes TEXT`);
  alterTableSafe(`ALTER TABLE bills ADD COLUMN paid_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE bills ADD COLUMN credit_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE bills ADD COLUMN notes TEXT`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN subtotal REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN tax_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN total_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN bill_number TEXT`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN stock_applied_on_confirm INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN source TEXT`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN source_id TEXT`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN transaction_date DATE`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN created_by INTEGER`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN bill_number TEXT`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN rate REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN gst_rate REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN discount_type TEXT DEFAULT 'percent'`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN discount_value REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN taxable_value REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN tax_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN line_total REAL DEFAULT 0`);
  // Backfill legacy "Parent -> Child" text into dedicated hierarchy columns.
  try {
    dbRun(
      `UPDATE products
       SET subcategory = trim(substr(category, instr(category, '->') + 2)),
           category = trim(substr(category, 1, instr(category, '->') - 1))
       WHERE instr(category, '->') > 0
         AND (subcategory IS NULL OR trim(subcategory) = '')
         AND trim(substr(category, 1, instr(category, '->') - 1)) <> ''
         AND trim(substr(category, instr(category, '->') + 2)) <> ''`
    );
  } catch (_) {
    // ignore backfill failures
  }
  try {
    dbRun(
      `UPDATE products
       SET sub_brand = trim(substr(brand, instr(brand, '->') + 2)),
           brand = trim(substr(brand, 1, instr(brand, '->') - 1))
       WHERE brand IS NOT NULL
         AND instr(brand, '->') > 0
         AND (sub_brand IS NULL OR trim(sub_brand) = '')
         AND trim(substr(brand, 1, instr(brand, '->') - 1)) <> ''
         AND trim(substr(brand, instr(brand, '->') + 2)) <> ''`
    );
  } catch (_) {
    // ignore backfill failures
  }

  // Backfill from legacy "password" column if present.
  try {
    const legacyUsers = dbAll(`SELECT id, password, password_hash FROM users`);
    legacyUsers.forEach((u) => {
      if (!u.password_hash && u.password) {
        const normalized = isSha256Hex(u.password) ? String(u.password).toLowerCase() : hashPassword(u.password);
        dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [normalized, u.id]);
      }
    });

  } catch (_) {
    // ignore when legacy password column does not exist
  }

  const adminCount = dbGet(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)?.count || 0;
  if (adminCount === 0) {
    const bootstrapAdminEmail = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
    const bootstrapAdminPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
    if (bootstrapAdminEmail && isStrongPassword(bootstrapAdminPassword)) {
      dbRun(
        `INSERT INTO users (role, name, email, email_verified, phone, address, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['admin', 'Administrator', bootstrapAdminEmail, 1, null, null, hashPassword(bootstrapAdminPassword), 0]
      );
      console.warn('Bootstrap admin account created from environment configuration.');
    } else {
      console.warn('No admin user exists. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create the initial admin account.');
    }
  }

  const productCount = dbGet(`SELECT COUNT(*) AS count FROM products`)?.count || 0;
  if (productCount === 0) {
    const products = [
      ['Premium Coffee Beans', 'Artisan roasted coffee beans from Colombia', 'CoffeeCo', '250g', 'Brown', 24.99, 29.99, 'pcs', 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500', 50, 'Groceries'],
      ['Barista Apron', 'Premium cotton barista apron', 'BarWear', 'L', 'Black', 34.99, 39.99, 'pcs', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=500', 30, 'Stationery'],
      ['Corn Flakes', 'Crunchy breakfast cereal', 'CerealPro', '500g', 'Yellow', 119.0, 129.0, 'box', 'https://images.unsplash.com/photo-1571748982800-fa51082c2224?w=500', 100, 'Cereals'],
      ['Digestive Biscuits', 'Whole wheat digestive biscuits', 'WheatB', '250g', 'Brown', 49.0, 55.0, 'pack', 'https://images.unsplash.com/photo-1612203985729-70726954388c?w=500', 150, 'Biscuits'],
    ];
    const stmt = dbPrepare(`
      INSERT INTO products
      (name, description, brand, content, color, price, mrp, uom, sku, image, stock, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = dbTx((rows) => {
      rows.forEach((p) => {
        const sku = generateSku(p[0], p[2], p[3], p[6]);
        stmt.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], sku, p[8], p[9], p[10]);
      });
    });
    tx(products);
  }

  const categories = dbAll(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''`);
  categories.forEach((c) => {
    dbRun(SQL_INSERT_IGNORE_CATEGORY, [
      c.category,
      `${c.category} products`,
    ]);
  });
};

if (!IS_POSTGRES_EXECUTION) {
  initDB();
} else {
  console.log(`[DB] Skipping SQLite initDB bootstrap in ${DB_EXECUTION_MODE} execution mode.`);
}

// Simple notify endpoint used by admin UI to send in-app messages to customers when order status changes.
app.post('/api/notify-order/:orderId', async (req, res) => {
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

const logStockLedger = ({
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
  const product = dbGet(`SELECT name, sku FROM products WHERE id = ?`, [productId]);
  dbRun(
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

app.post('/api/auth/login', authIpLimiter, async (req, res) => {
  try {
    const { email, phone, password } = req.body || {};
    let user = null;
    if (email) {
      user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)]);
    } else if (phone) {
      const phoneParsed = parsePhoneInput(phone, { required: true });
      if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
      const normalizedPhone = phoneParsed.value;
      user = await dbGetAsync(`SELECT * FROM users WHERE phone = ?`, [normalizedPhone]);
    } else {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }

    const passwordOk = verifyPassword(password, user);
    if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' });

    return res.json({
      success: true,
      user: sanitizeUser(user),
      token: generateToken(user),
      message: `Welcome back, ${user.name}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', authIpLimiter, async (req, res) => {
  try {
    const { email, phone, password, confirmPassword, name, address } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const phoneParsed = parsePhoneInput(phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }
    if (String(password || '') !== String(confirmPassword || '')) {
      return res.status(400).json({ error: 'Password and confirm password do not match' });
    }

    if (normalizedEmail && await dbGetAsync(`SELECT id FROM users WHERE email = ?`, [normalizedEmail])) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (normalizedPhone && await dbGetAsync(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone])) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const result = await dbRunAsync(
      `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['customer', name || 'Customer', normalizedEmail, 0, normalizedPhone, 0, address || null, hashPassword(password), 0]
    );
    const user = await dbGetAsync(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
    let emailVerification = null;
    let phoneVerification = null;
    if (normalizedEmail) {
      emailVerification = await sendEmailVerificationChallenge({
        userId: user.id,
        email: normalizedEmail,
        recipientName: user.name,
      });
    }
    if (normalizedPhone) {
      phoneVerification = await sendPhoneVerificationChallenge({
        userId: user.id,
        phone: normalizedPhone,
        recipientName: user.name,
      });
    }
    return res.status(201).json({
      success: true,
      user: sanitizeUser(user),
      token: generateToken(user),
      email_verification: emailVerification,
      phone_verification: phoneVerification,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/change-password', authIpLimiter, async (req, res) => {
  try {
    const { email, phone, currentPassword, newPassword, confirmPassword } = req.body || {};
    let user = null;
    if (email) {
      user = await dbGetAsync(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)]);
    } else if (phone) {
      const phoneParsed = parsePhoneInput(phone, { required: true });
      if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
      user = await dbGetAsync(`SELECT * FROM users WHERE phone = ?`, [phoneParsed.value]);
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    const passwordOk = verifyPassword(currentPassword, user);
    if (!passwordOk) return res.status(401).json({ error: 'Current password is incorrect' });
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }
    if (String(newPassword || '') !== String(confirmPassword || '')) {
      return res.status(400).json({ error: 'New password and confirm password do not match' });
    }
    await dbRunAsync(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`, [hashPassword(newPassword), user.id]);
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/request-password-reset', authIpLimiter, passwordResetIdentifierLimiter, async (req, res) => {
  try {
    const { email, phone, reason } = req.body || {};
    const reasonText = String(reason || '').trim();
    const normalizedEmail = normalizeEmail(email);
    const phoneParsed = parsePhoneInput(phone);
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    if (reasonText.length < 5) {
      return res.status(400).json({ error: 'Reason is required (min 5 characters)' });
    }
    let user = null;
    if (normalizedEmail) {
      user = await dbGetAsync(`SELECT id, name, email, phone FROM users WHERE email = ?`, [normalizedEmail]);
    } else if (normalizedPhone) {
      user = await dbGetAsync(`SELECT id, name, email, phone FROM users WHERE phone = ?`, [normalizedPhone]);
    }

    if (PASSWORD_RESET_MODE === 'otp') {
      if (!user?.phone) {
        // Keep account enumeration hard even in OTP mode.
        return res.status(201).json({
          success: true,
          mode: PASSWORD_RESET_MODE,
          delivery_mode: OTP_DELIVERY_MODE,
          message: 'If the account exists, reset instructions will be sent.',
        });
      }
      const otpCode = generateOtpCode(6);
      const otpHash = hashPassword(otpCode);
      const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
      await dbRunAsync(
        `INSERT INTO password_reset_otps (user_id, phone, otp_hash, expires_at, attempts, max_attempts, used)
         VALUES (?, ?, ?, ?, 0, ?, 0)`,
        [user.id, user.phone, otpHash, expiresAt, OTP_MAX_ATTEMPTS]
      );
      if (OTP_DELIVERY_MODE === 'auto') {
        if (!otpProvider?.isReady) {
          return res.status(503).json({
            error: 'OTP provider is not configured',
            missing: otpProvider?.missing || [],
          });
        }
        await otpProvider.sendOtp({ phone: user.phone, code: otpCode });
      } else {
        const preparedWhatsApp = notificationService.prepareWhatsApp({
          type: 'password_reset_otp',
          to: user.phone,
          payload: {
            recipientName: null,
            code: otpCode,
            link: '',
            expiresAt,
          },
        });
        await createNotificationEvent({
          type: 'password_reset_otp',
          channel: 'whatsapp',
          recipient: user.phone,
          recipientUserId: user.id,
          subject: 'Password reset OTP prepared',
          body: preparedWhatsApp.text,
          metadata: {
            mode: 'manual',
            phone: user.phone,
            expires_at: expiresAt,
            whatsapp_url: preparedWhatsApp.whatsapp_url,
          },
          status: 'prepared',
        });
      }
      return res.status(201).json({
        success: true,
        mode: PASSWORD_RESET_MODE,
        delivery_mode: OTP_DELIVERY_MODE,
        message: OTP_DELIVERY_MODE === 'auto'
          ? 'OTP sent successfully'
          : 'OTP generated for manual handling',
      });
    }

    if (user) {
      await dbRunAsync(
        `INSERT INTO password_reset_requests (user_id, email, phone, reason, status, requested_from_ip)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [user.id, user.email || null, user.phone || null, reasonText, req.ip || req.connection?.remoteAddress || null]
      );
    }
    return res.status(201).json({
      success: true,
      mode: PASSWORD_RESET_MODE,
      message: 'Password reset request submitted to admin',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/email/verification/request', authIpLimiter, emailVerificationLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
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
    if (!normalizedEmail || !token) {
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
    const user = await dbGetAsync(`SELECT id, email, email_verified FROM users WHERE id = ?`, [req.authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      email: user.email || null,
      email_verified: Number(user.email_verified || 0) === 1,
      mode: EMAIL_VERIFICATION_MODE,
      provider_ready: Boolean(emailVerificationProvider?.isReady),
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

app.post('/api/auth/reset-password/otp/verify', authIpLimiter, async (req, res) => {
  try {
    if (PASSWORD_RESET_MODE !== 'otp') {
      return res.status(400).json({ error: 'OTP reset is disabled', mode: PASSWORD_RESET_MODE });
    }
    const phoneParsed = parsePhoneInput(req.body?.phone, { required: true });
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const otpCode = String(req.body?.otp || req.body?.code || '').trim();
    if (!otpCode) return res.status(400).json({ error: 'OTP is required' });

    const user = await dbGetAsync(`SELECT id, phone FROM users WHERE phone = ?`, [normalizedPhone]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired OTP' });
    const otpRow = await dbGetAsync(
      `SELECT * FROM password_reset_otps
       WHERE user_id = ? AND phone = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedPhone]
    );
    if (!otpRow) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const now = Date.now();
    const expiresAt = new Date(otpRow.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE password_reset_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    if (Number(otpRow.attempts || 0) >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS)) {
      await dbRunAsync(`UPDATE password_reset_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
      return res.status(400).json({ error: 'OTP attempt limit reached' });
    }

    const otpOk = verifyPassword(otpCode, { password_hash: otpRow.otp_hash });
    if (!otpOk) {
      const nextAttempts = Number(otpRow.attempts || 0) + 1;
      const exhausted = nextAttempts >= Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS);
      await dbRunAsync(
        `UPDATE password_reset_otps SET attempts = ?, used = ? WHERE id = ?`,
        [nextAttempts, exhausted ? 1 : Number(otpRow.used || 0), otpRow.id]
      );
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await dbRunAsync(`UPDATE password_reset_otps SET used = 1 WHERE id = ?`, [otpRow.id]);
    await dbRunAsync(`UPDATE password_reset_sessions SET used = 1 WHERE user_id = ? AND phone = ? AND used = 0`, [user.id, normalizedPhone]);
    const resetToken = generateOpaqueToken(24);
    const tokenHash = hashOpaqueToken(resetToken);
    const sessionExpiresAt = new Date(Date.now() + OTP_VERIFY_SESSION_TTL_SECONDS * 1000).toISOString();
    await dbRunAsync(
      `INSERT INTO password_reset_sessions (user_id, phone, token_hash, expires_at, used)
       VALUES (?, ?, ?, ?, 0)`,
      [user.id, normalizedPhone, tokenHash, sessionExpiresAt]
    );
    return res.json({
      success: true,
      mode: PASSWORD_RESET_MODE,
      reset_token: resetToken,
      expires_at: sessionExpiresAt,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

app.post('/api/auth/reset-password/otp/complete', authIpLimiter, async (req, res) => {
  try {
    if (PASSWORD_RESET_MODE !== 'otp') {
      return res.status(400).json({ error: 'OTP reset is disabled', mode: PASSWORD_RESET_MODE });
    }
    const phoneParsed = parsePhoneInput(req.body?.phone, { required: true });
    if (phoneParsed.error) return res.status(400).json({ error: phoneParsed.error });
    const normalizedPhone = phoneParsed.value;
    const resetToken = String(req.body?.reset_token || req.body?.resetToken || req.body?.token || '').trim();
    const newPassword = String(req.body?.new_password || req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirm_password || req.body?.confirmPassword || '');
    if (!resetToken) return res.status(400).json({ error: 'reset_token is required' });
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Password and confirm password do not match' });
    }

    const user = await dbGetAsync(`SELECT id, phone FROM users WHERE phone = ?`, [normalizedPhone]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });
    const tokenHash = hashOpaqueToken(resetToken);
    const session = await dbGetAsync(
      `SELECT * FROM password_reset_sessions
       WHERE user_id = ? AND phone = ? AND token_hash = ? AND used = 0
       ORDER BY id DESC LIMIT 1`,
      [user.id, normalizedPhone, tokenHash]
    );
    if (!session) return res.status(400).json({ error: 'Invalid or expired reset token' });
    const now = Date.now();
    const expiresAt = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await dbRunAsync(`UPDATE password_reset_sessions SET used = 1 WHERE id = ?`, [session.id]);
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await dbRunAsync(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`, [hashPassword(newPassword), user.id]);
    await dbRunAsync(`UPDATE password_reset_sessions SET used = 1 WHERE id = ?`, [session.id]);
    await createNotificationEvent({
      type: 'password_reset_otp_completed',
      channel: 'auth',
      recipient: normalizedPhone,
      recipientUserId: user.id,
      subject: 'Password reset completed via OTP',
      body: 'Password reset was completed using OTP verification.',
      metadata: { mode: 'otp' },
      status: 'sent',
    });
    return res.json({ success: true, message: 'Password reset completed successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to complete OTP reset' });
  }
});

app.get('/api/auth/reset-mode', (_, res) => {
  return res.json({
    auth_flow_mode: AUTH_FLOW_MODE,
    mode: PASSWORD_RESET_MODE,
    otp_provider: OTP_PROVIDER,
    otp_delivery_mode: OTP_DELIVERY_MODE,
    otp_ready: PASSWORD_RESET_MODE === 'otp' ? Boolean(otpProvider?.isReady) : false,
    otp_verify_session_ttl_seconds: OTP_VERIFY_SESSION_TTL_SECONDS,
    phone_verification_required: PHONE_VERIFICATION_REQUIRED,
    whatsapp_delivery_mode: WHATSAPP_DELIVERY_MODE,
    whatsapp_provider: WHATSAPP_PROVIDER,
    whatsapp_provider_ready: Boolean(whatsappProvider?.isReady),
    email_verification_mode: EMAIL_VERIFICATION_MODE,
    email_delivery_mode: EMAIL_DELIVERY_MODE,
    email_provider_ready: Boolean(emailVerificationProvider?.isReady),
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
    const windowArg = IS_POSTGRES_EXECUTION
      ? -VISITOR_ONLINE_WINDOW_MINUTES
      : `-${VISITOR_ONLINE_WINDOW_MINUTES} minutes`;

    const onlineVisitors = Number(
      (await dbGetAsync(
        IS_POSTGRES_EXECUTION
          ? `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`
          : `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE datetime(last_seen_at) >= datetime('now', ?)`,
        [windowArg]
      ))?.count || 0
    );
    const onlineLoggedInUsers = Number(
      (await dbGetAsync(
        IS_POSTGRES_EXECUTION
          ? `SELECT COUNT(DISTINCT user_id) AS count
             FROM visitor_sessions
             WHERE user_id IS NOT NULL
               AND last_seen_at >= (CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'))`
          : `SELECT COUNT(DISTINCT user_id) AS count
             FROM visitor_sessions
             WHERE user_id IS NOT NULL
               AND datetime(last_seen_at) >= datetime('now', ?)`,
        [windowArg]
      ))?.count || 0
    );
    const uniqueSessionsToday = Number(
      (await dbGetAsync(
        IS_POSTGRES_EXECUTION
          ? `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE DATE(started_at) = CURRENT_DATE`
          : `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE date(started_at, 'localtime') = date('now', 'localtime')`
      ))?.count || 0
    );
    const uniqueSessionsMonth = Number(
      (await dbGetAsync(
        IS_POSTGRES_EXECUTION
          ? `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE TO_CHAR(started_at, 'YYYY-MM') = TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM')`
          : `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE strftime('%Y-%m', started_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`
      ))?.count || 0
    );
    const uniqueSessionsYear = Number(
      (await dbGetAsync(
        IS_POSTGRES_EXECUTION
          ? `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE EXTRACT(YEAR FROM started_at) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)`
          : `SELECT COUNT(DISTINCT session_id) AS count
             FROM visitor_sessions
             WHERE strftime('%Y', started_at, 'localtime') = strftime('%Y', 'now', 'localtime')`
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
  try {
    const rows = await dbAllAsync(`
      SELECT prr.*, u.name as user_name, p.name as processed_by_name
      FROM password_reset_requests prr
      LEFT JOIN users u ON u.id = prr.user_id
      LEFT JOIN users p ON p.id = prr.processed_by
      ORDER BY prr.created_at DESC
    `);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/password-reset-requests/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notify_channel } = req.body || {};
    const normalizedStatus = String(status || '').toLowerCase();
    if (!['approved', 'rejected', 'pending'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const request = await dbGetAsync(`SELECT * FROM password_reset_requests WHERE id = ?`, [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const processedAt = new Date().toISOString();
    const notifyChannel = String(notify_channel || 'none').trim().toLowerCase();
    if (!['none', 'email', 'whatsapp', 'both'].includes(notifyChannel)) {
      return res.status(400).json({ error: 'Invalid notify channel' });
    }
    if (normalizedStatus !== 'approved' && notifyChannel !== 'none') {
      return res.status(400).json({ error: 'Notification preparation is available only for approved requests' });
    }
    const targetUser = request.user_id
      ? await dbGetAsync(`SELECT id, name, email, phone FROM users WHERE id = ?`, [request.user_id])
      : null;
    const recipientName = String(targetUser?.name || 'Customer').trim() || 'Customer';
    const recipientEmail = normalizeEmail(targetUser?.email || request.email);
    const recipientPhone = normalizePhone(targetUser?.phone || request.phone);
    let generatedPassword = '';
    let adminNote = '';
    if (normalizedStatus === 'approved') {
      if (!request.user_id) {
        return res.status(400).json({ error: 'User reference is required for approved reset' });
      }
      if (notifyChannel === 'none') {
        return res.status(400).json({ error: 'Choose email or WhatsApp for approved reset' });
      }
      if ((notifyChannel === 'email' || notifyChannel === 'both') && !recipientEmail) {
        return res.status(400).json({ error: 'Email is not available for this user' });
      }
      if ((notifyChannel === 'whatsapp' || notifyChannel === 'both') && !recipientPhone) {
        return res.status(400).json({ error: 'Phone number is not available for this user' });
      }
      generatedPassword = generateTemporaryPassword();
      await dbRunAsync(`UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?`, [
        hashPassword(generatedPassword),
        request.user_id,
      ]);
      adminNote = `Password reset approved by admin. Temporary password was generated automatically and shared via ${notifyChannel}.`;
    } else if (normalizedStatus === 'rejected') {
      adminNote = 'Password reset request rejected by admin.';
    } else {
      adminNote = 'Password reset request moved to pending by admin.';
    }
    await dbRunAsync(
      `UPDATE password_reset_requests
       SET status = ?, admin_note = ?, processed_by = ?, processed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedStatus, adminNote, Number(req.authUser?.id || 0) || null, processedAt, req.params.id]
    );
    const response = { success: true, status: normalizedStatus, admin_note: adminNote };
    if (normalizedStatus === 'approved' && notifyChannel !== 'none') {
      const preparedBy = Number(req.authUser?.id || 0) || null;
      const templatePayload = {
        recipientName,
        newPassword: generatedPassword,
        loginIdentifier: recipientEmail || recipientPhone || '',
        loginUrl: PASSWORD_RESET_LOGIN_URL,
      };
      const notification = {};
      if (notifyChannel === 'email' || notifyChannel === 'both') {
        const preparedEmail = notificationService.prepareEmail({
          type: 'password_reset_admin',
          to: recipientEmail,
          payload: templatePayload,
        });
        const eventId = await createNotificationEvent({
          type: 'password_reset_admin',
          channel: 'email',
          recipient: preparedEmail.to,
          recipientUserId: Number(request.user_id || 0) || null,
          subject: preparedEmail.subject,
          body: preparedEmail.body,
          metadata: {
            mode: 'manual',
            request_id: Number(req.params.id || 0) || null,
            login_url: PASSWORD_RESET_LOGIN_URL,
          },
          status: 'prepared',
          preparedBy,
        });
        notification.email = {
          event_id: eventId,
          ...preparedEmail,
        };
      }
      if (notifyChannel === 'whatsapp' || notifyChannel === 'both') {
        const preparedWhatsApp = notificationService.prepareWhatsApp({
          type: 'password_reset_admin',
          to: recipientPhone,
          payload: templatePayload,
        });
        const eventId = await createNotificationEvent({
          type: 'password_reset_admin',
          channel: 'whatsapp',
          recipient: preparedWhatsApp.to,
          recipientUserId: Number(request.user_id || 0) || null,
          subject: 'Password reset by admin',
          body: preparedWhatsApp.text,
          metadata: {
            mode: 'manual',
            request_id: Number(req.params.id || 0) || null,
            login_url: PASSWORD_RESET_LOGIN_URL,
            whatsapp_url: preparedWhatsApp.whatsapp_url,
          },
          status: 'prepared',
          preparedBy,
        });
        notification.whatsapp = {
          event_id: eventId,
          ...preparedWhatsApp,
        };
      }
      response.notification = notification;
    }
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/backup/create', requireAdmin, (_, res) => {
  try {
    if (IS_POSTGRES_EXECUTION) {
      return res.status(501).json({
        error: 'Backup API is SQLite-only in-app. Use database-native tooling for Postgres backups.',
      });
    }
    const backup = createDatabaseBackup('manual');
    return res.status(201).json({ success: true, backup });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/backup/status', requireAdmin, (_, res) => {
  try {
    return res.json({
      ...autoBackupState,
      mode: DB_EXECUTION_MODE,
      running: autoBackupRunning,
      backup_dir: BACKUP_DIR,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/backup/list', requireAdmin, (_, res) => {
  try {
    if (IS_POSTGRES_EXECUTION) return res.json([]);
    return res.json(listDatabaseBackups());
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/backup/download/:fileName', requireAdmin, async (req, res) => {
  try {
    if (IS_POSTGRES_EXECUTION) {
      return res.status(501).json({
        error: 'Backup download is SQLite-only in-app. Use database dump files managed outside this API.',
      });
    }
    const { fileName } = req.params;
    if (!validateBackupFileName(fileName)) {
      return res.status(400).json({ error: 'Invalid backup file name' });
    }
    const filePath = path.join(BACKUP_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    return res.download(filePath, fileName);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/backup/restore', requireAdmin, async (req, res) => {
  try {
    if (IS_POSTGRES_EXECUTION) {
      return res.status(501).json({
        error: 'Restore API is SQLite-only in-app. Use database-native restore tooling for Postgres restores.',
      });
    }
    const fileName = String(req.body?.file_name || '').trim();
    if (!validateBackupFileName(fileName)) {
      return res.status(400).json({ error: 'Valid file_name is required' });
    }

    const sourcePath = path.join(BACKUP_DIR, fileName);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    assertBackupIntegrity(sourcePath);
    const preRestoreBackup = createDatabaseBackup('pre-restore');

    closeDatabase();
    fs.copyFileSync(sourcePath, DB_PATH);
    reopenDatabase();

    return res.json({
      success: true,
      message: 'Database restored successfully',
      restored_file: fileName,
      pre_restore_backup: preRestoreBackup.file_name,
    });
  } catch (error) {
    try {
      await dbGetAsync('SELECT 1');
    } catch (_) {
      try {
        reopenDatabase();
      } catch (_) {
        // ignore recovery failures
      }
    }
    return res.status(500).json({ error: error.message });
  }
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
    const { name, email, phone, address, password, role } = req.body || {};
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
    const providedPassword = String(password || '');
    if (providedPassword && !isStrongPassword(providedPassword)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }
    if (userRole === 'admin' && !isStrongPassword(providedPassword)) {
      return res.status(400).json({ error: 'Admin password is required and must be strong.' });
    }
    const nextPassword = providedPassword || generateTemporaryPassword();
    const mustChangePassword = providedPassword ? 0 : 1;
    const requestedEmailVerified = Number(req.body?.email_verified || 0) === 1;
    const requestedPhoneVerified = Number(req.body?.phone_verified || 0) === 1;
    const emailVerifiedValue = normalizedEmail ? (requestedEmailVerified ? 1 : 0) : 0;
    const phoneVerifiedValue = normalizedPhone ? (requestedPhoneVerified ? 1 : 0) : 0;
    const result = await dbRunAsync(
      `INSERT INTO users (role, name, email, email_verified, phone, phone_verified, address, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userRole, String(name).trim(), normalizedEmail, emailVerifiedValue, normalizedPhone, phoneVerifiedValue, address || null, hashPassword(nextPassword), mustChangePassword]
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
    const normalizedPhone = phoneParsed.value;
    const currentEmail = normalizeEmail(current.email);
    const currentPhone = normalizePhone(current.phone);
    const emailValue = email !== undefined ? normalizeEmail(email) : currentEmail;
    if (emailValue) {
      const existing = await dbGetAsync(`SELECT id FROM users WHERE email = ? AND id != ?`, [emailValue, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Email already in use' });
    }
    if (normalizedPhone) {
      const existing = await dbGetAsync(`SELECT id FROM users WHERE phone = ? AND id != ?`, [normalizedPhone, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Phone number already in use' });
    }
    let emailVerifiedValue = Number(current.email_verified || 0) === 1 ? 1 : 0;
    let phoneVerifiedValue = Number(current.phone_verified || 0) === 1 ? 1 : 0;
    const emailChanged = email !== undefined && emailValue !== currentEmail;
    const phoneChanged = phone !== undefined && normalizedPhone !== currentPhone;
    if (!emailValue) {
      emailVerifiedValue = 0;
    } else if (emailChanged) {
      emailVerifiedValue = isAdmin && Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
    } else if (isAdmin && email !== undefined && req.body?.email_verified !== undefined) {
      emailVerifiedValue = Number(req.body?.email_verified || 0) === 1 ? 1 : 0;
    }
    if (!normalizedPhone) {
      phoneVerifiedValue = 0;
    } else if (phoneChanged) {
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
        normalizedPhone,
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
    if (phoneChanged && normalizedPhone && phoneVerifiedValue === 0) {
      sendPhoneVerificationChallenge({
        userId: Number(req.params.id),
        phone: normalizedPhone,
        recipientName: name !== undefined ? String(name).trim() : current.name,
        requestedBy: Number(req.authUser?.id || 0) || null,
      }).catch(() => {});
    }
    return res.json(updated);
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

app.post('/api/orders/validate-customer', async (req, res) => {
  try {
    const userId = req.body?.user_id;
    if (!userId) return res.status(400).json({ error: 'MISSING_CUSTOMER', message: 'Customer ID is required' });
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

app.get('/api/products/:id(\\d+)/last-purchase', async (req, res) => {
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
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const doesTableExist = (tableName) => {
  if (IS_POSTGRES_EXECUTION) {
    return Boolean(
      dbGet(
        `SELECT 1 AS ok
         FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = ?
         LIMIT 1`,
        [tableName]
      )?.ok
    );
  }
  return Boolean(
    dbGet(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`, [tableName])?.ok
  );
};

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

const doesTableExistAsync = async (tableName) => {
  if (IS_POSTGRES_EXECUTION) {
    return Boolean(
      (await dbGetAsync(
        `SELECT 1 AS ok
         FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = ?
         LIMIT 1`,
        [tableName]
      ))?.ok
    );
  }
  return Boolean(
    (await dbGetAsync(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`, [tableName]))?.ok
  );
};

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

app.post('/api/categories', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const result = await dbRunAsync(`INSERT INTO categories (name, description) VALUES (?, ?)`, [name, req.body?.description || null]);
    return res.status(201).json(await dbGetAsync(`SELECT * FROM categories WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
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

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM categories WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (_, res) => {
  try {
    const orders = await dbAllAsync(`SELECT * FROM orders ORDER BY created_at DESC`);
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]);
    return res.json({ ...order, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id/history', async (req, res) => {
  try {
    const rows = await dbAllAsync(
      `SELECT h.id, h.order_id, h.status, h.description, h.created_by, h.created_at, u.name as created_by_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.order_id = ?
       ORDER BY h.created_at DESC`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/number/:orderNumber', async (req, res) => {
  try {
    const order = await dbGetAsync(`SELECT * FROM orders WHERE order_number = ?`, [req.params.orderNumber]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
    return res.json({ ...order, items });
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
    return res.json(orders);
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
  const normalizedCustomerEmail = normalizeEmail(customer_email) || '';
  if (user_id) {
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
  }
  const phoneParsed = parsePhoneInput(customer_phone);
  if (phoneParsed.error) {
    throw new Error(phoneParsed.error);
  }
  const normalizedCustomerPhone = phoneParsed.value;

  const parsedItems = items.map((it) => ({
    product_id: Number(it.product_id),
    quantity: Number(it.quantity),
    price: Number(it.price),
  }));
  if (parsedItems.some((it) => !it.product_id || it.quantity <= 0 || it.price < 0)) {
    throw new Error('Invalid order items');
  }

  for (const it of parsedItems) {
    const p = await dbGetAsync(`SELECT id, stock FROM products WHERE id = ?`, [it.product_id]);
    if (!p) throw new Error(`Product ${it.product_id} not found`);
    if (p.stock < it.quantity) throw new Error(`Insufficient stock for product ${it.product_id}`);
  }

  const normalizedPaymentMethod = normalizePaymentMethod(payment_method);
  const subtotal = parsedItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;
  const orderNumber = generateOrderNumber();

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
        'pending',
        normalizedPaymentMethod,
        'pending',
      ]
    );
    const orderId = orderInsert.lastInsertRowid;

    for (const it of parsedItems) {
      await dbRunAsync(
        `INSERT INTO order_items (order_id, product_id, quantity, price, total) VALUES (?, ?, ?, ?, ?)`,
        [orderId, it.product_id, it.quantity, it.price, it.price * it.quantity]
      );
    }

    // Add order placed entry to credit history if user has a credit account
    if (user_id) {
      const last = await getLatestCreditEntryAsync(user_id);
      const currentBalance = Number(last?.balance || 0);
      const orderRef = orderNumber || `ORDER-${orderId}`;
      await dbRunAsync(
        `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, 'order_placed', 0, currentBalance, `Order placed (Order #${orderRef})`, orderRef]
      );
    }

    return { orderId, orderNumber, totalAmount: total };
  });
};

app.post('/api/orders', async (req, res) => {
  try {
    const result = await placeOrder(req.body || {});
    return res.status(201).json({ ...result, message: 'Order created successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/orders/create-validated', async (req, res) => {
  try {
    const body = req.body || {};
    const effectiveUserId = Number(body.user_id || body.selected_customer_id || 0) || null;
    if (body.is_admin_order && !body.selected_customer_id) {
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
        const validation = validateCustomerProfile(customer, address);
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
      payment_method: body.payment_method || 'cash',
    });
    return res.status(201).json({ success: true, ...result, message: 'Order placed successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const status = req.body?.status;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // record status change in history
    const createdBy = req.body?.created_by || null;
    const description = req.body?.description || null;
    await dbRunAsync(`INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`, [req.params.id, status, description, createdBy]);

    // Update credit history with status change
    if (order.user_id) {
      const last = await getLatestCreditEntryAsync(order.user_id);
      const currentBalance = Number(last?.balance || 0);
      const orderRef = order.order_number || `ORDER-${order.id}`;
      const statusDescription = `Order status updated to ${status} (Order #${orderRef})`;
      await dbRunAsync(
        `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
        [order.user_id, 'status_update', 0, currentBalance, statusDescription, orderRef]
      );
    }

    if (status === 'confirmed' && Number(order.stock_applied || 0) === 0) {
      const items = await dbAllAsync(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]);
      await dbTxAsync(async () => {
        for (const item of items) {
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

        if (order.payment_method === 'credit' && order.user_id && Number(order.credit_applied || 0) === 0) {
          const last = await getLatestCreditEntryAsync(order.user_id);
          const currentBalance = Number(last?.balance || 0);
          const nextBalance = currentBalance + Number(order.total_amount || 0);
          const orderRef = order.order_number || `ORDER-${order.id}`;
          await dbRunAsync(
            `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
            [order.user_id, 'given', Number(order.total_amount || 0), nextBalance, `Approved credit order (Order #${orderRef})`, orderRef]
          );
        }

        await dbRunAsync(
          `UPDATE orders
           SET status = ?, payment_status = ?, stock_applied = 1, credit_applied = CASE WHEN payment_method='credit' THEN 1 ELSE credit_applied END
            WHERE id = ?`,
          [status, order.payment_method === 'cash' ? 'paid' : 'pending', req.params.id]
        );
      });
      return res.json({ success: true, applied: true });
    }

    await dbRunAsync(`UPDATE orders SET status = ? WHERE id = ?`, [status, req.params.id]);
    return res.json({ success: true, applied: false });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/api/stats/orders', async (_, res) => {
  try {
    const totalOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders`))?.count || 0;
    const totalRevenue = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders`))?.total || 0;
    const pendingOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'`))?.count || 0;
    return res.json({
      totalOrders,
      totalRevenue,
      pendingOrders,
      byStatus: { pending: pendingOrders },
    });
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
  try {
    const { type, amount, description, reference, transactionDate } = req.body || {};
    if (!type || !['given', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    const last = await getLatestCreditEntryAsync(req.params.userId);
    const current = Number(last?.balance || 0);
    const next = type === 'given' ? current + Number(amount) : current - Number(amount);
    const normalizedDate = transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(String(transactionDate))
      ? String(transactionDate)
      : null;
    const result = await dbRunAsync(
      `INSERT INTO credit_history (user_id, type, amount, balance, description, reference, transaction_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.userId, type, Number(amount), next, description || null, reference || null, normalizedDate, req.authUser?.id || null]
    );
    return res.status(201).json({
      success: true,
      balance: next,
      transaction: await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [result.lastInsertRowid]),
    });
  } catch (error) {
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
    const reportSql = IS_POSTGRES_EXECUTION
      ? `
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
      `
      : `
        SELECT
          u.id as customer_id,
          u.name as customer_name,
          u.email,
          u.phone,
          COALESCE(u.credit_limit, 0) as credit_limit,
          COALESCE((SELECT balance FROM credit_history ch WHERE ch.user_id = u.id ORDER BY COALESCE(ch.transaction_date, ch.created_at) DESC, ch.id DESC LIMIT 1), 0) as current_balance,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) <= 30), 0) as days_0_30,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) > 30 AND julianday('now') - julianday(ch.created_at) <= 60), 0) as days_31_60,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) > 60 AND julianday('now') - julianday(ch.created_at) <= 90), 0) as days_61_90,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) > 90), 0) as days_over_90
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

app.get('/api/distributors', async (_, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM distributors ORDER BY name ASC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id', async (req, res) => {
  try {
    const row = await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Distributor not found' });
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/distributors', async (req, res) => {
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

app.put('/api/distributors/:id', async (req, res) => {
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

app.delete('/api/distributors/:id', async (req, res) => {
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
      body.source_id || null,
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

app.get('/api/distributor-ledger', async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/ledger', async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id/ledger', async (req, res) => {
  try {
    return res.json(await getDistributorLedgerRows(req, req.params.id));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id/credit-history', async (req, res) => {
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

app.post('/api/distributor-ledger', async (req, res) => handleDistributorLedgerCreate(req, res));
app.post('/api/distributors/ledger', async (req, res) => handleDistributorLedgerCreate(req, res));
app.post('/api/distributors/:id/ledger', async (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));
app.post('/api/distributors/:id/transactions', async (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));
app.post('/api/distributors/:id/credit', async (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));

app.get('/api/purchase-orders', async (req, res) => {
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

app.get('/api/purchase-orders/:id', async (req, res) => {
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

app.post('/api/purchase-orders', async (req, res) => {
  try {
    const b = req.body || {};
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
        `INSERT INTO purchase_orders (po_number, distributor_id, subtotal, tax_amount, total_amount, total, status, notes, expected_delivery, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [poNumber, b.distributor_id, subtotal, taxAmount, totalAmount, totalAmount, 'pending', b.notes || null, b.expected_delivery || null, b.created_by || null]
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
    return res.status(201).json({ success: true, id: orderId, po_number: poNumber });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id', async (req, res) => {
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
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id/status', async (req, res) => {
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
      return res.json({ success: true });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders/:id/receive', async (req, res) => {
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
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/purchase-orders/:id', async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
    await dbRunAsync(`DELETE FROM purchase_orders WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-returns', async (req, res) => {
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

app.get('/api/purchase-returns/:id', async (req, res) => {
  try {
    const row = await dbGetAsync(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Purchase return not found' });
    return res.json({ ...row, items: await dbAllAsync(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id]) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-returns', async (req, res) => {
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

app.put('/api/purchase-returns/:id', async (req, res) => {
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

app.delete('/api/purchase-returns/:id', async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM purchase_return_items WHERE return_id = ?`, [req.params.id]);
    await dbRunAsync(`DELETE FROM purchase_returns WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger', async (req, res) => {
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

app.get('/api/stock-ledger/product/:productId', async (req, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM stock_ledger WHERE product_id = ? ORDER BY created_at DESC`, [req.params.productId]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger/batch/:batchNumber', (_, res) => {
  return res.json([]);
});

app.get('/api/stock-ledger/summary', async (_, res) => {
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
  try {
    const b = req.body || {};
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
        `INSERT INTO bills (bill_number, customer_id, customer_name, customer_email, customer_phone, customer_address, subtotal, discount_amount, total_amount, paid_amount, credit_amount, payment_method, payment_status, bill_type, created_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    return res.status(201).json({ success: true, bill_id: billId, bill_number: billNumber });
  } catch (error) {
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

app.post('/api/offers', async (req, res) => {
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
    return res.status(201).json(await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/offers/:id', async (req, res) => {
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
    return res.json(await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/offers/:id', async (req, res) => {
  try {
    await dbRunAsync(`DELETE FROM offers WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-versions/:internalId', (_, res) => res.json([]));
app.get('/api/product-versions/sku/:sku', (_, res) => res.json([]));
app.get('/api/uom-conversions/:productId', (_, res) => res.json([]));
app.post('/api/uom-conversions', (_, res) => res.status(201).json({ success: true }));
app.delete('/api/uom-conversions/:id', (_, res) => res.json({ success: true }));
app.get('/api/batch-stock', (_, res) => res.json([]));
app.post('/api/batch-stock', (_, res) => res.status(201).json({ success: true }));

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
  const ready = await startDatabaseScaffolding();
  if (!ready) {
    console.error('[SYSTEM] Server start aborted due to database initialization failure.');
    process.exit(1);
    return;
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BARMAN STORE API running on http://localhost:${PORT}`);
    if (!IS_POSTGRES_EXECUTION) {
      startAutoBackupScheduler();
    } else {
      console.log(`[AUTO_BACKUP] Skipped in ${DB_EXECUTION_MODE} execution mode.`);
    }
  });
};

void startServer();

const shutdownServer = (signal) => {
  console.log(`[SYSTEM] Received ${signal}. Shutting down...`);
  void Promise.allSettled([closePostgresScaffold()]).finally(() => {
    closeDatabase();
    process.exit(0);
  });
};

process.once('SIGINT', () => shutdownServer('SIGINT'));
process.once('SIGTERM', () => shutdownServer('SIGTERM'));

