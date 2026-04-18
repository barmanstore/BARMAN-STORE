const createProductInputNormalizer = ({ generateSku, fieldNormalizers }) => {
  const {
    HIERARCHY_SEPARATOR,
    toNumberOrNull,
    normalizeDiscountType,
    normalizeHttpImageUrl,
    normalizeBooleanish,
    splitHierarchyInput,
    composeHierarchyPath,
  } = fieldNormalizers;

  return (input = {}, current = null) => {
    const body = input || {};
    const existing = current || {};
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const hasCategoryInput = hasOwn(body, 'category');
    const hasBrandInput = hasOwn(body, 'brand');
    const hasSubcategoryInput = hasOwn(body, 'subcategory') || hasOwn(body, 'sub_category');
    const hasSubBrandInput =
      hasOwn(body, 'sub_brand') || hasOwn(body, 'subBrand') || hasOwn(body, 'subbrand');

    const name = body.name ?? existing.name ?? '';
    const rawCategoryInput = body.category ?? existing.category ?? 'Groceries';
    const description = body.description ?? existing.description ?? null;
    const rawBrandInput = body.brand ?? existing.brand ?? null;
    const existingSubcategory = String(existing.subcategory || '').trim();
    const existingSubBrand = String(existing.sub_brand || '').trim();
    const rawSubcategoryInput =
      body.subcategory ?? body.sub_category ?? (hasCategoryInput ? '' : existingSubcategory);
    const rawSubBrandInput =
      body.sub_brand ?? body.subBrand ?? body.subbrand ?? (hasBrandInput ? '' : existingSubBrand);

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
    const purchasePackSizeRaw =
      body.purchase_pack_size ?? body.purchasePackSize ?? existing.purchase_pack_size ?? null;
    const uom = body.uom ?? existing.uom ?? 'pcs';
    const baseUnitRaw = body.base_unit ?? existing.base_unit ?? uom ?? 'pcs';
    const uomTypeRaw = body.uom_type ?? existing.uom_type ?? 'selling';
    const conversionFactorRaw = body.conversion_factor ?? existing.conversion_factor ?? 1;
    const skuCandidate = body.sku ?? existing.sku ?? '';
    const barcodeCandidate = body.barcode ?? existing.barcode ?? null;
    const image = body.image ?? existing.image ?? null;
    const stockRaw = body.stock ?? existing.stock ?? 0;
    const expiryDate = body.expiry_date ?? existing.expiry_date ?? null;
    const defaultDiscountRaw =
      body.defaultDiscount ??
      body.default_discount ??
      existing.default_discount ??
      existing.defaultDiscount ??
      0;
    const discountTypeRaw =
      body.discountType ??
      body.discount_type ??
      existing.discount_type ??
      existing.discountType ??
      'fixed';
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
    const normalizedUomType = ['selling', 'purchasing', 'both'].includes(
      String(uomTypeRaw || '')
        .trim()
        .toLowerCase()
    )
      ? String(uomTypeRaw || '')
          .trim()
          .toLowerCase()
      : 'selling';
    const conversionFactor = Number(conversionFactorRaw);
    const normalizedConversionFactor =
      Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
    const sku =
      String(skuCandidate || '').trim() ||
      generateSku(name, brandFromInput, content, price, mrp, purchasePackSize);
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
};

module.exports = { createProductInputNormalizer };
