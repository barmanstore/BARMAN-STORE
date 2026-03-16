const createProductNormalization = ({ generateSku }) => {
  const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const toPositiveIntOrNull = (value) => {
    const n = toNumberOrNull(value);
    if (n === null) return null;
    return Math.trunc(n);
  };

  const normalizeDiscountType = (value) => {
    const raw = String(value || 'fixed').trim().toLowerCase();
    return raw === 'percent' || raw === 'percentage' ? 'percent' : 'fixed';
  };

  const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();

  const normalizeMoneyValue = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeHttpImageUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.toString();
    } catch (error) {
      return '';
    }
  };

  const normalizeBooleanish = (value, fallback = 1) => {
    const raw = String(value).trim().toLowerCase();
    if (!raw) return fallback;
    if (['true', 'yes', '1'].includes(raw)) return 1;
    if (['false', 'no', '0'].includes(raw)) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? (n ? 1 : 0) : fallback;
  };

  const HIERARCHY_SEPARATOR = '->';
  const splitHierarchyInput = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return { parent: '', child: '', invalid: false };
    const parts = raw.split(HIERARCHY_SEPARATOR).map((part) => String(part || '').trim());
    if (parts.length === 1) return { parent: parts[0], child: '', invalid: false };
    if (parts.length === 2) return { parent: parts[0], child: parts[1], invalid: false };
    return { parent: parts[0], child: parts.slice(1).join(` ${HIERARCHY_SEPARATOR} `), invalid: true };
  };

  const composeHierarchyPath = (parent, child) => {
    const root = String(parent || '').trim();
    const leaf = String(child || '').trim();
    if (!root) return leaf;
    if (!leaf) return root;
    return `${root} ${HIERARCHY_SEPARATOR} ${leaf}`;
  };

  const normalizeProductRecord = (row) => {
    const out = { ...row };
    const categoryParsed = splitHierarchyInput(out.category);
    const explicitSubcategory = String(out.subcategory || '').trim();
    const subcategory = explicitSubcategory || categoryParsed.child || '';
    out.category = categoryParsed.parent || out.category || 'Groceries';
    out.subcategory = subcategory || '';
    const brandParsed = splitHierarchyInput(out.brand);
    const explicitSubBrand = String(out.sub_brand || '').trim();
    const subBrand = explicitSubBrand || brandParsed.child || '';
    out.brand = brandParsed.parent || out.brand || null;
    out.sub_brand = subBrand || '';
    const uomType = String(out.uom_type || 'selling').trim().toLowerCase();
    const conversionFactor = Number(out.conversion_factor ?? 1);
    out.uom_type = ['selling', 'purchasing', 'both'].includes(uomType) ? uomType : 'selling';
    out.conversion_factor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
    out.base_unit = String(out.base_unit || out.uom || 'pcs').trim() || 'pcs';
    out.uom = String(out.uom || 'pcs').trim() || 'pcs';
    out.default_discount = Number(out.default_discount ?? out.defaultDiscount ?? 0);
    out.discount_type = normalizeDiscountType(out.discount_type ?? out.discountType ?? 'fixed');
    out.is_active = normalizeBooleanish(out.is_active ?? out.isActive ?? 1, 1);
    out.price = normalizeMoneyValue(out.price ?? 0) ?? 0;
    out.mrp = normalizeMoneyValue(out.mrp ?? out.price ?? 0) ?? 0;
    out.stock = normalizeMoneyValue(out.stock ?? 0) ?? 0;
    out.image = normalizeHttpImageUrl(out.image ?? '');
    return out;
  };

  const normalizeProductInput = (input = {}, current = null) => {
    const body = input || {};
    const existing = current || {};
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const hasCategoryInput = hasOwn(body, 'category');
    const hasBrandInput = hasOwn(body, 'brand');
    const hasSubcategoryInput = hasOwn(body, 'subcategory') || hasOwn(body, 'sub_category');
    const hasSubBrandInput = hasOwn(body, 'sub_brand') || hasOwn(body, 'subBrand') || hasOwn(body, 'subbrand');

    const name = body.name ?? existing.name ?? '';
    const rawCategoryInput = body.category ?? existing.category ?? 'Groceries';
    const description = body.description ?? existing.description ?? null;
    const rawBrandInput = body.brand ?? existing.brand ?? null;
    const existingSubcategory = String(existing.subcategory || '').trim();
    const existingSubBrand = String(existing.sub_brand || '').trim();
    const rawSubcategoryInput = body.subcategory ?? body.sub_category ?? (hasCategoryInput ? '' : existingSubcategory);
    const rawSubBrandInput = body.sub_brand ?? body.subBrand ?? body.subbrand ?? (hasBrandInput ? '' : existingSubBrand);

    const parsedCategory = splitHierarchyInput(rawCategoryInput);
    const parsedBrand = splitHierarchyInput(rawBrandInput);
    const categoryInputTrimmed = String(parsedCategory.parent || '').trim();
    const brandInputTrimmed = String(parsedBrand.parent || '').trim();

    const categoryFromInput = categoryInputTrimmed || 'Groceries';
    const brandFromInput = brandInputTrimmed || null;

    const explicitSubcategory = String(rawSubcategoryInput || '').trim();
    const subcategory = explicitSubcategory || parsedCategory.child || '';
    const explicitSubBrand = String(rawSubBrandInput || '').trim();
    const subBrand = explicitSubBrand || parsedBrand.child || '';

    const categoryPath = composeHierarchyPath(categoryFromInput, subcategory);
    const brandPath = composeHierarchyPath(brandFromInput, subBrand);

    const categoryFormatError = parsedCategory.invalid
      ? `category should be 'Parent ${HIERARCHY_SEPARATOR} Child'`
      : null;
    const brandFormatError = parsedBrand.invalid
      ? `brand should be 'Parent ${HIERARCHY_SEPARATOR} Child'`
      : null;

    const content = body.content ?? existing.content ?? null;
    const color = body.color ?? existing.color ?? null;
    const priceRaw = body.price ?? existing.price ?? 0;
    const mrpRaw = body.mrp ?? existing.mrp ?? priceRaw;
    const purchasePackSizeRaw = body.purchase_pack_size ?? body.purchasePackSize ?? existing.purchase_pack_size ?? null;
    const uom = body.uom ?? existing.uom ?? 'pcs';
    const baseUnitRaw = body.base_unit ?? existing.base_unit ?? uom ?? 'pcs';
    const uomTypeRaw = body.uom_type ?? existing.uom_type ?? 'selling';
    const conversionFactorRaw = body.conversion_factor ?? existing.conversion_factor ?? 1;
    const skuCandidate = body.sku ?? existing.sku ?? '';
    const barcodeCandidate = body.barcode ?? existing.barcode ?? null;
    const image = body.image ?? existing.image ?? null;
    const stockRaw = body.stock ?? existing.stock ?? 0;
    const expiryDate = body.expiry_date ?? existing.expiry_date ?? null;
    const defaultDiscountRaw = body.defaultDiscount ?? body.default_discount ?? existing.default_discount ?? existing.defaultDiscount ?? 0;
    const discountTypeRaw = body.discountType ?? body.discount_type ?? existing.discount_type ?? existing.discountType ?? 'fixed';
    const isActiveRaw = body.is_active ?? existing.is_active ?? 1;

    const price = Number(priceRaw);
    const mrp = Number(mrpRaw);
    const stock = Number(stockRaw);
    const defaultDiscount = Number(defaultDiscountRaw || 0);
    const discountType = normalizeDiscountType(discountTypeRaw);
    const isActive = normalizeBooleanish(isActiveRaw, 1);
    const purchasePackSize = toNumberOrNull(purchasePackSizeRaw);
    const normalizedUom = String(uom || 'pcs').trim() || 'pcs';
    const normalizedBaseUnit = String(baseUnitRaw || normalizedUom || 'pcs').trim() || 'pcs';
    const normalizedUomType = ['selling', 'purchasing', 'both'].includes(String(uomTypeRaw || '').trim().toLowerCase())
      ? String(uomTypeRaw || '').trim().toLowerCase()
      : 'selling';
    const conversionFactor = Number(conversionFactorRaw);
    const normalizedConversionFactor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
    const sku = String(skuCandidate || '').trim()
      || generateSku(name, brandFromInput, content, price, mrp, purchasePackSize);
    const barcode = String(barcodeCandidate || '').trim() || null;

    return {
      name: String(name || '').trim(),
      description: description ? String(description || '').trim() : null,
      brand: brandFromInput ? String(brandFromInput || '').trim() : null,
      sub_brand: subBrand ? String(subBrand || '').trim() : '',
      brand_path: brandPath,
      category: String(categoryFromInput || '').trim() || 'Groceries',
      subcategory: subcategory ? String(subcategory || '').trim() : '',
      category_path: categoryPath,
      category_format_error: categoryFormatError,
      brand_format_error: brandFormatError,
      content: content ? String(content || '').trim() : null,
      color: color ? String(color || '').trim() : null,
      price: Number.isFinite(price) ? price : 0,
      mrp: Number.isFinite(mrp) ? mrp : Number.isFinite(price) ? price : 0,
      purchase_pack_size: purchasePackSize,
      uom: normalizedUom,
      base_unit: normalizedBaseUnit,
      uom_type: normalizedUomType,
      conversion_factor: normalizedConversionFactor,
      sku,
      barcode,
      image: normalizeHttpImageUrl(image),
      stock: Number.isFinite(stock) ? stock : 0,
      expiry_date: expiryDate ? String(expiryDate || '').trim() : null,
      default_discount: Number.isFinite(defaultDiscount) ? defaultDiscount : 0,
      discount_type: discountType,
      is_active: isActive,
      _has_category_input: hasCategoryInput,
      _has_subcategory_input: hasSubcategoryInput,
      _has_brand_input: hasBrandInput,
      _has_sub_brand_input: hasSubBrandInput,
    };
  };

  const validateProductPayload = (payload, { partial = false } = {}) => {
    const errors = [];
    if (!payload && payload !== 0) return ['Product payload is required'];
    if (!partial || payload.name !== undefined) {
      if (!String(payload.name || '').trim()) errors.push('Product name is required');
    }
    if (!partial || payload.category !== undefined) {
      if (!String(payload.category || '').trim()) errors.push('Category is required');
    }
    if (!partial || payload.uom !== undefined) {
      if (!String(payload.uom || '').trim()) errors.push('UOM is required');
    }
    if (payload.uom_type !== undefined) {
      const uomType = String(payload.uom_type || '').trim().toLowerCase();
      if (!['selling', 'purchasing', 'both'].includes(uomType)) errors.push('uom_type must be selling, purchasing or both');
    }
    if (payload.conversion_factor !== undefined) {
      const factor = Number(payload.conversion_factor);
      if (!Number.isFinite(factor) || factor <= 0) errors.push('conversion_factor must be a positive number');
    }
    if (payload.purchase_pack_size !== undefined && payload.purchase_pack_size !== null && payload.purchase_pack_size !== '') {
      const packSize = Number(payload.purchase_pack_size);
      if (!Number.isFinite(packSize) || packSize < 0) errors.push('purchase_pack_size must be >= 0');
    }
    if (payload.discount_type !== undefined) {
      const type = normalizeDiscountType(payload.discount_type);
      if (!['fixed', 'percent'].includes(type)) errors.push('discount_type must be fixed or percent');
    }
    if (payload.expiry_date !== undefined && payload.expiry_date !== null && payload.expiry_date !== '') {
      const expiry = String(payload.expiry_date);
      if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) errors.push('expiry_date must be YYYY-MM-DD');
    }
    return errors;
  };

  const buildProductExactKey = (payload) => {
    const nameKey = normalizeTextKey(payload?.name);
    if (!nameKey) return '';
    const brandKey = normalizeTextKey(payload?.brand);
    const subBrandKey = normalizeTextKey(payload?.sub_brand);
    const contentKey = normalizeTextKey(payload?.content);
    const colorKey = normalizeTextKey(payload?.color);
    const price = normalizeMoneyValue(payload?.price);
    const mrp = normalizeMoneyValue(payload?.mrp);
    return `${nameKey}::${brandKey}::${subBrandKey}::${contentKey}::${colorKey}::${price ?? ''}::${mrp ?? ''}`;
  };

  return {
    toNumberOrNull,
    toPositiveIntOrNull,
    normalizeDiscountType,
    normalizeTextKey,
    normalizeMoneyValue,
    normalizeHttpImageUrl,
    normalizeBooleanish,
    splitHierarchyInput,
    composeHierarchyPath,
    normalizeProductRecord,
    normalizeProductInput,
    validateProductPayload,
    buildProductExactKey,
  };
};

module.exports = { createProductNormalization };
