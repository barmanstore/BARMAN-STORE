const normalizePurchaseUomToken = (value, fallback = 'pcs') =>
  String(value || fallback).trim().toLowerCase() || fallback;

const PURCHASE_UNIT_FAMILY_BASE_BY_UNIT = Object.freeze({
  pcs: 'pcs',
  dozen: 'pcs',
  kg: 'kg',
  g: 'kg',
  l: 'l',
  ml: 'l',
});

const PURCHASE_UNIT_FAMILY_MULTIPLIERS = Object.freeze({
  pcs: Object.freeze({ pcs: 1, dozen: 12 }),
  kg: Object.freeze({ kg: 1, g: 0.001 }),
  l: Object.freeze({ l: 1, ml: 0.001 }),
});

const getPurchaseUnitFamily = (baseUnit = 'pcs') => {
  const normalizedBase = normalizePurchaseUomToken(baseUnit, 'pcs');
  const familyBase = PURCHASE_UNIT_FAMILY_BASE_BY_UNIT[normalizedBase];
  if (!familyBase) return null;
  const multipliers = PURCHASE_UNIT_FAMILY_MULTIPLIERS[familyBase];
  if (!multipliers || !Number.isFinite(multipliers[normalizedBase])) return null;
  return {
    normalizedBase,
    multipliers,
  };
};

const getAllowedPurchaseUnitsFromBaseUnit = (baseUnit = 'pcs') => {
  const family = getPurchaseUnitFamily(baseUnit);
  if (!family) return [];
  const allUnits = Object.keys(family.multipliers);
  return [family.normalizedBase, ...allUnits.filter((unit) => unit !== family.normalizedBase)];
};

const convertPurchaseQtyBetweenFamilyUnits = (qty, fromUnit, toUnit, baseUnit = 'pcs') => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const family = getPurchaseUnitFamily(baseUnit);
  if (!family) return null;
  const from = normalizePurchaseUomToken(fromUnit, family.normalizedBase);
  const to = normalizePurchaseUomToken(toUnit, family.normalizedBase);
  const fromMultiplier = family.multipliers[from];
  const toMultiplier = family.multipliers[to];
  if (!Number.isFinite(fromMultiplier) || !Number.isFinite(toMultiplier) || toMultiplier <= 0) {
    return null;
  }
  const qtyInCanonicalBase = numericQty * fromMultiplier;
  return qtyInCanonicalBase / toMultiplier;
};

module.exports = {
  normalizePurchaseUomToken,
  getPurchaseUnitFamily,
  getAllowedPurchaseUnitsFromBaseUnit,
  convertPurchaseQtyBetweenFamilyUnits,
};
