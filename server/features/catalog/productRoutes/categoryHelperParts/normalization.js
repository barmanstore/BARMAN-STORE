const createCategoryNormalization = () => {
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

  const toNullablePositiveInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const normalizeCategoryName = (value) => String(value || '').trim();
  const normalizeCategoryIcon = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return raw.slice(0, 32);
  };
  const normalizeCategoryImage = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw.slice(0, 800);
    return null;
  };
  const toNullableImageDimension = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed);
    if (rounded < 16 || rounded > 4096) return null;
    return rounded;
  };
  const isSameParent = (left, right) => {
    const a = toNullablePositiveInt(left);
    const b = toNullablePositiveInt(right);
    return a === b;
  };

  const normalizeCategoryRow = (row) => ({
    ...row,
    id: Number(row?.id || 0),
    parent_id: row?.parent_id == null ? null : Number(row.parent_id),
    icon: normalizeCategoryIcon(row?.icon),
    image: normalizeCategoryImage(row?.image),
    image_width: toNullableImageDimension(row?.image_width),
    image_height: toNullableImageDimension(row?.image_height),
    product_count: Number(row?.product_count || 0),
    total_product_count: Number(row?.total_product_count || 0),
  });

  const splitHierarchySegments = (value) => (
    String(value || '')
      .split('->')
      .map((part) => normalizeCategoryName(part))
      .filter(Boolean)
  );

  return {
    hasOwn,
    toNullablePositiveInt,
    normalizeCategoryName,
    normalizeCategoryIcon,
    normalizeCategoryImage,
    toNullableImageDimension,
    isSameParent,
    normalizeCategoryRow,
    splitHierarchySegments,
  };
};

module.exports = { createCategoryNormalization };
