import { useCallback, useEffect } from 'react';

export default function useProductsMobileActions({
  groupBy,
  setGroupBy,
  setSelectedCategory,
  setSelectedSubcategory,
  isMobile,
  locationHash,
  handleAddCombo,
  GROUP_BY_OPTIONS,
}) {
  const handleMobileCategorySelect = useCallback(
    (categoryName) => {
      const next = String(categoryName || '').trim() || 'all';
      setSelectedCategory(next);
      setSelectedSubcategory('all');
      if (groupBy !== GROUP_BY_OPTIONS.category) {
        setGroupBy(GROUP_BY_OPTIONS.category);
      }
    },
    [groupBy, setSelectedCategory, setSelectedSubcategory, setGroupBy, GROUP_BY_OPTIONS]
  );

  const handleMobileSubcategorySelect = useCallback(
    (subcategoryName) => {
      const next = String(subcategoryName || '').trim() || 'all';
      setSelectedSubcategory(next);
    },
    [setSelectedSubcategory]
  );

  const handleMobileOfferAction = useCallback(
    (offer) => {
      if (!offer) return;
      if (offer.combo) {
        handleAddCombo(offer.combo);
        return;
      }
      if (offer.category) {
        handleMobileCategorySelect(offer.category);
        return;
      }
      if (typeof document !== 'undefined') {
        const target = document.getElementById('mobile-popular-section');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [handleMobileCategorySelect, handleAddCombo]
  );

  const handleMobileScrollTo = useCallback((targetId) => {
    if (typeof document === 'undefined') return;
    const node = document.getElementById(targetId);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    if (locationHash === '#top-picks') {
      handleMobileScrollTo('mobile-popular-section');
    }
  }, [isMobile, locationHash, handleMobileScrollTo]);

  return {
    handleMobileCategorySelect,
    handleMobileSubcategorySelect,
    handleMobileOfferAction,
    handleMobileScrollTo,
  };
}
