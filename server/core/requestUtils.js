const createRequestUtils = ({ crypto } = {}) => {
  const toTimestampMs = (value) => {
    const ts = new Date(value || '').getTime();
    return Number.isFinite(ts) ? ts : 0;
  };

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
      req.headers['x-idempotency-key'] ||
        req.headers['x-client-request-id'] ||
        req.headers['x-request-id'] ||
        ''
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

  const safeSerializeJson = (value) => {
    try {
      return JSON.stringify(value || {});
    } catch (_) {
      return '{}';
    }
  };

  return {
    toTimestampMs,
    generateVisitorSessionId,
    normalizeVisitorSessionId,
    sanitizeTrackedPath,
    sanitizeShortText,
    getRequestIp,
    hashVisitorIp,
    normalizeClientRequestId,
    resolveClientRequestId,
    safeSerializeJson,
  };
};

module.exports = { createRequestUtils };
