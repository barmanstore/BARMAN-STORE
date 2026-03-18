import { useEffect } from 'react';
import { productService } from '../../../../shared/services/productService';

function useProductSearchSuggestions({
  searchInputValue,
  searchSuggestionsEnabled,
  getLocalSuggestions,
  normalizeText,
  SEARCH_SUGGESTIONS_MIN_CHARS,
  SEARCH_SUGGESTIONS_CACHE_TTL_MS,
  SEARCH_SUGGESTIONS_MAX_ITEMS,
  searchSuggestionsCacheRef,
  searchSuggestionsRequestRef,
  searchSuggestionsAbortRef,
  setSearchSuggestions,
  setShowSearchSuggestions,
  setActiveSuggestionIndex,
  setIsLoadingSuggestions,
  showSearchSuggestions,
  activeSuggestionIndex,
  searchSuggestionsLength,
}) {
  useEffect(() => {
    const query = String(searchInputValue || '').trim();
    if (searchSuggestionsAbortRef.current) {
      searchSuggestionsAbortRef.current.abort();
      searchSuggestionsAbortRef.current = null;
    }

    if (!searchSuggestionsEnabled) {
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
      setIsLoadingSuggestions(false);
      return undefined;
    }

    if (query.length < SEARCH_SUGGESTIONS_MIN_CHARS) {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
      setIsLoadingSuggestions(false);
      return undefined;
    }

    const localSuggestions = getLocalSuggestions(query);
    const cacheKey = normalizeText(query);
    const cacheRecord = searchSuggestionsCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cacheRecord && (now - Number(cacheRecord.at || 0)) < SEARCH_SUGGESTIONS_CACHE_TTL_MS) {
      setSearchSuggestions(cacheRecord.items);
      setShowSearchSuggestions(cacheRecord.items.length > 0);
      setActiveSuggestionIndex(-1);
      setIsLoadingSuggestions(false);
      return undefined;
    }

    const requestId = searchSuggestionsRequestRef.current + 1;
    searchSuggestionsRequestRef.current = requestId;
    setIsLoadingSuggestions(true);
    if (localSuggestions.length > 0) {
      setSearchSuggestions(localSuggestions);
      setShowSearchSuggestions(true);
      setActiveSuggestionIndex(-1);
    }
    const controller = new AbortController();
    searchSuggestionsAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const payload = await productService.suggest({
          q: query,
          limit: SEARCH_SUGGESTIONS_MAX_ITEMS
        }, { signal: controller.signal });
        if (requestId !== searchSuggestionsRequestRef.current) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const resolvedItems = items.length > 0 ? items : localSuggestions;
        searchSuggestionsCacheRef.current.set(cacheKey, { items: resolvedItems, at: Date.now() });
        setSearchSuggestions(resolvedItems);
        setShowSearchSuggestions(resolvedItems.length > 0);
        setActiveSuggestionIndex(-1);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (requestId !== searchSuggestionsRequestRef.current) return;
        if (localSuggestions.length > 0) {
          setSearchSuggestions(localSuggestions);
          setShowSearchSuggestions(true);
        } else {
          setSearchSuggestions([]);
          setShowSearchSuggestions(false);
        }
      } finally {
        if (requestId === searchSuggestionsRequestRef.current) {
          setIsLoadingSuggestions(false);
        }
        if (searchSuggestionsAbortRef.current === controller) {
          searchSuggestionsAbortRef.current = null;
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (searchSuggestionsAbortRef.current === controller) {
        searchSuggestionsAbortRef.current = null;
      }
    };
  }, [
    searchInputValue,
    searchSuggestionsEnabled,
    getLocalSuggestions,
    normalizeText,
    SEARCH_SUGGESTIONS_MIN_CHARS,
    SEARCH_SUGGESTIONS_CACHE_TTL_MS,
    SEARCH_SUGGESTIONS_MAX_ITEMS,
    searchSuggestionsCacheRef,
    searchSuggestionsRequestRef,
    searchSuggestionsAbortRef,
    setSearchSuggestions,
    setShowSearchSuggestions,
    setActiveSuggestionIndex,
    setIsLoadingSuggestions,
  ]);

  useEffect(() => {
    if (!showSearchSuggestions || activeSuggestionIndex < 0) return;
    const activeNode = document.getElementById(`products-search-suggestion-${activeSuggestionIndex}`);
    if (!activeNode || typeof activeNode.scrollIntoView !== 'function') return;
    activeNode.scrollIntoView({ block: 'nearest' });
  }, [showSearchSuggestions, activeSuggestionIndex, searchSuggestionsLength]);
}

export default useProductSearchSuggestions;

