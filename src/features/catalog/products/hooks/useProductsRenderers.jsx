import { useCallback } from 'react';
import { resolveMediaUrl } from '../api/index.js';
import ProductCard from '../../../../shared/components/product/ProductCard';
import BrandFilterVisual from '../components/BrandFilterVisual';
import ProductDetailView from '../components/ProductDetailView';
import SafeProductImage from '../components/SafeProductImage';
import { getDefaultCategoryIcon } from '../utils/productHelpers.js';

const resolveUnitPriceValue = (variation) => {
  const candidates = [
    variation?.unit_price,
    variation?.unitPrice,
    variation?.price_per_unit,
    variation?.pricePerUnit,
    variation?.price_per_uom,
    variation?.pricePerUom
  ];
  const value = candidates.find((candidate) => Number(candidate || 0) > 0);
  return Number(value || 0);
};

function useProductsRenderers({
  isMobile,
  activeDesktopFamilyId,
  visibleFamilyIndexById,
  eagerImageBudget,
  getSelectedVariation,
  getFamilyCardState,
  cartQtyById,
  openFamilyDetails,
  addToCart,
  decreaseFromCart,
  handleSelectVariation,
  buttonStatus,
  swipeAddedFamilyId,
  quickTileDidSwipeRef,
  handleQuickTileTouchStart,
  handleQuickTileTouchEnd,
  formatCurrency,
  LOW_STOCK_THRESHOLD,
}) {
  const renderFamilyCard = useCallback((family) => {
    const selectedVariation = getSelectedVariation(family);
    const isActiveDesktop = !isMobile && activeDesktopFamilyId === family.id;
    const animationIndex = Number(visibleFamilyIndexById[family.id] || 0);
    const shouldPrioritizeImage = animationIndex < eagerImageBudget;
    const cardState = getFamilyCardState(family, selectedVariation, cartQtyById);
    if (!cardState.selectedVariation) return null;

    return (
      <ProductCard
        key={family.id}
        family={family}
        cardState={cardState}
        variant="default"
        animationDelay={`${animationIndex * 0.04}s`}
        onOpenDetails={() => openFamilyDetails(family.id)}
        onAdd={addToCart}
        onDecrease={decreaseFromCart}
        showMetaLine={!isMobile}
        imageLoading={shouldPrioritizeImage ? 'eager' : 'lazy'}
        imageFetchPriority={shouldPrioritizeImage ? 'high' : 'low'}
        ImageComponent={SafeProductImage}
        detailContent={isActiveDesktop ? (
          <ProductDetailView
            family={family}
            selectedVariationId={cardState.selectedVariation.id}
            onSelectVariation={handleSelectVariation}
            onIncreaseQty={addToCart}
            onDecreaseQty={decreaseFromCart}
            cartQtyById={cartQtyById}
            buttonStatus={buttonStatus}
            showImage={false}
          />
        ) : null}
      />
    );
  }, [
    getSelectedVariation,
    isMobile,
    activeDesktopFamilyId,
    visibleFamilyIndexById,
    eagerImageBudget,
    getFamilyCardState,
    cartQtyById,
    openFamilyDetails,
    addToCart,
    decreaseFromCart,
    handleSelectVariation,
    buttonStatus,
  ]);

  const renderQuickAddTile = useCallback((family) => {
    const selectedVariation = getSelectedVariation(family);
    const cardState = getFamilyCardState(family, selectedVariation, cartQtyById);
    const isSwipeAdded = swipeAddedFamilyId === family.id;
    const isButtonAdded = buttonStatus[cardState.selectedVariation?.id] === 'added';
    const isAddedState = isSwipeAdded || isButtonAdded;
    if (!cardState.selectedVariation) return null;

    return (
      <ProductCard
        key={family.id}
        family={family}
        cardState={cardState}
        variant="compact"
        isAddedState={isAddedState}
        onTouchStart={(event) => handleQuickTileTouchStart(family, event)}
        onTouchEnd={(event) => handleQuickTileTouchEnd(family, event)}
        onOpenDetails={() => {
          if (quickTileDidSwipeRef.current[family.id]) {
            quickTileDidSwipeRef.current[family.id] = false;
            return;
          }
          openFamilyDetails(family.id);
        }}
        onAdd={addToCart}
        onDecrease={decreaseFromCart}
        showMetaLine={false}
        showSwipeHint
        imageLoading="lazy"
        imageFetchPriority="low"
        ImageComponent={SafeProductImage}
      />
    );
  }, [
    getSelectedVariation,
    getFamilyCardState,
    cartQtyById,
    swipeAddedFamilyId,
    buttonStatus,
    handleQuickTileTouchStart,
    handleQuickTileTouchEnd,
    quickTileDidSwipeRef,
    openFamilyDetails,
    addToCart,
    decreaseFromCart,
  ]);

  const renderMobileProductCard = useCallback((family, { prioritizeImage = false } = {}) => {
    const selectedVariation = getSelectedVariation(family);
    const cardState = getFamilyCardState(family, selectedVariation, cartQtyById);
    if (!cardState.selectedVariation) return null;
    const unitPriceValue = resolveUnitPriceValue(cardState.selectedVariation);
    const unitPriceLabel = unitPriceValue > 0
      ? `${formatCurrency(unitPriceValue)} / ${cardState.uomLabel || 'unit'}`
      : '';
    const lowStockLabel = cardState.selectedStock > 0 && cardState.selectedStock <= LOW_STOCK_THRESHOLD
      ? `Only ${cardState.selectedStock} left`
      : '';
    const metaItems = [unitPriceLabel, lowStockLabel].filter(Boolean);
    return (
      <ProductCard
        key={family.id}
        family={family}
        cardState={cardState}
        variant="compact"
        onOpenDetails={() => openFamilyDetails(family.id)}
        onAdd={addToCart}
        onDecrease={decreaseFromCart}
        showMetaLine
        imageLoading={prioritizeImage ? 'eager' : 'lazy'}
        imageFetchPriority={prioritizeImage ? 'high' : 'low'}
        ImageComponent={SafeProductImage}
        detailContent={metaItems.length > 0 ? (
          <div className="mobile-card-meta">
            {metaItems.map((item) => (
              <span key={`${family.id}-${item}`} className="mobile-card-meta-item">{item}</span>
            ))}
          </div>
        ) : null}
      />
    );
  }, [
    getSelectedVariation,
    getFamilyCardState,
    cartQtyById,
    formatCurrency,
    LOW_STOCK_THRESHOLD,
    openFamilyDetails,
    addToCart,
    decreaseFromCart,
  ]);

  const renderCategoryChipLabel = useCallback((category, mode = 'category') => {
    if (mode === 'brand') {
      return <BrandFilterVisual logo={category?.image} name={category?.name} />;
    }

    const hasImage = String(category?.image || '').trim().length > 0;
    const hasIcon = String(category?.icon || '').trim().length > 0;
    const iconText = hasIcon ? String(category.icon || '').trim() : getDefaultCategoryIcon(category?.name);
    const width = Math.max(16, Math.round(Number(category?.image_width || 18)));
    const height = Math.max(16, Math.round(Number(category?.image_height || 18)));
    return (
      <>
        {hasImage ? (
          <img
            src={resolveMediaUrl(category.image)}
            alt=""
            className="category-chip-image"
            width={width}
            height={height}
            loading="lazy"
          />
        ) : (
          <span className="category-chip-icon">{iconText}</span>
        )}
        <span className="category-chip-label">{category.name}</span>
      </>
    );
  }, []);

  return {
    renderFamilyCard,
    renderQuickAddTile,
    renderMobileProductCard,
    renderCategoryChipLabel,
  };
}

export default useProductsRenderers;

