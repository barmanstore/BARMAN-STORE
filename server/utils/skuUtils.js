const normalizeSkuToken = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const toSkuFixed = (value, length, fallback = 'X') => {
  const clean = normalizeSkuToken(value);
  if (!clean) return fallback.repeat(length);
  return clean.slice(0, length);
};

const normalizeSkuContent = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'NA';
  return raw.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'NA';
};

const normalizeSkuPrice = (price, mrp) => {
  const candidate = price ?? mrp ?? '';
  const raw = String(candidate || '').replace(/,/g, '');
  const integerPart = raw.split('.')[0] || '';
  const digits = integerPart.replace(/[^0-9]/g, '');
  return digits || '0';
};

const normalizeSkuPackSize = (value) => {
  const raw = String(value ?? '').replace(/,/g, '');
  const integerPart = raw.split('.')[0] || '';
  const digits = integerPart.replace(/[^0-9]/g, '');
  return digits || '0';
};

const generateSku = (name, brand, content, price, mrp, purchasePackSize) => {
  const nameCode = toSkuFixed(name, 4, 'N');
  const brandCode = toSkuFixed(brand, 3, 'B');
  const contentCode = normalizeSkuContent(content);
  const priceCode = normalizeSkuPrice(price, mrp);
  const packCode = normalizeSkuPackSize(purchasePackSize);
  return `${nameCode}-${brandCode}-${contentCode}-${priceCode}-P${packCode}`;
};

module.exports = {
  generateSku,
};
