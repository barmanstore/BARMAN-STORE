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
  return {
    sellingUnit,
    baseUnit,
    conversionFactor,
  };
};

const getAllowedPurchaseUnitsForProduct = (product = null) => {
  if (!product) return ['pcs'];
  const profile = getProductUomProfile(product);
  const familyUnits = getAllowedUnitsFromBaseUnit(profile.baseUnit);
  if (familyUnits.length) return familyUnits;
  if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
  return [...new Set([profile.baseUnit, profile.sellingUnit])];
};

const resolvePurchaseUnitForProduct = (product = null, unit = 'pcs') => {
  if (!product) return normalizeUomToken(unit, 'pcs');
  const allowedUnits = getAllowedPurchaseUnitsForProduct(product);
  const requestedUnit = normalizeUomToken(unit, allowedUnits[0] || 'pcs');
  return allowedUnits.includes(requestedUnit) ? requestedUnit : allowedUnits[0] || requestedUnit;
};

const toBaseQtyForProduct = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  if (!product) return numericQty;
  const profile = getProductUomProfile(product);
  const resolvedUnit = resolvePurchaseUnitForProduct(product, unit);
  const familyConverted = convertQtyBetweenFamilyUnits(
    numericQty,
    resolvedUnit,
    profile.baseUnit,
    profile.baseUnit
  );
  if (familyConverted !== null) return familyConverted;
  if (resolvedUnit === profile.baseUnit) return numericQty;
  if (resolvedUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

const fromBaseQtyForProduct = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  if (!product) return numericQty;
  const profile = getProductUomProfile(product);
  const resolvedUnit = resolvePurchaseUnitForProduct(product, unit);
  const familyConverted = convertQtyBetweenFamilyUnits(
    numericQty,
    profile.baseUnit,
    resolvedUnit,
    profile.baseUnit
  );
  if (familyConverted !== null) return familyConverted;
  if (resolvedUnit === profile.baseUnit) return numericQty;
  if (resolvedUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty * profile.conversionFactor;
  }
  return numericQty;
};

const getPurchasePackStep = (product = null, unit = 'pcs') => {
  const packSize = Number(product?.purchase_pack_size ?? 0);
  if (!Number.isFinite(packSize) || packSize <= 0) return 1;
  const converted = fromBaseQtyForProduct(packSize, unit, product);
  if (!Number.isFinite(converted) || converted <= 0) return packSize;
  return converted;
};

export {
  fromBaseQtyForProduct,
  getAllowedPurchaseUnitsForProduct,
  getProductUomProfile,
  getPurchasePackStep,
  resolvePurchaseUnitForProduct,
  toBaseQtyForProduct,
};
