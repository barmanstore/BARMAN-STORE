const parseBooleanEnv = (value, fallback = false) => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const isPlaceholderValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^<[^>]+>$/.test(raw)) return true;
  return /<your-|your-project-ref|your-anon-key|your-service-role-key/i.test(raw);
};

const normalizeBaseUrl = (value) => {
  const raw = String(value || '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw || isPlaceholderValue(raw)) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return '';
  }
};

const normalizeSecretValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw || isPlaceholderValue(raw)) return '';
  return raw;
};

const deriveSupabaseUrlFromDbUrl = (dbUrl) => {
  const raw = String(dbUrl || '').trim();
  if (!raw) return '';
  const match = raw.match(/postgres\.([a-z0-9-]+):/i);
  if (!match || !match[1]) return '';
  return `https://${match[1]}.supabase.co`;
};

const parseErrorMessage = (payload, fallback = 'Supabase Auth request failed') => {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(
    payload.error_description || payload.msg || payload.error || payload.message || fallback
  );
};

module.exports = {
  deriveSupabaseUrlFromDbUrl,
  normalizeBaseUrl,
  normalizeSecretValue,
  parseBooleanEnv,
  parseErrorMessage,
};
