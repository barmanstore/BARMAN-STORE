import { useCallback, useMemo } from 'react';
import Fuse from 'fuse.js';

const buildSuggestionKey = ({ id, name, brand, normalizeText }) => {
  if (id) return `id:${id}`;
  return `${normalizeText(name)}|${normalizeText(brand)}`;
};

function useProductsLocalSuggestions({
  products,
  normalizeText,
  SEARCH_SUGGESTIONS_MIN_CHARS,
  SEARCH_SUGGESTIONS_MAX_ITEMS,
}) {
  const suggestionFuse = useMemo(() => {
    if (!products.length) return null;
    return new Fuse(products, {
      keys: ['name', 'brand', 'category', 'subcategory', 'content', 'uom'],
      threshold: 0.3,
      includeScore: false,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [products]);

  const getLocalSuggestions = useCallback((query) => {
    const trimmedQuery = String(query || '').trim();
    if (!suggestionFuse || trimmedQuery.length < SEARCH_SUGGESTIONS_MIN_CHARS) return [];
    const results = suggestionFuse.search(trimmedQuery, {
      limit: SEARCH_SUGGESTIONS_MAX_ITEMS * 2,
    });
    const items = [];
    const seen = new Set();
    results.forEach((result) => {
      if (!result?.item || items.length >= SEARCH_SUGGESTIONS_MAX_ITEMS) return;
      const item = result.item;
      const id = Number(item.id || 0);
      const name = String(item.name || '').trim();
      const brand = String(item.brand || '').trim();
      const key = buildSuggestionKey({ id, name, brand, normalizeText });
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id,
        name: name || 'Product',
        brand,
        size: String(item.content || item.uom || '').trim(),
        price: Number(item.price || 0),
        mrp: Number(item.mrp || 0),
        image: String(item.image || '').trim(),
        category: String(item.category || '').trim(),
        stock: Number(item.stock || 0),
      });
    });
    return items;
  }, [suggestionFuse, SEARCH_SUGGESTIONS_MIN_CHARS, SEARCH_SUGGESTIONS_MAX_ITEMS, normalizeText]);

  return { getLocalSuggestions };
}

export default useProductsLocalSuggestions;
