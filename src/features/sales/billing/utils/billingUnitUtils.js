const normalizeUomToken = (value, fallback = 'pcs') =>
  String(value || fallback)
    .trim()
    .toLowerCase() || fallback;

const UNIT_FAMILY_BASE_BY_UNIT = Object.freeze({
  pcs: 'pcs',
  dozen: 'pcs',
  kg: 'kg',
  g: 'kg',
  l: 'l',
  ml: 'l',
});

const UNIT_FAMILY_MULTIPLIERS = Object.freeze({
  pcs: Object.freeze({ pcs: 1, dozen: 12 }),
  kg: Object.freeze({ kg: 1, g: 0.001 }),
  l: Object.freeze({ l: 1, ml: 0.001 }),
});

const getUomFamily = (baseUnit = 'pcs') => {
  const normalizedBase = normalizeUomToken(baseUnit, 'pcs');
  const familyBase = UNIT_FAMILY_BASE_BY_UNIT[normalizedBase];
  if (!familyBase) return null;
  const multipliers = UNIT_FAMILY_MULTIPLIERS[familyBase];
  if (!multipliers || !Number.isFinite(multipliers[normalizedBase])) return null;
  return {
    normalizedBase,
    multipliers,
  };
};

const getAllowedUnitsFromBaseUnit = (baseUnit = 'pcs') => {
  const family = getUomFamily(baseUnit);
  if (!family) return [];
  const allUnits = Object.keys(family.multipliers);
  return [family.normalizedBase, ...allUnits.filter((unit) => unit !== family.normalizedBase)];
};

const convertQtyBetweenFamilyUnits = (qty, fromUnit, toUnit, baseUnit = 'pcs') => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const family = getUomFamily(baseUnit);
  if (!family) return null;
  const from = normalizeUomToken(fromUnit, family.normalizedBase);
  const to = normalizeUomToken(toUnit, family.normalizedBase);
  const fromMultiplier = family.multipliers[from];
  const toMultiplier = family.multipliers[to];
  if (!Number.isFinite(fromMultiplier) || !Number.isFinite(toMultiplier) || toMultiplier <= 0) {
    return null;
  }
  const qtyInCanonicalBase = numericQty * fromMultiplier;
  return qtyInCanonicalBase / toMultiplier;
};

const getProductUomProfile = (product = null) => {
  const sellingUnit = normalizeUomToken(product?.uom, 'pcs');
  const baseUnit = normalizeUomToken(product?.base_unit, sellingUnit);
  const conversionFactorRaw = Number(product?.conversion_factor ?? 1);
  const conversionFactor =
    Number.isFinite(conversionFactorRaw) && conversionFactorRaw > 0 ? conversionFactorRaw : 1;
  return { sellingUnit, baseUnit, conversionFactor };
};

const getAllowedUnitsForProduct = (product = null) => {
  if (!product) return ['pcs'];
  const profile = getProductUomProfile(product);
  const familyUnits = getAllowedUnitsFromBaseUnit(profile.baseUnit);
  if (familyUnits.length) return familyUnits;
  if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
  return [...new Set([profile.baseUnit, profile.sellingUnit])];
};

const resolveLineUnitForProduct = (product = null, unit = 'pcs') => {
  if (!product) return normalizeUomToken(unit, 'pcs');
  const allowedUnits = getAllowedUnitsForProduct(product);
  const requestedUnit = normalizeUomToken(unit, allowedUnits[0] || 'pcs');
  return allowedUnits.includes(requestedUnit) ? requestedUnit : allowedUnits[0] || requestedUnit;
};

const toPricingQtyFromProduct = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  if (!product) return numericQty;
  const profile = getProductUomProfile(product);
  const inputUnit = resolveLineUnitForProduct(product, unit);
  const familyConverted = convertQtyBetweenFamilyUnits(
    numericQty,
    inputUnit,
    profile.baseUnit,
    profile.baseUnit
  );
  if (familyConverted !== null) return familyConverted;
  if (inputUnit === profile.baseUnit) return numericQty;
  if (inputUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

export {
  normalizeUomToken,
  getAllowedUnitsForProduct,
  resolveLineUnitForProduct,
  toPricingQtyFromProduct,
  getProductUomProfile,
  getAllowedUnitsFromBaseUnit,
  convertQtyBetweenFamilyUnits,
};
