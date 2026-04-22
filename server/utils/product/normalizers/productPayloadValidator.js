const createProductPayloadValidator = ({ fieldNormalizers }) => {
  const { normalizeDiscountType } = fieldNormalizers;

  return (payload, { partial = false } = {}) => {
    const errors = [];
    if (!payload && payload !== 0) return ['Product payload is required'];
    if (!partial || payload.name !== undefined) {
      if (!String(payload.name || '').trim()) errors.push('Product name is required');
    }
    if (!partial || payload.category !== undefined) {
      if (!String(payload.category || '').trim()) errors.push('Category is required');
    }
    if (!partial || payload.uom !== undefined) {
      if (!String(payload.uom || '').trim()) errors.push('UOM is required');
    }
    if (payload.uom_type !== undefined) {
      const uomType = String(payload.uom_type || '')
        .trim()
        .toLowerCase();
      if (!['selling', 'purchasing', 'both'].includes(uomType))
        errors.push('uom_type must be selling, purchasing or both');
    }
    if (payload.conversion_factor !== undefined) {
      const factor = Number(payload.conversion_factor);
      if (!Number.isFinite(factor) || factor <= 0)
        errors.push('conversion_factor must be a positive number');
    }
    if (
      payload.purchase_pack_size !== undefined &&
      payload.purchase_pack_size !== null &&
      payload.purchase_pack_size !== ''
    ) {
      const packSize = Number(payload.purchase_pack_size);
      if (!Number.isFinite(packSize) || packSize < 0)
        errors.push('purchase_pack_size must be >= 0');
    }
    if (payload.discount_type !== undefined) {
      const type = normalizeDiscountType(payload.discount_type);
      if (!['fixed', 'percent'].includes(type))
        errors.push('discount_type must be fixed or percent');
    }
    if (
      payload.expiry_date !== undefined &&
      payload.expiry_date !== null &&
      payload.expiry_date !== ''
    ) {
      const expiry = String(payload.expiry_date);
      if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry))
        errors.push('expiry_date must be YYYY-MM-DD');
    }
    return errors;
  };
};

module.exports = { createProductPayloadValidator };
