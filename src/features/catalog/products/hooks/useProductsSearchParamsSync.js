import { useEffect } from 'react';

const useProductsSearchParamsSync = ({
  searchParams,
  setSearchParams,
  selectedCategory,
  appliedSearchQuery,
  sortBy,
  groupBy,
  inStockOnly,
  setSelectedCategory,
  setSearchInputValue,
  setAppliedSearchQuery,
  setSortBy,
  setGroupBy,
  setInStockOnly,
  setSearchSuggestionsEnabled,
  setShowSearchSuggestions,
  setActiveSuggestionIndex,
  normalizeSortBy,
  GROUP_BY_OPTIONS,
  DEFAULT_SORT_BY,
}) => {
  useEffect(() => {
    const nextCategory = searchParams.get('category') || 'all';
    const nextQuery = String(searchParams.get('q') || '');
    const nextSortBy = normalizeSortBy(searchParams.get('sort'));
    const nextGroupBy = searchParams.get('group') === GROUP_BY_OPTIONS.brand
      ? GROUP_BY_OPTIONS.brand
      : GROUP_BY_OPTIONS.category;
    const nextInStockOnly = searchParams.get('stock') === '1';

    setSelectedCategory((prev) => (prev === nextCategory ? prev : nextCategory));
    setSearchInputValue((prev) => (prev === nextQuery ? prev : nextQuery));
    setAppliedSearchQuery((prev) => (prev === nextQuery ? prev : nextQuery));
    setSortBy((prev) => (prev === nextSortBy ? prev : nextSortBy));
    setGroupBy((prev) => (prev === nextGroupBy ? prev : nextGroupBy));
    setInStockOnly((prev) => (prev === nextInStockOnly ? prev : nextInStockOnly));
    setSearchSuggestionsEnabled(false);
    setShowSearchSuggestions(false);
    setActiveSuggestionIndex(-1);
  }, [
    searchParams,
    normalizeSortBy,
    GROUP_BY_OPTIONS,
    setSelectedCategory,
    setSearchInputValue,
    setAppliedSearchQuery,
    setSortBy,
    setGroupBy,
    setInStockOnly,
    setSearchSuggestionsEnabled,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const previous = params.toString();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    else params.delete('category');
    if (appliedSearchQuery) params.set('q', appliedSearchQuery);
    else params.delete('q');
    if (sortBy !== DEFAULT_SORT_BY) params.set('sort', sortBy);
    else params.delete('sort');
    if (groupBy !== GROUP_BY_OPTIONS.category) params.set('group', groupBy);
    else params.delete('group');
    if (inStockOnly) params.set('stock', '1');
    else params.delete('stock');
    if (params.toString() !== previous) {
      setSearchParams(params, { replace: true, preventScrollReset: true });
    }
  }, [
    selectedCategory,
    appliedSearchQuery,
    sortBy,
    groupBy,
    inStockOnly,
    searchParams,
    setSearchParams,
    DEFAULT_SORT_BY,
    GROUP_BY_OPTIONS,
  ]);
};

export default useProductsSearchParamsSync;
