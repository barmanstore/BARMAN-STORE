import { getProductImageSrc } from '../../../../shared/utils/productImage';
import {
  getFamilyKey,
  getProductHierarchy,
  normalizeText,
  tokenizeSearchText,
} from './productHelpers.js';

const buildProductFamilies = (products = []) => {
  const familyMap = new Map();
  products.forEach((product) => {
    const hierarchy = getProductHierarchy(product);
    const key = getFamilyKey(product, hierarchy);
    const variationSignature = [
      normalizeText(product?.name),
      normalizeText(hierarchy.brandPath || hierarchy.brand),
      Number(product?.price || 0).toFixed(2),
      Number(product?.mrp || product?.price || 0).toFixed(2),
      normalizeText(product?.content),
      normalizeText(product?.color),
    ].join('|');

    if (!familyMap.has(key)) {
      familyMap.set(key, {
        id: key,
        key,
        name: String(product.name || 'Product').trim() || 'Product',
        brand: hierarchy.brandPath || hierarchy.brand || '',
        brandRoot: hierarchy.brand || '',
        subBrand: hierarchy.subBrand || '',
        category: hierarchy.category || '',
        subcategory: hierarchy.subcategory || '',
        categoryPath: hierarchy.categoryPath || hierarchy.category || '',
        categoryIds: new Set(),
        description: String(product.description || '').trim(),
        variations: [],
      });
    }
    const family = familyMap.get(key);
    const productCategoryId = Number(product?.category_id || 0);
    if (Number.isInteger(productCategoryId) && productCategoryId > 0) {
      family.categoryIds.add(productCategoryId);
    }
    const existingVariation = family.variations.find((variation) => variation.signature === variationSignature);
    if (existingVariation) {
      existingVariation.stock = Number(existingVariation.stock || 0) + Number(product.stock || 0);
      if (!existingVariation.description && product.description) {
        existingVariation.description = String(product.description || '').trim();
      }
    } else {
      family.variations.push({
        id: product.id,
        signature: variationSignature,
        name: String(product.name || '').trim(),
        brand: hierarchy.brandPath || hierarchy.brand || '',
        brandRoot: hierarchy.brand || '',
        subBrand: hierarchy.subBrand || '',
        category: hierarchy.categoryPath || hierarchy.category || '',
        categoryRoot: hierarchy.category || '',
        subcategory: hierarchy.subcategory || '',
        description: String(product.description || '').trim(),
        color: String(product.color || '').trim(),
        content: String(product.content || '').trim(),
        sku: String(product.sku || '').trim(),
        price: Number(product.price || 0),
        mrp: Number(product.mrp || 0),
        stock: Number(product.stock || 0),
        uom: String(product.uom || 'pcs').trim(),
        image: getProductImageSrc(product),
        raw: product,
      });
    }
    if (!family.description && product.description) {
      family.description = String(product.description || '').trim();
    }
    if (!family.category && hierarchy.category) {
      family.category = hierarchy.category;
    }
    if (!family.categoryPath && hierarchy.categoryPath) {
      family.categoryPath = hierarchy.categoryPath;
    }
    if (!family.brand && (hierarchy.brandPath || hierarchy.brand)) {
      family.brand = hierarchy.brandPath || hierarchy.brand;
    }
    if (!family.brandRoot && hierarchy.brand) {
      family.brandRoot = hierarchy.brand;
    }
    if (!family.subBrand && hierarchy.subBrand) {
      family.subBrand = hierarchy.subBrand;
    }
    if (!family.subcategory && hierarchy.subcategory) {
      family.subcategory = hierarchy.subcategory;
    }
  });

  return [...familyMap.values()].map((family) => {
    const sortedVariations = [...family.variations].sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return String(a.content || '').localeCompare(String(b.content || ''));
    });
    const searchHaystack = [
      family.name,
      family.brand,
      family.brandRoot,
      family.subBrand,
      family.category,
      family.subcategory,
      family.categoryPath,
      family.description,
      ...sortedVariations.map((variation) => `${variation.content} ${variation.color} ${variation.sku}`),
    ]
      .map((value) => normalizeText(value))
      .join(' ');
    const searchTokens = Array.from(new Set(tokenizeSearchText(searchHaystack))).slice(0, 96);
    const minPrice = sortedVariations.reduce((min, variation) => Math.min(min, Number(variation.price || 0)), Infinity);
    const totalStock = sortedVariations.reduce((sum, variation) => sum + Number(variation.stock || 0), 0);
    const categoryIds = Array.from(family.categoryIds || [])
      .map((value) => Number(value || 0))
      .filter((value) => Number.isInteger(value) && value > 0);
    return {
      ...family,
      categoryIds,
      variations: sortedVariations,
      searchHaystack,
      searchTokens,
      minPrice: Number.isFinite(minPrice) ? minPrice : 0,
      totalStock,
    };
  });
};

export default buildProductFamilies;

