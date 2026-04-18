const toPositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
};

const getPurchaseDraftDiagnostics = ({
  items = [],
  products = [],
  findProductForItem,
  calculateOrderItem,
  rateWarningThresholdPercent = 10,
  rateConfirmationThresholdPercent = 25,
  unusualDiscountThresholdPercent = 20,
}) => {
  const duplicateMap = new Map();
  const rowDiagnostics = (Array.isArray(items) ? items : []).map((item, index) => {
    const line = calculateOrderItem(item);
    const hasProduct = Boolean(String(item?.product_id || '').trim());
    const normalizedUom = String(line?.uom || item?.uom || '')
      .trim()
      .toLowerCase();
    const duplicateKey =
      hasProduct && normalizedUom ? `${String(item.product_id).trim()}::${normalizedUom}` : '';
    const product =
      typeof findProductForItem === 'function' ? findProductForItem(products, item) : null;
    const currentRate = toPositiveNumber(item?.rate ?? item?.unit_price);
    const referenceRate = toPositiveNumber(item?.reference_rate || product?.price);
    const referenceSource = String(
      item?.reference_rate_source || (referenceRate > 0 ? 'product reference rate' : '')
    ).trim();
    const deltaPercent =
      referenceRate > 0 && currentRate > 0
        ? (Math.abs(currentRate - referenceRate) / referenceRate) * 100
        : 0;
    const rateWarningAcknowledged = Boolean(item?.rate_warning_acknowledged);
    const isHigher = currentRate > referenceRate;
    const direction = isHigher ? 'higher' : 'cheaper';
    const rateRequiresAcknowledgement =
      deltaPercent >= rateConfirmationThresholdPercent && !rateWarningAcknowledged;
    const tone =
      deltaPercent > 0
        ? deltaPercent >= rateWarningThresholdPercent || rateRequiresAcknowledgement
          ? 'bad'
          : isHigher
            ? 'bad'
            : 'good'
        : 'neutral';
    const rateChangeLabel = deltaPercent > 0 ? `${deltaPercent.toFixed(1)}% ${direction}` : '';
    const rateWarningMessage =
      deltaPercent >= rateWarningThresholdPercent
        ? `Rate is ${deltaPercent.toFixed(1)}% ${direction} than ${referenceSource || 'reference'} (${referenceRate.toFixed(2)})`
        : '';
    const rateAcknowledgedLabel =
      rateRequiresAcknowledgement ||
      !rateWarningAcknowledged ||
      deltaPercent < rateConfirmationThresholdPercent
        ? ''
        : 'Unusual rate confirmed';
    const rateAcknowledgementMessage = rateRequiresAcknowledgement
      ? `This ${direction} rate is unusual. Confirm it is intentional before saving.`
      : '';
    const grossAmount = toPositiveNumber(line?.grossAmount);
    const quantityInBase = toPositiveNumber(line?.quantityInBase);
    const discountType = item?.discount_type === 'fixed' ? 'fixed' : 'percent';
    const rawDiscountValue = toPositiveNumber(item?.discount_value);
    const requestedDiscountAmount =
      discountType === 'fixed' ? rawDiscountValue : (grossAmount * rawDiscountValue) / 100;
    const appliedDiscountAmount = toPositiveNumber(line?.discountAmount);
    const netUnitCost =
      quantityInBase > 0 ? toPositiveNumber(line?.taxableValue) / quantityInBase : 0;
    const netCostDropPercent =
      referenceRate > 0 && netUnitCost > 0 && netUnitCost < referenceRate
        ? ((referenceRate - netUnitCost) / referenceRate) * 100
        : 0;
    const discountPercent = grossAmount > 0 ? (requestedDiscountAmount / grossAmount) * 100 : 0;
    const discountWarningAcknowledged = Boolean(item?.discount_warning_acknowledged);
    const discountAppliedLabel =
      appliedDiscountAmount > 0 ? `Discount ${appliedDiscountAmount.toFixed(2)} applied` : '';
    const discountCreatesLargeNetDrop =
      appliedDiscountAmount > 0 && netCostDropPercent >= rateConfirmationThresholdPercent;
    const discountWarningMessage =
      appliedDiscountAmount > 0 && requestedDiscountAmount < grossAmount
        ? discountCreatesLargeNetDrop
          ? `Net unit cost is ${netCostDropPercent.toFixed(1)}% cheaper than ${referenceSource || 'reference'} after discount. Confirm it is intentional.`
          : discountPercent > unusualDiscountThresholdPercent
            ? `Discount is ${discountPercent.toFixed(1)}% of base amount. Check if it should be cleared.`
            : ''
        : '';
    const discountRequiresAcknowledgement =
      Boolean(discountWarningMessage) && !discountWarningAcknowledged;
    const discountAcknowledgedLabel =
      discountWarningMessage && discountWarningAcknowledged ? 'Unusual discount confirmed' : '';
    const discountAcknowledgementMessage = discountRequiresAcknowledgement
      ? 'This discount is unusually large. Confirm it is intentional before saving.'
      : '';
    const discountBlockingMessage =
      grossAmount > 0 && requestedDiscountAmount >= grossAmount
        ? 'Discount reaches or exceeds the base amount. Clear or reduce it before saving.'
        : '';

    return {
      index,
      duplicateKey,
      duplicateMessage: '',
      referenceRate,
      referenceSource,
      rateDeltaPercent: deltaPercent,
      rateDeltaDirection: direction,
      rateChangeTone: tone,
      rateChangeLabel,
      rateWarningAcknowledged,
      rateWarningMessage,
      rateRequiresAcknowledgement,
      rateAcknowledgedLabel,
      rateAcknowledgementMessage,
      discountAppliedAmount: appliedDiscountAmount,
      discountAppliedLabel,
      discountPercent,
      netUnitCost,
      netCostDropPercent,
      discountWarningAcknowledged,
      discountWarningMessage,
      discountRequiresAcknowledgement,
      discountAcknowledgedLabel,
      discountAcknowledgementMessage,
      discountBlockingMessage,
    };
  });

  rowDiagnostics.forEach((entry) => {
    if (!entry.duplicateKey) return;
    const existing = duplicateMap.get(entry.duplicateKey) || [];
    existing.push(entry.index);
    duplicateMap.set(entry.duplicateKey, existing);
  });

  const duplicateRows = [];
  duplicateMap.forEach((indices) => {
    if (indices.length < 2) return;
    indices.forEach((rowIndex, position) => {
      duplicateRows.push(rowIndex);
      rowDiagnostics[rowIndex].duplicateMessage =
        position === 0
          ? `Duplicate row detected with row ${indices[position + 1] + 1}`
          : `Duplicate row detected with row ${indices[0] + 1}`;
    });
  });

  return {
    rowDiagnostics,
    duplicateRows,
    rateWarningCount: rowDiagnostics.filter((entry) => entry.rateWarningMessage).length,
    rateAcknowledgedCount: rowDiagnostics.filter((entry) => entry.rateAcknowledgedLabel).length,
    rateConfirmationCount: rowDiagnostics.filter((entry) => entry.rateRequiresAcknowledgement)
      .length,
    discountWarningCount: rowDiagnostics.filter((entry) => entry.discountWarningMessage).length,
    discountAcknowledgedCount: rowDiagnostics.filter((entry) => entry.discountAcknowledgedLabel)
      .length,
    discountConfirmationCount: rowDiagnostics.filter(
      (entry) => entry.discountRequiresAcknowledgement
    ).length,
    discountBlockingRows: rowDiagnostics
      .filter((entry) => entry.discountBlockingMessage)
      .map((entry) => entry.index),
    discountConfirmationRows: rowDiagnostics
      .filter((entry) => entry.discountRequiresAcknowledgement)
      .map((entry) => entry.index),
    rateConfirmationRows: rowDiagnostics
      .filter((entry) => entry.rateRequiresAcknowledgement)
      .map((entry) => entry.index),
    hasDiscountErrors: rowDiagnostics.some((entry) => entry.discountBlockingMessage),
    hasRateConfirmationErrors: rowDiagnostics.some((entry) => entry.rateRequiresAcknowledgement),
    hasDiscountConfirmationErrors: rowDiagnostics.some(
      (entry) => entry.discountRequiresAcknowledgement
    ),
    hasDuplicateErrors: duplicateRows.length > 0,
    blockingMessage: [
      duplicateRows.length > 0
        ? 'Duplicate product rows found for the same product and unit. Merge them or change the unit before saving.'
        : '',
      rowDiagnostics.some((entry) => entry.rateRequiresAcknowledgement)
        ? 'One or more rows have unusual rate changes. Confirm them before saving.'
        : '',
      rowDiagnostics.some((entry) => entry.discountBlockingMessage)
        ? 'One or more rows have discount equal to or greater than the line base amount. Clear or reduce discount before saving.'
        : '',
      rowDiagnostics.some((entry) => entry.discountRequiresAcknowledgement)
        ? 'One or more rows have unusual discount values. Confirm them before saving.'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
};

export { getPurchaseDraftDiagnostics };
