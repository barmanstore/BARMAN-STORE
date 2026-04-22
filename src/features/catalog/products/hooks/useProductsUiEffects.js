import { useEffect } from 'react';

const useProductsUiEffects = ({
  notice,
  setNotice,
  showSearchSuggestions,
  searchInputRef,
  setSearchSuggestionsEnabled,
  setShowSearchSuggestions,
  setActiveSuggestionIndex,
  swipeAddedFamilyId,
  setSwipeAddedFamilyId,
}) => {
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!showSearchSuggestions) return;
      const root = searchInputRef.current;
      if (!root) return;
      if (root.contains(event.target)) return;
      setSearchSuggestionsEnabled(false);
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [
    showSearchSuggestions,
    searchInputRef,
    setSearchSuggestionsEnabled,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
  ]);

  useEffect(() => {
    if (!swipeAddedFamilyId) return undefined;
    const timer = setTimeout(() => setSwipeAddedFamilyId(''), 850);
    return () => clearTimeout(timer);
  }, [swipeAddedFamilyId, setSwipeAddedFamilyId]);
};

export default useProductsUiEffects;
