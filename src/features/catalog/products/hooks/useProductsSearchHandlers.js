import { useCallback, startTransition } from 'react';

function useProductsSearchHandlers({
  searchInputValue,
  setSearchInputValue,
  setSearchSuggestionsEnabled,
  setSearchSuggestions,
  setShowSearchSuggestions,
  setActiveSuggestionIndex,
  setAppliedSearchQuery,
  showSearchSuggestions,
  searchSuggestions,
  activeSuggestionIndex,
  SEARCH_SUGGESTIONS_MIN_CHARS,
  trackProductsEvent,
}) {
  const commitSearchQuery = useCallback(
    (value = searchInputValue) => {
      const nextValue = String(value || '')
        .trim()
        .slice(0, 80);
      setSearchInputValue(nextValue);
      setSearchSuggestionsEnabled(false);
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      setActiveSuggestionIndex(-1);
      startTransition(() => {
        setAppliedSearchQuery(nextValue);
      });
    },
    [
      searchInputValue,
      setSearchInputValue,
      setSearchSuggestionsEnabled,
      setSearchSuggestions,
      setShowSearchSuggestions,
      setActiveSuggestionIndex,
      setAppliedSearchQuery,
    ]
  );

  const selectSearchSuggestion = useCallback(
    (suggestion) => {
      const label = String(suggestion?.name || '').trim();
      if (!label) return;
      commitSearchQuery(label);
      trackProductsEvent(
        'products_search_suggestion_select',
        {
          suggestion_id: Number(suggestion?.id || 0),
          suggestion_name: label,
        },
        { throttleMs: 200, throttleKey: 'products_search_suggestion_select' }
      );
    },
    [commitSearchQuery, trackProductsEvent]
  );

  const clearSearchQuery = useCallback(() => {
    commitSearchQuery('');
  }, [commitSearchQuery]);

  const handleMobileSearchChange = useCallback(
    (event) => {
      const nextValue = String(event.target.value || '').slice(0, 80);
      const trimmedValue = nextValue.trim();
      setSearchInputValue(nextValue);
      if (!trimmedValue) {
        setSearchSuggestionsEnabled(false);
        setSearchSuggestions([]);
        setShowSearchSuggestions(false);
        setActiveSuggestionIndex(-1);
        startTransition(() => {
          setAppliedSearchQuery('');
        });
        return;
      }
      const shouldEnable = trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS;
      setSearchSuggestionsEnabled(shouldEnable);
      setShowSearchSuggestions(shouldEnable);
    },
    [
      SEARCH_SUGGESTIONS_MIN_CHARS,
      setActiveSuggestionIndex,
      setAppliedSearchQuery,
      setSearchInputValue,
      setSearchSuggestions,
      setSearchSuggestionsEnabled,
      setShowSearchSuggestions,
    ]
  );

  const handleMobileSearchFocus = useCallback(() => {
    const trimmedValue = String(searchInputValue || '').trim();
    const shouldEnable = trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS;
    setSearchSuggestionsEnabled(shouldEnable);
    if (shouldEnable && searchSuggestions.length > 0) setShowSearchSuggestions(true);
  }, [
    searchInputValue,
    searchSuggestions.length,
    SEARCH_SUGGESTIONS_MIN_CHARS,
    setSearchSuggestionsEnabled,
    setShowSearchSuggestions,
  ]);

  const handleMobileSearchKeyDown = useCallback(
    (event) => {
      if (!showSearchSuggestions || searchSuggestions.length === 0) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitSearchQuery();
        } else if (event.key === 'Escape') {
          setShowSearchSuggestions(false);
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => {
          const next = prev + 1;
          return next >= searchSuggestions.length ? 0 : next;
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => {
          if (prev <= 0) return searchSuggestions.length - 1;
          return prev - 1;
        });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
          selectSearchSuggestion(searchSuggestions[activeSuggestionIndex]);
        } else {
          commitSearchQuery();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setShowSearchSuggestions(false);
        setActiveSuggestionIndex(-1);
      }
    },
    [
      activeSuggestionIndex,
      commitSearchQuery,
      searchSuggestions,
      selectSearchSuggestion,
      setActiveSuggestionIndex,
      setShowSearchSuggestions,
      showSearchSuggestions,
    ]
  );

  const handleDesktopSearchChange = useCallback(
    (event) => {
      const nextValue = String(event.target.value || '').slice(0, 80);
      const trimmedValue = nextValue.trim();
      setSearchInputValue(nextValue);
      if (!trimmedValue) {
        setSearchSuggestionsEnabled(false);
        setSearchSuggestions([]);
        setShowSearchSuggestions(false);
        setActiveSuggestionIndex(-1);
        startTransition(() => {
          setAppliedSearchQuery('');
        });
        return;
      }
      const shouldEnable = trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS;
      setSearchSuggestionsEnabled(shouldEnable);
      setShowSearchSuggestions(shouldEnable);
    },
    [
      SEARCH_SUGGESTIONS_MIN_CHARS,
      setActiveSuggestionIndex,
      setAppliedSearchQuery,
      setSearchInputValue,
      setSearchSuggestions,
      setSearchSuggestionsEnabled,
      setShowSearchSuggestions,
    ]
  );

  const handleDesktopSearchFocus = useCallback(() => {
    const trimmedValue = String(searchInputValue || '').trim();
    const shouldEnable = trimmedValue.length >= SEARCH_SUGGESTIONS_MIN_CHARS;
    setSearchSuggestionsEnabled(shouldEnable);
    if (shouldEnable && searchSuggestions.length > 0) setShowSearchSuggestions(true);
  }, [
    searchInputValue,
    searchSuggestions.length,
    SEARCH_SUGGESTIONS_MIN_CHARS,
    setSearchSuggestionsEnabled,
    setShowSearchSuggestions,
  ]);

  const handleDesktopSearchKeyDown = useCallback(
    (event) => {
      if (!showSearchSuggestions || searchSuggestions.length === 0) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitSearchQuery();
        } else if (event.key === 'Escape') {
          setShowSearchSuggestions(false);
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => {
          const next = prev + 1;
          return next >= searchSuggestions.length ? 0 : next;
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => {
          if (prev <= 0) return searchSuggestions.length - 1;
          return prev - 1;
        });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
          selectSearchSuggestion(searchSuggestions[activeSuggestionIndex]);
        } else {
          commitSearchQuery();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setShowSearchSuggestions(false);
        setActiveSuggestionIndex(-1);
      }
    },
    [
      activeSuggestionIndex,
      commitSearchQuery,
      searchSuggestions,
      selectSearchSuggestion,
      setActiveSuggestionIndex,
      setShowSearchSuggestions,
      showSearchSuggestions,
    ]
  );

  return {
    commitSearchQuery,
    selectSearchSuggestion,
    clearSearchQuery,
    handleMobileSearchChange,
    handleMobileSearchFocus,
    handleMobileSearchKeyDown,
    handleDesktopSearchChange,
    handleDesktopSearchFocus,
    handleDesktopSearchKeyDown,
  };
}

export default useProductsSearchHandlers;
