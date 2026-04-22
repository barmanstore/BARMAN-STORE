const {
  normalizePurchaseUomToken,
  getPurchaseUnitFamily,
  getAllowedPurchaseUnitsFromBaseUnit,
  convertPurchaseQtyBetweenFamilyUnits,
} = require('./purchaseItems/uomUtils');
const {
  getPurchaseProductUomProfile,
  getAllowedPurchaseUnitsForProductRow,
  toPurchaseBaseQty,
} = require('./purchaseItems/productUomProfile');
const {
  createPurchaseValidationError,
  createPurchaseConflictError,
} = require('./purchaseItems/itemErrors');
const { createPurchaseItemNormalizer } = require('./purchaseItems/normalizeItems');

const createPurchaseItemUtils = (deps = {}) => {
  const { dbGetAsync } = deps;

  const { normalizePurchaseOrderItems } = createPurchaseItemNormalizer({
    dbGetAsync,
    createPurchaseValidationError,
  });

  return {
    normalizePurchaseUomToken,
    getPurchaseUnitFamily,
    getAllowedPurchaseUnitsFromBaseUnit,
    convertPurchaseQtyBetweenFamilyUnits,
    getPurchaseProductUomProfile,
    getAllowedPurchaseUnitsForProductRow,
    toPurchaseBaseQty,
    normalizePurchaseOrderItems,
    createPurchaseValidationError,
    createPurchaseConflictError,
  };
};

module.exports = { createPurchaseItemUtils };
