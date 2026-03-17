const createBusinessConfig = ({ env } = {}) => {
  const PURCHASE_STOCK_CAP_RAW = Number(env.PURCHASE_STOCK_CAP || 50);
  const PURCHASE_STOCK_CAP = Number.isFinite(PURCHASE_STOCK_CAP_RAW) && PURCHASE_STOCK_CAP_RAW >= 0
    ? PURCHASE_STOCK_CAP_RAW
    : 50;

  const BUSINESS_NAME = String(env.BUSINESS_NAME || 'BARMAN STORE').trim() || 'BARMAN STORE';
  const DEFAULT_COUNTRY_CODE = String(env.DEFAULT_COUNTRY_CODE || '91').trim() || '91';
  const AUTH_TOKEN_SECRET = env.AUTH_TOKEN_SECRET || 'barman-store-local-secret';
  const TOKEN_TTL_MS = Number(env.AUTH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);

  return {
    PURCHASE_STOCK_CAP,
    BUSINESS_NAME,
    DEFAULT_COUNTRY_CODE,
    AUTH_TOKEN_SECRET,
    TOKEN_TTL_MS,
  };
};

module.exports = { createBusinessConfig };
