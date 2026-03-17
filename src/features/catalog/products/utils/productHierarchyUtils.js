import { normalizeText } from './productTextUtils';

const splitHierarchyValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw || !raw.includes('->')) return { parent: raw, child: '' };
  const parts = raw.split('->').map((part) => String(part || '').trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { parent: raw, child: '' };
  return { parent: parts[0], child: parts[1] };
};

const composeHierarchyLabel = (parent, child) => {
  const parentName = String(parent || '').trim();
  const childName = String(child || '').trim();
  if (!parentName) return '';
  if (!childName) return parentName;
  return `${parentName} -> ${childName}`;
};

const getProductHierarchy = (product) => {
  const parsedCategory = splitHierarchyValue(product?.category);
  const explicitCategory = String(product?.category || '').trim();
  const explicitSubcategory = String(product?.subcategory ?? product?.sub_category ?? '').trim();
  const category = explicitCategory || parsedCategory.parent || '';
  const subcategory = explicitSubcategory || parsedCategory.child || '';
  const categoryPath = String(product?.category_path || '').trim() || composeHierarchyLabel(category, subcategory);

  const parsedBrand = splitHierarchyValue(product?.brand);
  const explicitBrand = String(product?.brand || '').trim();
  const explicitSubBrand = String(product?.sub_brand ?? product?.subBrand ?? product?.subbrand ?? '').trim();
  const brand = explicitBrand || parsedBrand.parent || '';
  const subBrand = explicitSubBrand || parsedBrand.child || '';
  const brandPath = String(product?.brand_path || '').trim() || composeHierarchyLabel(brand, subBrand);

  return { category, subcategory, categoryPath, brand, subBrand, brandPath };
};

const getFamilyKey = (product, hierarchy = null) => {
  const name = normalizeText(product?.name);
  const resolved = hierarchy || getProductHierarchy(product);
  const brand = normalizeText(resolved.brandPath || resolved.brand);
  return `${name}|${brand}`;
};

export {
  splitHierarchyValue,
  composeHierarchyLabel,
  getProductHierarchy,
  getFamilyKey,
};
