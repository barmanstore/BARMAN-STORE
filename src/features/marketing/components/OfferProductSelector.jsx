import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ProductSearchCombobox from '../../../shared/components/product-search/ProductSearchCombobox';
import useProductSearchCombobox from '../../../shared/hooks/useProductSearchCombobox';
import { productsApi } from '../../../shared/services/api';

const normalizeSuggestionRows = (result) => {
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result)) return result;
  return [];
};

const buildProductMeta = (product = {}) => [
  product?.brand ? String(product.brand).trim() : '',
  product?.category ? String(product.category).trim() : '',
  product?.size ? String(product.size).trim() : '',
  Number(product?.id || 0) > 0 ? `ID ${product.id}` : '',
].filter(Boolean).join(' | ');

function OfferProductSelector({
  inputId,
  value = null,
  onChange,
  placeholder = 'Search by product name',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const searchProducts = useCallback(async (rawQuery, options = {}) => {
    const result = await productsApi.suggest(
      { q: rawQuery, limit: Number(options?.limit || 8) || 8 },
      options?.signal ? { signal: options.signal } : {}
    );
    return normalizeSuggestionRows(result);
  }, []);

  const localProducts = useMemo(() => (
    selectedProduct && Number(selectedProduct?.id || 0) > 0 ? [selectedProduct] : []
  ), [selectedProduct]);

  const {
    searchResults,
    searchLoading,
    activeIndex,
    setActiveIndex,
    setHasExplicitChoice,
    resolveHighlightedProduct,
    clearSearchState,
  } = useProductSearchCombobox({
    query,
    selectedProductId: value,
    localProducts,
    searchProducts,
    suggestionLimit: 8,
    minChars: 2,
    debounceMs: 120,
  });

  useEffect(() => {
    let isActive = true;

    if (!value) {
      setSelectedProduct(null);
      return () => {
        isActive = false;
      };
    }

    if (Number(selectedProduct?.id || 0) === Number(value || 0)) {
      return () => {
        isActive = false;
      };
    }

    const loadProduct = async () => {
      try {
        const product = await productsApi.getById(value);
        if (!isActive) return;
        const normalizedProduct = product && typeof product === 'object'
          ? product
          : { id: value, name: `Product #${value}` };
        setSelectedProduct(normalizedProduct);
        setQuery(String(normalizedProduct?.name || `Product #${value}`));
      } catch (_) {
        if (!isActive) return;
        const fallbackProduct = { id: value, name: `Product #${value}` };
        setSelectedProduct(fallbackProduct);
        setQuery(fallbackProduct.name);
      }
    };

    loadProduct();

    return () => {
      isActive = false;
    };
  }, [selectedProduct?.id, value]);

  const selectProduct = useCallback((product) => {
    const nextProductId = Number(product?.id || 0) || null;
    setSelectedProduct(product || null);
    setQuery(String(product?.name || ''));
    setHasExplicitChoice(true);
    if (typeof onChange === 'function') {
      onChange(nextProductId, product || null);
    }
  }, [onChange, setHasExplicitChoice]);

  const handleQueryChange = useCallback((nextValue) => {
    setQuery(nextValue);
    if (Number(value || 0) > 0) {
      setSelectedProduct(null);
      setHasExplicitChoice(false);
      if (typeof onChange === 'function') {
        onChange(null, null);
      }
    }
  }, [onChange, setHasExplicitChoice, value]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(searchResults.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Escape') {
      clearSearchState();
      return;
    }

    if ((event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) && searchResults.length > 0) {
      const product = resolveHighlightedProduct(query, searchResults);
      if (!product) return;
      event.preventDefault();
      selectProduct(product);
    }
  }, [clearSearchState, query, resolveHighlightedProduct, searchResults, selectProduct, setActiveIndex]);

  const highlightedProduct = useMemo(() => (
    searchResults[activeIndex] || searchResults[0] || null
  ), [activeIndex, searchResults]);

  const hintContent = selectedProduct
    ? <>Selected product ID <strong>{selectedProduct.id}</strong>. Type again to replace it.</>
    : highlightedProduct
      ? <>Top match: <strong>{highlightedProduct.name}</strong>. Press `Tab` or `Enter` to select it.</>
      : <>Search by product name. The matching product ID is filled automatically.</>;

  const resultsSummaryText = searchResults.length > 0
    ? `${searchResults.length} matching product${searchResults.length === 1 ? '' : 's'}`
    : '';

  const handleClear = useCallback(() => {
    setSelectedProduct(null);
    setQuery('');
    setHasExplicitChoice(false);
    clearSearchState();
    if (typeof onChange === 'function') {
      onChange(null, null);
    }
  }, [clearSearchState, onChange, setHasExplicitChoice]);

  return (
    <div className="offer-product-selector">
      <ProductSearchCombobox
        inputId={inputId}
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        loading={searchLoading}
        results={searchResults}
        activeIndex={activeIndex}
        selectedItem={selectedProduct}
        hintContent={hintContent}
        resultsSummaryText={resultsSummaryText}
        noResultsText="No matching product found."
        getOptionKey={(product) => String(product?.id || '')}
        getOptionPrimaryText={(product) => product?.name || 'Product'}
        getOptionSecondaryText={(product) => buildProductMeta(product)}
        onSelect={selectProduct}
        onOptionHover={setActiveIndex}
      />

      {selectedProduct ? (
        <div className="offer-product-selection">
          <div className="offer-product-selection-copy">
            <strong>{selectedProduct?.name || `Product #${selectedProduct?.id || ''}`}</strong>
            <span>{buildProductMeta(selectedProduct)}</span>
          </div>
          <button
            type="button"
            className="billing-secondary-btn offer-product-clear-btn"
            onClick={handleClear}
            disabled={disabled}
          >
            <X size={14} />
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(OfferProductSelector);
