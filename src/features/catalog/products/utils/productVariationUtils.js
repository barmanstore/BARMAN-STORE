import { LOW_STOCK_THRESHOLD } from './productConstants';

const getVariationLabel = (variation, index) => {
  const parts = [
    String(variation.content || '').trim(),
    String(variation.color || '').trim(),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  const sku = String(variation.sku || '').trim();
  if (sku) return sku;
  return `Option ${index + 1}`;
};

const getVariationPreviewLabel = (variation) => {
  const content = String(variation?.content || '').trim();
  const color = String(variation?.color || '').trim();
  const sku = String(variation?.sku || '').trim();
  const label = [content, color].filter(Boolean).join(' � ');
  return label || sku || 'Option';
};

const familyHasImage = (family) => {
  const variations = Array.isArray(family?.variations) ? family.variations : [];
  return variations.some((variation) => String(variation?.image || '').trim().length > 0);
};

const getFamilyPreviewVariation = (family, fallbackVariation = null) => {
  if (fallbackVariation) {
    const fallbackImage = String(fallbackVariation?.image || '').trim();
    if (fallbackImage) return fallbackVariation;
  }
  const variations = Array.isArray(family?.variations) ? family.variations : [];
  return (
    variations.find((variation) => String(variation?.image || '').trim().length > 0) ||
    fallbackVariation ||
    variations[0] ||
    null
  );
};

const getFirstAvailableVariation = (family) => {
  const variations = Array.isArray(family?.variations) ? family.variations : [];
  return variations.find((variation) => Number(variation?.stock || 0) > 0) || variations[0] || null;
};

const getFamilyCardState = (family, selectedVariation, cartQtyById = {}) => {
  const resolvedVariation = selectedVariation || getFirstAvailableVariation(family);
  if (!family || !resolvedVariation) {
    return {
      selectedVariation: null,
      previewVariation: null,
      hasMultipleVariations: false,
      optionCount: 0,
      familyInStock: false,
      familyLowStock: false,
      selectedStock: 0,
      selectedQty: 0,
      familyCartQty: 0,
      selectedLabel: '',
      previewLabels: [],
      priceValue: 0,
      mrpValue: 0,
      hasDiscount: false,
      discountPercent: 0,
      savingsValue: 0,
      showFromPrice: false,
      minPrice: 0,
      stockTone: 'out-of-stock',
      stockText: 'Out of stock',
      stockHint: 'Request item',
      metaLine: '',
      uomLabel: 'pcs',
      stockActionLabel: 'Request',
    };
  }

  const variations = Array.isArray(family.variations) ? family.variations : [];
  const hasMultipleVariations = variations.length > 1;
  const previewVariation = getFamilyPreviewVariation(family, resolvedVariation);
  const familyInStock = variations.some((variation) => Number(variation.stock || 0) > 0);
  const familyLowStock =
    Number(family?.totalStock || 0) > 0 && Number(family.totalStock || 0) <= LOW_STOCK_THRESHOLD;
  const familyCartQty = variations.reduce(
    (sum, variation) => sum + Number(cartQtyById[variation.id] || 0),
    0
  );
  const selectedQty = Number(cartQtyById[resolvedVariation.id] || 0);
  const selectedStock = Number(resolvedVariation.stock || 0);
  const selectedLowStock = selectedStock > 0 && selectedStock <= LOW_STOCK_THRESHOLD;
  const inStockOptionCount = variations.filter(
    (variation) => Number(variation.stock || 0) > 0
  ).length;
  const uniqueUoms = [
    ...new Set(
      variations.map((variation) => String(variation.uom || 'pcs').trim()).filter(Boolean)
    ),
  ];
  const uomLabel =
    uniqueUoms.length === 1 ? uniqueUoms[0] : String(resolvedVariation.uom || 'pcs').trim();
  const previewLabels = [
    ...new Set(
      variations
        .slice(0, 3)
        .map((variation) => getVariationPreviewLabel(variation))
        .filter(Boolean)
    ),
  ];
  const priceValue = Number(resolvedVariation.price || 0);
  const mrpValue = Math.max(priceValue, Number(resolvedVariation.mrp || 0));
  const hasDiscount = mrpValue > priceValue;
  const savingsValue = hasDiscount ? mrpValue - priceValue : 0;
  const discountPercent =
    hasDiscount && mrpValue > 0 ? Math.round((savingsValue / mrpValue) * 100) : 0;
  const minPrice = Number(family?.minPrice || priceValue || 0);
  const showFromPrice = hasMultipleVariations && minPrice > 0 && minPrice < priceValue;

  let stockTone = 'out-of-stock';
  let stockText = 'Out of stock';
  let stockHint = 'Request item';
  if (selectedStock > 0) {
    stockTone = selectedLowStock ? 'special-order' : 'in-stock';
    stockText = selectedLowStock ? 'Low stock' : 'Ready';
    stockHint = hasMultipleVariations
      ? `${inStockOptionCount || 1} option${inStockOptionCount === 1 ? '' : 's'} ready`
      : 'Ready to add';
  } else if (familyInStock && hasMultipleVariations) {
    stockTone = 'in-stock';
    stockText = 'Other options ready';
    stockHint = 'Open options';
  }

  return {
    selectedVariation: resolvedVariation,
    previewVariation,
    hasMultipleVariations,
    optionCount: variations.length,
    familyInStock,
    familyLowStock,
    selectedStock,
    selectedQty,
    familyCartQty,
    selectedLabel: getVariationPreviewLabel(resolvedVariation),
    previewLabels,
    priceValue,
    mrpValue,
    hasDiscount,
    discountPercent,
    savingsValue,
    showFromPrice,
    minPrice,
    stockTone,
    stockText,
    stockHint,
    metaLine: String(family.brand || family.category || '').trim(),
    uomLabel: uomLabel || 'pcs',
    stockActionLabel: selectedStock === 0 ? 'Request' : 'Add',
  };
};

export {
  getVariationLabel,
  getVariationPreviewLabel,
  familyHasImage,
  getFamilyPreviewVariation,
  getFirstAvailableVariation,
  getFamilyCardState,
};
