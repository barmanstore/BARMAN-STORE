const splitCommaValues = (value) => String(value ?? '')
  .split(',')
  .map((part) => String(part || '').trim())
  .filter(Boolean);

const firstCommaValue = (value) => splitCommaValues(value)[0] || '';

const joinCommaValues = (values = []) => values
  .map((value) => String(value ?? '').trim())
  .filter(Boolean)
  .join(',');

const getPricingVariantCount = (data) => Math.max(
  1,
  splitCommaValues(data?.price).length,
  splitCommaValues(data?.mrp).length
);

const pickVariantValueLoose = (values, index, variantCount) => {
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  if (values.length === variantCount) return values[index];
  return values[Math.min(index, values.length - 1)] || '';
};

const createInitialFormData = () => ({
  name: '',
  description: '',
  brand: '',
  content: '',
  purchase_pack_size: '',
  color: '',
  price: '',
  mrp: '',
  uom: 'pcs',
  base_unit: 'pcs',
  uom_type: 'selling',
  conversion_factor: '1',
  barcode: '',
  sku: '',
  image: '',
  stock: '',
  expiry_date: '',
  category: '',
  defaultDiscount: '',
  discountType: 'fixed'
});

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
const normalizeSkuPrice = (value) => {
  const raw = String(value ?? '').replace(/,/g, '');
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
const generateAutoSKU = (data = {}) => {
  const namePart = toSkuFixed(firstCommaValue(data.name), 4, 'N');
  const brandPart = toSkuFixed(firstCommaValue(data.brand), 3, 'B');
  const contentPart = normalizeSkuContent(firstCommaValue(data.content));
  const pricePart = normalizeSkuPrice(firstCommaValue(data.price) || firstCommaValue(data.mrp));
  const packPart = normalizeSkuPackSize(firstCommaValue(data.purchase_pack_size));
  return `${namePart}-${brandPart}-${contentPart}-${pricePart}-P${packPart}`;
};

const generateDescriptionSuggestion = (data = {}) => {
  const name = (data.name || '').trim();
  if (!name) return '';

  const brand = (data.brand || '').trim();
  const content = (data.content || '').trim();
  const category = (data.category || '').trim();
  const color = (data.color || '').trim();

  const parts = [name];
  if (brand) parts.push(`by ${brand}`);
  if (content) parts.push(`(${content})`);

  let description = parts.join(' ');
  if (category) description += ` in ${category} category`;
  if (color) description += `, ${color} variant`;
  description += '. Quality product for daily use.';

  return description;
};

const prepareFormDataForSubmit = (data, { isQuickMode = false } = {}) => {
  if (!isQuickMode) return data;
  const prepared = { ...data };
  if (!String(prepared.description || '').trim()) {
    prepared.description = generateDescriptionSuggestion(prepared) || String(prepared.name || '').trim();
  }
  if (!String(prepared.stock || '').trim()) {
    prepared.stock = '0';
  }
  if (!String(prepared.base_unit || '').trim()) {
    prepared.base_unit = prepared.uom || 'pcs';
  }
  if (!String(prepared.mrp || '').trim()) {
    prepared.mrp = prepared.price;
  }
  return prepared;
};

export {
  splitCommaValues,
  firstCommaValue,
  joinCommaValues,
  getPricingVariantCount,
  pickVariantValueLoose,
  createInitialFormData,
  generateAutoSKU,
  generateDescriptionSuggestion,
  prepareFormDataForSubmit,
};
