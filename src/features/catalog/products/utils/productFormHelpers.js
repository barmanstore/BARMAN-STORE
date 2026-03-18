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

const buildProductData = (data) => ({
  name: data.name.trim(),
  description: data.description.trim(),
  brand: data.brand.trim(),
  content: data.content.trim(),
  purchase_pack_size: String(data.purchase_pack_size || '').trim() === '' ? null : parseFloat(data.purchase_pack_size),
  color: data.color.trim(),
  price: parseFloat(data.price),
  mrp: parseFloat(data.mrp) || parseFloat(data.price),
  uom: data.uom,
  base_unit: data.base_unit,
  uom_type: data.uom_type,
  barcode: data.barcode.trim(),
  sku: data.sku,
  image: data.image.trim(),
  stock: parseInt(data.stock, 10),
  conversion_factor: parseFloat(data.conversion_factor) || 1,
  expiry_date: data.expiry_date || null,
  category: String(data.category || '').trim(),
  defaultDiscount: parseFloat(data.defaultDiscount) || 0,
  discountType: data.discountType
});

const buildVariantFormRows = (data) => {
  const lists = {
    price: splitCommaValues(data.price),
    mrp: splitCommaValues(data.mrp),
    stock: splitCommaValues(data.stock),
    content: splitCommaValues(data.content),
    purchase_pack_size: splitCommaValues(data.purchase_pack_size),
    color: splitCommaValues(data.color),
    sku: splitCommaValues(data.sku),
    barcode: splitCommaValues(data.barcode),
  };
  const variantCount = Math.max(
    1,
    lists.price.length,
    lists.mrp.length,
    lists.stock.length,
    lists.content.length,
    lists.purchase_pack_size.length,
    lists.color.length,
    lists.sku.length,
    lists.barcode.length
  );

  const pickValue = (name, index) => {
    const values = lists[name];
    if (!values.length) return '';
    if (values.length === 1) return values[0];
    if (values.length === variantCount) return values[index];
    throw new Error(`Field \"${name}\" must have either 1 value or ${variantCount} comma-separated values.`);
  };

  const rows = [];
  for (let i = 0; i < variantCount; i += 1) {
    const row = {
      ...data,
      price: pickValue('price', i),
      stock: pickValue('stock', i),
      content: pickValue('content', i),
      purchase_pack_size: pickValue('purchase_pack_size', i),
      color: pickValue('color', i),
    };
    const mrpValue = pickValue('mrp', i);
    row.mrp = mrpValue || row.price;
    if (!row.content && variantCount > 1) {
      row.content = row.price || row.mrp || '';
    }
    if (!row.stock && variantCount > 1) {
      row.stock = '0';
    }
    row.barcode = pickValue('barcode', i);
    const suppliedSku = pickValue('sku', i);
    row.sku = suppliedSku || generateAutoSKU(row, i);
    rows.push(row);
  }

  const distinctPrices = new Set(
    rows.map((row) => String(row.price || '').trim()).filter(Boolean)
  );
  if (variantCount > 1 && distinctPrices.size > 1) {
    const contents = rows.map((row) => String(row.content || '').trim());
    const allContentPresent = contents.every(Boolean);
    const uniqueContents = new Set(contents.map((value) => value.toLowerCase()));
    if (!allContentPresent || uniqueContents.size !== rows.length) {
      throw new Error('When multiple prices are provided, each variant must have a different non-empty content/size value.');
    }
  }

  const normalizedSkus = rows.map((row) => String(row.sku || '').trim().toLowerCase()).filter(Boolean);
  if (normalizedSkus.length !== new Set(normalizedSkus).size) {
    throw new Error('Each variant must have a unique SKU.');
  }

  return rows;
};

const hasFormDraft = (data) => (
  ['name', 'description', 'brand', 'content', 'purchase_pack_size', 'color', 'price', 'mrp', 'barcode', 'sku', 'image', 'stock', 'expiry_date', 'category', 'defaultDiscount']
    .some((field) => String(data[field] || '').trim() !== '')
);

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
  buildProductData,
  buildVariantFormRows,
  hasFormDraft,
};
