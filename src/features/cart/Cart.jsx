import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';
import { productRecommendationsApi, productsApi } from '../../services/api';
import { getProductImageSrc } from '../../utils/productImage';
import CartView from './components/CartView';
import { formatCurrencyColored } from './utils/cartFormatters';
import { parseQuantityText, rankManualMatches, QUICK_QTY_OPTIONS } from './utils/cartSearchUtils';
import './Cart.css';


function Cart({ cartCount, setCartCount }) {
  const [cart, setCart] = useState([]);
  const [recommendationNames, setRecommendationNames] = useState([]);
  const [manualDraft, setManualDraft] = useState({ name: '', qtyText: '1' });
  const [manualError, setManualError] = useState('');
  const [manualMatches, setManualMatches] = useState([]);
  const [manualMatchCursor, setManualMatchCursor] = useState(-1);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [manualSearchError, setManualSearchError] = useState('');
  const navigate = useNavigate();

  const getCartItemKey = (item) => String(item?.id ?? item?.product_id ?? '');
  const isManualItem = (item) => {
    const rawId = String(item?.id ?? '').trim().toLowerCase();
    return Number(item?.is_manual || 0) === 1
      || String(item?.item_type || '').trim().toLowerCase() === 'manual'
      || rawId.startsWith('manual:')
      || (!item?.product_id && !item?.id);
  };
  const getItemQuantityLabel = (item) => {
    const customLabel = String(item?.quantity_label || item?.qty_text || '').trim();
    if (customLabel) return customLabel;
    const quantity = Number(item?.quantity || 1);
    return Number.isFinite(quantity) && quantity > 0 ? String(quantity) : '1';
  };
  const isUnknownPriceItem = (item) => isManualItem(item) && (
    Number(item?.price_unknown || 0) === 1
    || Number(item?.price || 0) <= 0
  );

  useEffect(() => {
    loadCart();
    loadRecommendationNames();
  }, []);

  useEffect(() => {
    const query = String(manualDraft.name || '').trim();
    if (query.length < 2) {
      setManualMatches([]);
      setManualMatchCursor(-1);
      setManualSearchError('');
      setManualSearchLoading(false);
      return;
    }

    let cancelled = false;
    setManualSearchLoading(true);
    setManualSearchError('');
    const timer = setTimeout(async () => {
      try {
        const suggestResult = await productsApi.suggest({ q: query, limit: 8 });
        const rawProducts = Array.isArray(suggestResult?.items)
          ? suggestResult.items
          : Array.isArray(suggestResult)
            ? suggestResult
            : [];

        if (cancelled) return;

        const ranked = rankManualMatches(rawProducts, query);
        const list = ranked.length
          ? ranked
          : rawProducts
            .filter((product) => Number(product?.id || 0) > 0)
            .slice(0, 8);
        setManualMatches(list);
        setManualMatchCursor(list.length ? 0 : -1);
      } catch (_) {
        if (!cancelled) {
          setManualMatches([]);
          setManualMatchCursor(-1);
          setManualSearchError('Unable to search products right now.');
        }
      } finally {
        if (!cancelled) setManualSearchLoading(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [manualDraft.name]);

  const loadRecommendationNames = async () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (!storedUser?.id) {
        setRecommendationNames([]);
        return;
      }
      const rows = await productRecommendationsApi.getMine();
      const names = Array.from(new Set(
        (Array.isArray(rows) ? rows : [])
          .map((row) => String(row?.requested_name || '').trim())
          .filter(Boolean)
      ));
      setRecommendationNames(names);
    } catch (_) {
      setRecommendationNames([]);
    }
  };

  const loadCart = () => {
    const savedCart = localStorage.getItem('barman_cart');
    if (!savedCart) {
      setCart([]);
      setCartCount(0);
      return;
    }
    try {
      const parsed = JSON.parse(savedCart);
      const normalized = Array.isArray(parsed)
        ? parsed.map((item, index) => {
          const manual = Number(item?.is_manual || 0) === 1
            || String(item?.item_type || '').toLowerCase() === 'manual'
            || String(item?.id || '').toLowerCase().startsWith('manual:')
            || !Number(item?.id || item?.product_id || 0);
          const fallbackId = manual
            ? `manual:${index}:${String(item?.name || 'item').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'item'}`
            : Number(item?.id || item?.product_id || 0);
          const quantity = Math.max(1, Number(item?.quantity || 1));
          const quantityLabelRaw = String(item?.quantity_label || item?.qty_text || item?.quantity_text || '').trim();
          const quantityLabel = quantityLabelRaw || String(quantity);
          const price = Math.max(0, Number(item?.price || 0));
          const stock = manual ? null : Math.max(0, Number(item?.stock || 0));
          const outOfStockRequest = !manual && (
            Number(item?.out_of_stock_request || 0) === 1
            || Number(stock || 0) <= 0
            || Number(quantity || 0) > Number(stock || 0)
          );
          return {
            ...item,
            id: item?.id ?? fallbackId,
            product_id: manual ? null : Number(item?.product_id || item?.id || 0),
            name: String(item?.name || item?.product_name || 'Item').trim() || 'Item',
            item_type: manual ? 'manual' : 'catalog',
            is_manual: manual ? 1 : 0,
            quantity,
            quantity_label: quantityLabel,
            price,
            price_unknown: manual ? Number(item?.price_unknown || (price <= 0 ? 1 : 0)) : 0,
            stock,
            out_of_stock_request: outOfStockRequest ? 1 : 0,
            image: String(item?.image || item?.product_image || '').trim(),
          };
        })
        : [];
      setCart(normalized);
      setCartCount(normalized.reduce((sum, item) => sum + Math.max(1, Math.ceil(Number(item.quantity || 1))), 0));
    } catch (_) {
      setCart([]);
      setCartCount(0);
    }
  };

  const updateCart = (newCart) => {
    setCart(newCart);
    localStorage.setItem('barman_cart', JSON.stringify(newCart));
    setCartCount(newCart.reduce((sum, item) => sum + Math.max(1, Math.ceil(Number(item.quantity || 1))), 0));
  };

  const getMergeKey = (item) => {
    if (isManualItem(item)) {
      return `manual:${String(item?.name || '').trim().toLowerCase()}:${String(item?.quantity_label || '').trim().toLowerCase()}`;
    }
    return `catalog:${Number(item?.product_id || item?.id || 0)}:${String(item?.quantity_label || '').trim().toLowerCase()}`;
  };

  const addOrMergeItem = (itemToAdd) => {
    const mergeKey = getMergeKey(itemToAdd);
    const existingIndex = cart.findIndex((item) => getMergeKey(item) === mergeKey);
    if (existingIndex >= 0) {
      const nextCart = cart.map((item, index) => (
        index === existingIndex ? (() => {
          const nextQuantity = Number(item.quantity || 0) + Number(itemToAdd.quantity || 0);
          const stock = Math.max(0, Number(item.stock || 0));
          const manual = isManualItem(item);
          return {
            ...item,
            quantity: nextQuantity,
            out_of_stock_request: manual ? 0 : ((stock <= 0 || nextQuantity > stock) ? 1 : 0),
          };
        })() : item
      ));
      updateCart(nextCart);
      return;
    }
    updateCart([...cart, itemToAdd]);
  };

  const updateQuantity = (itemId, change) => {
    const targetKey = String(itemId);
    const newCart = cart.map((item) => {
      if (getCartItemKey(item) !== targetKey) return item;
      const manual = isManualItem(item);
      if (manual) return item;
      const nextQuantity = Math.max(1, Number(item.quantity || 1) + change);
      const stock = Math.max(0, Number(item.stock || 0));
      return {
        ...item,
        quantity: nextQuantity,
        quantity_label: String(nextQuantity),
        out_of_stock_request: stock <= 0 || nextQuantity > stock ? 1 : 0,
      };
    });
    updateCart(newCart);
  };

  const removeItem = (itemId) => {
    const targetKey = String(itemId);
    const newCart = cart.filter((item) => getCartItemKey(item) !== targetKey);
    updateCart(newCart);
  };

  const clearCart = () => {
    updateCart([]);
  };

  const getTotal = () => cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);

  const handleCheckout = () => {
    if (cart.length > 0) navigate('/checkout');
  };

  const addManualItem = (event) => {
    event.preventDefault();
    const name = String(manualDraft.name || '').trim();
    const qtyText = String(manualDraft.qtyText || '').trim();
    if (!name) {
      setManualError('Item name is required.');
      return;
    }
    if (!qtyText) {
      setManualError('Quantity text is required (example: 1kg, 2 pcs).');
      return;
    }
    const { quantity, quantityLabel } = parseQuantityText(qtyText);
    const manualItem = {
      id: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      product_id: null,
      name,
      category: 'Requested / Manual',
      image: '',
      price: 0,
      price_unknown: 1,
      quantity,
      quantity_label: quantityLabel,
      stock: null,
      item_type: 'manual',
      is_manual: 1,
    };
    setManualError('');
    addOrMergeItem(manualItem);
    setManualDraft((prev) => ({ ...prev, name: '' }));
    setManualMatches([]);
    setManualMatchCursor(-1);
  };

  const addMatchedProductToCart = (product) => {
    const productId = Number(product?.id || 0);
    if (!productId) return;
    const productName = String(product?.name || '').trim() || 'Item';
    const { quantity, quantityLabel } = parseQuantityText(manualDraft.qtyText);
    const stock = Math.max(0, Number(product?.stock || 0));
    const outOfStock = stock <= 0 || quantity > stock;
    const productItem = {
      id: productId,
      product_id: productId,
      name: productName,
      category: String(product?.category || 'Product').trim() || 'Product',
      image: String(product?.image || product?.image_path || '').trim(),
      price: Math.max(0, Number(product?.price || 0)),
      price_unknown: 0,
      quantity,
      quantity_label: quantityLabel,
      stock,
      item_type: 'catalog',
      is_manual: 0,
      out_of_stock_request: outOfStock ? 1 : 0,
    };
    setManualError('');
    addOrMergeItem(productItem);
    setManualDraft((prev) => ({ ...prev, name: '' }));
    setManualMatches([]);
    setManualMatchCursor(-1);
  };

  const handleManualNameKeyDown = (event) => {
    if (!manualMatches.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setManualMatchCursor((prev) => (prev + 1) % manualMatches.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setManualMatchCursor((prev) => (prev <= 0 ? manualMatches.length - 1 : prev - 1));
      return;
    }
    if (event.key === 'Enter' && manualMatchCursor >= 0 && manualMatchCursor < manualMatches.length) {
      event.preventDefault();
      addMatchedProductToCart(manualMatches[manualMatchCursor]);
    }
  };

  const renderManualEntryCard = () => (
    <form className="manual-entry-card" onSubmit={addManualItem}>
      <h3>Add Item Manually</h3>
      <p>Requested and manual items are allowed. Price is set later at billing.</p>
      {manualError ? <div className="manual-entry-error">{manualError}</div> : null}
      <label htmlFor="manual-cart-product-name">Product name</label>
      <input
        id="manual-cart-product-name"
        type="text"
        value={manualDraft.name}
        onChange={(e) => setManualDraft((prev) => ({ ...prev, name: e.target.value }))}
        onKeyDown={handleManualNameKeyDown}
        placeholder="Type product name"
        list="manual-cart-suggestions"
        autoCapitalize="words"
        autoComplete="off"
        spellCheck
        aria-label="Manual product name"
        required
      />
      <datalist id="manual-cart-suggestions">
        {recommendationNames.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="manual-entry-row">
        <label htmlFor="manual-cart-qty-text">Quantity</label>
        <input
          id="manual-cart-qty-text"
          type="text"
          value={manualDraft.qtyText}
          onChange={(e) => setManualDraft((prev) => ({ ...prev, qtyText: e.target.value }))}
          placeholder="Qty (example: 1kg or 2 pcs)"
          inputMode="text"
          autoComplete="off"
          aria-label="Manual quantity"
          required
        />
      </div>
      <div className="manual-qty-chips" role="group" aria-label="Quick quantity options">
        {QUICK_QTY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`manual-qty-chip ${String(manualDraft.qtyText || '').trim() === option ? 'active' : ''}`}
            onClick={() => setManualDraft((prev) => ({ ...prev, qtyText: option }))}
          >
            {option}
          </button>
        ))}
      </div>
      <button type="submit" className="manual-entry-btn">Add Custom Item</button>
      <div className="manual-search-meta">
        {manualSearchLoading ? <span>Searching matching products...</span> : null}
        {!manualSearchLoading && manualSearchError ? <span className="manual-search-error">{manualSearchError}</span> : null}
        {!manualSearchLoading && !manualSearchError && manualDraft.name.trim().length >= 2 && manualMatches.length === 0 ? (
          <span>No matching products found in inventory. Item will be added as a custom request.</span>
        ) : null}
      </div>
      {!manualSearchLoading && manualMatches.length > 0 && (
        <div className="manual-search-results">
          {manualMatches.map((product, index) => {
            const productId = Number(product?.id || 0);
            const outOfStock = Number(product?.stock || 0) <= 0;
            const imageSrc = getProductImageSrc(product);
            return (
              <div
                key={productId}
                className={`manual-search-item ${index === manualMatchCursor ? 'active' : ''}`}
              >
                <div className="manual-search-item-thumb">
                  <img src={imageSrc} alt={product.name} />
                </div>
                <div className="manual-search-item-meta">
                  <strong>{product.name}</strong>
                  <span>{product.category || 'Product'}</span>
                  <span>Price: {formatCurrency(Number(product.price || 0))}</span>
                  <span>{outOfStock ? 'Out of stock' : `Stock: ${Number(product.stock || 0)}`}</span>
                </div>
                <button
                  type="button"
                  className="manual-search-add-btn"
                  onClick={() => addMatchedProductToCart(product)}
                >
                  {outOfStock ? 'Request Product' : 'Add Product'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </form>
  );

  return (
    <CartView
      cart={cart}
      cartCount={cartCount}
      renderManualEntryCard={renderManualEntryCard}
      onContinueShopping={() => navigate('/products')}
      getCartItemKey={getCartItemKey}
      isManualItem={isManualItem}
      isUnknownPriceItem={isUnknownPriceItem}
      getItemQuantityLabel={getItemQuantityLabel}
      updateQuantity={updateQuantity}
      removeItem={removeItem}
      formatCurrencyColored={formatCurrencyColored}
      getTotal={getTotal}
      handleCheckout={handleCheckout}
      clearCart={clearCart}
    />
  );
}

export default Cart;
