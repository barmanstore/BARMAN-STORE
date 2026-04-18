import { TITLE, SUB_TITLE, SHOP_ADDRESS, CONTACT, EMAIL, LOGO_URL } from '../shared/info';

const resolveLogoPath = () => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(LOGO_URL || 'logo.png').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

const company = {
  name: TITLE || "বৰ্মন ষ্ট'ৰ",
  subTitle: SUB_TITLE || '',
  gstNumber: 'GST00000001',
  address: SHOP_ADDRESS || '',
  phone: CONTACT || '',
  email: EMAIL || '',
  logoPath: resolveLogoPath(),
};

export default company;
