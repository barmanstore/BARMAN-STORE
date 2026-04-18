import { normalizeText } from './productTextUtils';

const LOGO_DEV_TOKEN = String(import.meta.env.VITE_LOGO_DEV_TOKEN || '').trim();

const BRAND_LOGO_DOMAIN_HINTS = {
  amul: 'amul.com',
  nestle: 'nestle.com',
  britannia: 'britannia.co.in',
  parle: 'parleproducts.com',
  cadbury: 'cadbury.co.in',
  patanjali: 'patanjaliayurved.org',
  tata: 'tataconsumer.com',
  fortune: 'adaniwilmar.com',
  saffola: 'saffolalife.com',
  surf: 'surfexcel.in',
  colgate: 'colgate.com',
  pepsodent: 'pepsodent.in',
  dove: 'dove.com',
  lifebuoy: 'lifebuoy.co.in',
  maggi: 'maggi.in',
  nescafe: 'nescafe.com',
  horlicks: 'horlicks.in',
  tropicana: 'tropicana.com',
  coca: 'coca-cola.com',
  pepsi: 'pepsi.com',
  sprite: 'sprite.com',
  sunfeast: 'sunfeast.com',
  aashirvaad: 'aashirvaad.com',
  kellogg: 'kelloggs.com',
  himalaya: 'himalayawellness.com',
  dettol: 'dettol.co.in',
  harpic: 'harpic.com',
  lizol: 'lizol.co.in',
  whisper: 'whisper.co.in',
  stayfree: 'stayfree.in',
  pampers: 'pampers.com',
  johnson: 'jnj.com',
  nivea: 'nivea.in',
  vaseline: 'vaseline.com',
  gillette: 'gillette.com',
  pantene: 'pantene.com',
};

const resolveBrandLogoUrl = (brandName = '') => {
  const normalized = normalizeText(brandName)
    .replace(/[^a-z0-9&\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || !LOGO_DEV_TOKEN) return '';

  let domain = BRAND_LOGO_DOMAIN_HINTS[normalized] || '';
  if (!domain) {
    const matchEntry = Object.entries(BRAND_LOGO_DOMAIN_HINTS).find(
      ([key]) => normalized.includes(key) || key.includes(normalized)
    );
    domain = matchEntry?.[1] || '';
  }

  const baseParams = `token=${encodeURIComponent(LOGO_DEV_TOKEN)}&size=128&format=webp&fallback=monogram`;
  if (domain) {
    return `https://img.logo.dev/${domain}?${baseParams}`;
  }
  return `https://img.logo.dev/name/${encodeURIComponent(brandName)}?${baseParams}`;
};

const getDefaultCategoryIcon = (categoryName = '') => {
  const text = normalizeText(categoryName);
  if (!text || text === 'all') return '??';
  if (/(dairy|milk|curd|paneer|cheese|butter|egg)/.test(text)) return '??';
  if (/(biscuit|cookie|snack|chips|namkeen)/.test(text)) return '??';
  if (/(rice|grain|atta|flour|dal|pulse)/.test(text)) return '??';
  if (/(tea|coffee|beverage|drink|juice)/.test(text)) return '??';
  if (/(oil|ghee)/.test(text)) return '??';
  if (/(personal|care|soap|shampoo|tooth|cosmetic|beauty)/.test(text)) return '??';
  if (/(fruit|fresh)/.test(text)) return '??';
  if (/(vegetable|veggie)/.test(text)) return '??';
  if (/(clean|home|household|detergent)/.test(text)) return '??';
  if (/(baby|kids)/.test(text)) return '??';
  if (/(medicine|pharma|health)/.test(text)) return '??';
  return '??';
};

export { LOGO_DEV_TOKEN, BRAND_LOGO_DOMAIN_HINTS, resolveBrandLogoUrl, getDefaultCategoryIcon };
