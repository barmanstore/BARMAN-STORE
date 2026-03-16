const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
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

module.exports = {
  parseBooleanEnv,
  normalizeOrigin,
};
