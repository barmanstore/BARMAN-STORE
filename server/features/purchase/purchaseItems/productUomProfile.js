const {
  normalizePurchaseUomToken,
  getAllowedPurchaseUnitsFromBaseUnit,
  convertPurchaseQtyBetweenFamilyUnits,
} = require('./uomUtils');

const getPurchaseProductUomProfile = (product = null) => {
  const sellingUnit = normalizePurchaseUomToken(product?.uom, 'pcs');
  const baseUnit = normalizePurchaseUomToken(product?.base_unit, sellingUnit);
  const conversionFactorRaw = Number(product?.conversion_factor ?? 1);
  const conversionFactor = Number.isFinite(conversionFactorRaw) && conversionFactorRaw > 0
    ? conversionFactorRaw
    : 1;
  return {
    sellingUnit,
    baseUnit,
    conversionFactor,
  };
};

const getAllowedPurchaseUnitsForProductRow = (product = null) => {
  const profile = getPurchaseProductUomProfile(product);
  const familyUnits = getAllowedPurchaseUnitsFromBaseUnit(profile.baseUnit);
  if (familyUnits.length) return familyUnits;
  if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
  return [...new Set([profile.baseUnit, profile.sellingUnit])];
};

const toPurchaseBaseQty = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const profile = getPurchaseProductUomProfile(product);
  const requestedUnit = normalizePurchaseUomToken(unit, profile.baseUnit);
  const familyConverted = convertPurchaseQtyBetweenFamilyUnits(
    numericQty,
    requestedUnit,
    profile.baseUnit,
    profile.baseUnit
  );
  if (familyConverted !== null) return familyConverted;
  if (requestedUnit === profile.baseUnit) return numericQty;
  if (requestedUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

module.exports = {
  getPurchaseProductUomProfile,
  getAllowedPurchaseUnitsForProductRow,
  toPurchaseBaseQty,
};
