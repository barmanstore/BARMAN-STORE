const { registerBillingUserRoutes } = require('./routes/billingUserRoutes');
const { registerBillingSearchRoutes } = require('./routes/billingSearchRoutes');
const { registerBillingCreateRoutes } = require('./routes/billingCreateRoutes');
const { registerBillingAdminRoutes } = require('./routes/billingAdminRoutes');

const registerBillingRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    normalizePhone,
    normalizeOrderStatus,
    normalizePaymentMethod,
    normalizeProductRecord,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    resolveClientRequestId,
    isUniqueViolationError,
    generateBillNumber,
    logStockLedgerAsync,
    logAdminAuditAsync,
    createAppNotification,
  } = deps;

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

  const normalizeUomType = (value) => {
    const token = String(value || '')
      .trim()
      .toLowerCase();
    return ['selling', 'purchasing', 'both'].includes(token) ? token : 'selling';
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
      uomType: normalizeUomType(product?.uom_type),
    };
  };

  const getAllowedBillingUnits = (product = null) => {
    const profile = getProductUomProfile(product);
    const familyUnits = getAllowedUnitsFromBaseUnit(profile.baseUnit);
    if (familyUnits.length) return familyUnits;
    if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
    return [...new Set([profile.baseUnit, profile.sellingUnit])];
  };

  const toStockUnitQty = (qty, unit, product = null) => {
    const numericQty = Math.max(0, Number(qty || 0));
    if (numericQty <= 0) return 0;
    const profile = getProductUomProfile(product);
    const inputUnit = normalizeUomToken(unit, profile.sellingUnit);
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

  const fromStockUnitQty = (stockQty, unit, product = null) => {
    const numericQty = Math.max(0, Number(stockQty || 0));
    if (numericQty <= 0) return 0;
    const profile = getProductUomProfile(product);
    const outputUnit = normalizeUomToken(unit, profile.sellingUnit);
    const familyConverted = convertQtyBetweenFamilyUnits(
      numericQty,
      profile.baseUnit,
      outputUnit,
      profile.baseUnit
    );
    if (familyConverted !== null) return familyConverted;
    if (outputUnit === profile.baseUnit) return numericQty;
    if (outputUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
      return numericQty * profile.conversionFactor;
    }
    return numericQty;
  };

  const roundQty = (value) => Number(Number(value || 0).toFixed(3));
  const toPricingQty = (qty, unit, product = null) => {
    const numericQty = Math.max(0, Number(qty || 0));
    if (numericQty <= 0) return 0;
    return product ? toStockUnitQty(numericQty, unit, product) : numericQty;
  };

  const routeDeps = {
    ...deps,
    normalizeUomToken,
    UNIT_FAMILY_BASE_BY_UNIT,
    UNIT_FAMILY_MULTIPLIERS,
    getUomFamily,
    getAllowedUnitsFromBaseUnit,
    convertQtyBetweenFamilyUnits,
    normalizeUomType,
    getProductUomProfile,
    getAllowedBillingUnits,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
    toPricingQty,
  };

  registerBillingUserRoutes(routeDeps);
  registerBillingSearchRoutes(routeDeps);
  registerBillingCreateRoutes(routeDeps);
  registerBillingAdminRoutes(routeDeps);
};

module.exports = { registerBillingRoutes };
