const createProductFieldNormalizers = () => {
  const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const toPositiveIntOrNull = (value) => {
    const n = toNumberOrNull(value);
    if (n === null) return null;
    return Math.trunc(n);
  };

  const normalizeDiscountType = (value) => {
    const raw = String(value || 'fixed').trim().toLowerCase();
    return raw === 'percent' || raw === 'percentage' ? 'percent' : 'fixed';
  };

  const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();

  const normalizeMoneyValue = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeHttpImageUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.toString();
    } catch (error) {
      return '';
    }
  };

  const normalizeBooleanish = (value, fallback = 1) => {
    const raw = String(value).trim().toLowerCase();
    if (!raw) return fallback;
    if (['true', 'yes', '1'].includes(raw)) return 1;
    if (['false', 'no', '0'].includes(raw)) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? (n ? 1 : 0) : fallback;
  };

  const HIERARCHY_SEPARATOR = '->';
  const splitHierarchyInput = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return { parent: '', child: '', invalid: false };
    const parts = raw.split(HIERARCHY_SEPARATOR).map((part) => String(part || '').trim());
    if (parts.length === 1) return { parent: parts[0], child: '', invalid: false };
    if (parts.length === 2) return { parent: parts[0], child: parts[1], invalid: false };
    return { parent: parts[0], child: parts.slice(1).join(` ${HIERARCHY_SEPARATOR} `), invalid: true };
  };

  const composeHierarchyPath = (parent, child) => {
    const root = String(parent || '').trim();
    const leaf = String(child || '').trim();
    if (!root) return leaf;
    if (!leaf) return root;
    return `${root} ${HIERARCHY_SEPARATOR} ${leaf}`;
  };

  const buildProductExactKey = (payload) => {
    const nameKey = normalizeTextKey(payload?.name);
    if (!nameKey) return '';
    const brandKey = normalizeTextKey(payload?.brand);
    const subBrandKey = normalizeTextKey(payload?.sub_brand);
    const contentKey = normalizeTextKey(payload?.content);
    const colorKey = normalizeTextKey(payload?.color);
    const price = normalizeMoneyValue(payload?.price);
    const mrp = normalizeMoneyValue(payload?.mrp);
    return `${nameKey}::${brandKey}::${subBrandKey}::${contentKey}::${colorKey}::${price ?? ''}::${mrp ?? ''}`;
  };

  return {
    HIERARCHY_SEPARATOR,
    toNumberOrNull,
    toPositiveIntOrNull,
    normalizeDiscountType,
    normalizeTextKey,
    normalizeMoneyValue,
    normalizeHttpImageUrl,
    normalizeBooleanish,
    splitHierarchyInput,
    composeHierarchyPath,
    buildProductExactKey,
  };
};

module.exports = { createProductFieldNormalizers };
