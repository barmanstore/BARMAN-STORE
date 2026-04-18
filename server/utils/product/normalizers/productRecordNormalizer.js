const createProductRecordNormalizer = ({ fieldNormalizers }) => {
  const {
    normalizeDiscountType,
    normalizeMoneyValue,
    normalizeHttpImageUrl,
    normalizeBooleanish,
    splitHierarchyInput,
  } = fieldNormalizers;

  return (row) => {
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
    const uomType = String(out.uom_type || 'selling')
      .trim()
      .toLowerCase();
    const conversionFactor = Number(out.conversion_factor ?? 1);
    out.uom_type = ['selling', 'purchasing', 'both'].includes(uomType) ? uomType : 'selling';
    out.conversion_factor =
      Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
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
};

module.exports = { createProductRecordNormalizer };
