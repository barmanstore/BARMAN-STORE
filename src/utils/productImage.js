import { resolveMediaUrl } from '../services/api';

const THEMES = [
  { label: 'RICE', colorA: '#f59e0b', colorB: '#d97706', keywords: ['rice', 'atta', 'flour', 'grain', 'wheat'] },
  { label: 'OIL', colorA: '#22c55e', colorB: '#16a34a', keywords: ['oil', 'mustard', 'sunflower', 'ghee', 'butter'] },
  { label: 'TEA', colorA: '#14b8a6', colorB: '#0f766e', keywords: ['tea', 'coffee'] },
  { label: 'SOAP', colorA: '#3b82f6', colorB: '#1d4ed8', keywords: ['soap', 'shampoo', 'detergent', 'cleaner'] },
  { label: 'BISCUIT', colorA: '#fb7185', colorB: '#e11d48', keywords: ['biscuit', 'snack', 'chips', 'cookie'] },
  { label: 'DAIRY', colorA: '#a78bfa', colorB: '#7c3aed', keywords: ['milk', 'curd', 'paneer', 'dairy'] },
  { label: 'SPICE', colorA: '#f97316', colorB: '#c2410c', keywords: ['spice', 'masala', 'salt', 'sugar'] },
];

const DEFAULT_THEME = { label: 'PRODUCT', colorA: '#64748b', colorB: '#334155' };

const normalize = (value) => String(value || '').trim().toLowerCase();

const getSearchText = (product) => [
  normalize(product?.name),
  normalize(product?.category),
  normalize(product?.brand),
].join(' ');

const matchTheme = (product) => {
  const text = getSearchText(product);
  for (const theme of THEMES) {
    if (theme.keywords.some((k) => text.includes(k))) return theme;
  }
  return DEFAULT_THEME;
};

const buildSvgDataUri = (product) => {
  const theme = matchTheme(product);
  const title = String(product?.name || theme.label || 'PRODUCT').trim().slice(0, 24) || 'PRODUCT';
  const label = String(theme.label || 'PRODUCT').trim().slice(0, 12) || 'PRODUCT';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.colorA}"/>
      <stop offset="100%" stop-color="${theme.colorB}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <rect x="44" y="44" width="512" height="512" rx="28" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.38)" stroke-width="2"/>
  <text x="50%" y="46%" text-anchor="middle" fill="#ffffff" font-size="58" font-family="Arial, Helvetica, sans-serif" font-weight="700">${label}</text>
  <text x="50%" y="56%" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="24" font-family="Arial, Helvetica, sans-serif">${title}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const sanitizeImageSrc = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw;
  if (raw.startsWith('blob:')) return raw;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(raw, base);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
    return '';
  } catch (_) {
    return '';
  }
};

export const getProductFallbackImage = (product) => buildSvgDataUri(product);

export const getProductImageSrc = (productOrSrc) => {
  const imageValue = typeof productOrSrc === 'string' ? productOrSrc : productOrSrc?.image;
  const safe = sanitizeImageSrc(imageValue);
  if (safe) return resolveMediaUrl(safe);
  const product = typeof productOrSrc === 'string' ? { name: '', category: '' } : (productOrSrc || {});
  return getProductFallbackImage(product);
};
