export const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toLocalDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatHierarchyPath = (parent, child) => {
  const root = String(parent || '').trim();
  const leaf = String(child || '').trim();
  if (!root) return '';
  if (!leaf) return root;
  return `${root} -> ${leaf}`;
};

export const getCategoryPath = (product) => (
  String(product?.category_path || '').trim()
  || formatHierarchyPath(product?.category, product?.subcategory)
  || String(product?.category || '').trim()
);

export const getBrandPath = (product) => (
  String(product?.brand_path || '').trim()
  || formatHierarchyPath(product?.brand, product?.sub_brand)
  || String(product?.brand || '').trim()
);

export const getInitials = (name) => {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return `${first}${last}`.toUpperCase();
};

export const formatJoinedDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};
