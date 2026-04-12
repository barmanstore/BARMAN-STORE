const toPositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
};

const getPurchaseDraftDiagnostics = ({ items = [] } = {}) => {
  const rowDiagnostics = (Array.isArray(items) ? items : []).map((item, index) => ({
    index,
    duplicateKey: '',
    duplicateMessage: '',
    referenceRate: 0,
    referenceSource: '',
    rateDeltaPercent: 0,
    rateDeltaDirection: '',
    rateChangeTone: 'neutral',
    rateChangeLabel: '',
    rateWarningAcknowledged: false,
    rateWarningMessage: '',
    rateRequiresAcknowledgement: false,
    rateAcknowledgedLabel: '',
    rateAcknowledgementMessage: '',
    discountAppliedAmount: toPositiveNumber(item?.discount_value),
    discountAppliedLabel: '',
    discountPercent: 0,
    netUnitCost: 0,
    netCostDropPercent: 0,
    discountWarningAcknowledged: false,
    discountWarningMessage: '',
    discountRequiresAcknowledgement: false,
    discountAcknowledgedLabel: '',
    discountAcknowledgementMessage: '',
    discountBlockingMessage: '',
  }));
  const duplicateRows = [];

  return {
    rowDiagnostics,
    duplicateRows,
    rateWarningCount: 0,
    rateAcknowledgedCount: 0,
    rateConfirmationCount: 0,
    discountWarningCount: 0,
    discountAcknowledgedCount: 0,
    discountConfirmationCount: 0,
    discountBlockingRows: [],
    discountConfirmationRows: [],
    rateConfirmationRows: [],
    hasDiscountErrors: false,
    hasRateConfirmationErrors: false,
    hasDiscountConfirmationErrors: false,
    hasDuplicateErrors: false,
    blockingMessage: '',
  };
};

export { getPurchaseDraftDiagnostics };
