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
}) => {
  const duplicateMap = new Map();
  const rowDiagnostics = (Array.isArray(items) ? items : []).map((item, index) => {
    const hasProduct = Boolean(String(item?.product_id || '').trim());
    const normalizedUom = String(calculateOrderItem(item)?.uom || item?.uom || '').trim().toLowerCase();
    const duplicateKey = hasProduct && normalizedUom ? `${String(item.product_id).trim()}::${normalizedUom}` : '';
    const product = typeof findProductForItem === 'function' ? findProductForItem(products, item) : null;
    const currentRate = toPositiveNumber(item?.rate ?? item?.unit_price);
    const referenceRate = toPositiveNumber(item?.reference_rate || product?.price);
    const referenceSource = String(item?.reference_rate_source || (referenceRate > 0 ? 'product reference rate' : '')).trim();
    const deltaPercent = referenceRate > 0 && currentRate > 0
      ? (Math.abs(currentRate - referenceRate) / referenceRate) * 100
      : 0;
    const direction = currentRate >= referenceRate ? 'above' : 'below';

    return {
      index,
      duplicateKey,
      duplicateMessage: '',
      rateWarningMessage: deltaPercent >= rateWarningThresholdPercent
        ? `Rate is ${deltaPercent.toFixed(1)}% ${direction} ${referenceSource || 'reference'} (${referenceRate.toFixed(2)})`
        : '',
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
      rowDiagnostics[rowIndex].duplicateMessage = position === 0
        ? `Duplicate row detected with row ${indices[position + 1] + 1}`
        : `Duplicate row detected with row ${indices[0] + 1}`;
    });
  });

  return {
    rowDiagnostics,
    duplicateRows,
    rateWarningCount: rowDiagnostics.filter((entry) => entry.rateWarningMessage).length,
    hasDuplicateErrors: duplicateRows.length > 0,
    blockingMessage: duplicateRows.length > 0
      ? 'Duplicate product rows found for the same product and unit. Merge them or change the unit before saving.'
      : '',
  };
};

export { getPurchaseDraftDiagnostics };
