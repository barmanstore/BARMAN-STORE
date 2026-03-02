import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';
import { productRecommendationsApi, productsApi } from '../services/api';
import './Cart.css';

const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

const parseQuantityText = (rawValue) => {
  const cleaned = String(rawValue || '').trim();
  if (!cleaned) return { quantity: 1, quantityLabel: '1' };
  const numberMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  const parsedQuantity = Number(numberMatch?.[1] || 0);
  return {
    quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
    quantityLabel: cleaned,
  };
};

const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

const getManualSearchScore = (product, query) => {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const name = normalizeSearchText(product?.name);
  const category = normalizeSearchText(product?.category);
  const brand = normalizeSearchText(product?.brand);
  const content = normalizeSearchText(product?.content);
  const color = normalizeSearchText(product?.color);
  const sku = normalizeSearchText(product?.sku);
  const barcode = normalizeSearchText(product?.barcode);
  const haystack = [name, category, brand, content, color, sku, barcode].join(' ');

  let score = 0;
  if (name === q) score += 300;
  else if (name.startsWith(q)) score += 220;
  else if (name.includes(q)) score += 150;

  if (category.startsWith(q)) score += 80;
  if (brand.startsWith(q)) score += 70;
  if (sku === q || barcode === q) score += 240;

  for (const token of tokens) {
    if (!token) continue;
    if (name.startsWith(token)) score += 35;
    else if (name.includes(token)) score += 22;
    if (category.includes(token)) score += 12;
    if (brand.includes(token)) score += 10;
    if (content.includes(token) || color.includes(token)) score += 8;
    if (sku.includes(token) || barcode.includes(token)) score += 15;
  }

  if (haystack.includes(q)) score += 20;
  if (Number(product?.stock || 0) > 0) score += 6;
  return score;
};

const rankManualMatches = (rows, query) => (
  (Array.isArray(rows) ? rows : [])
    .filter((product) => Number(product?.id || 0) > 0)
    .map((product) => ({ product, score: getManualSearchScore(product, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bStock = Number(b.product?.stock || 0);
      const aStock = Number(a.product?.stock || 0);
      if (bStock !== aStock) return bStock - aStock;
      return String(a.product?.name || '').localeCompare(String(b.product?.name || ''));
    })
    .slice(0, 8)
    .map((row) => row.product)
);

const QUICK_QTY_OPTIONS = ['1', '2', '5', '1kg', '500g'];

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
        const rows = await productsApi.getAll({ name: query, status: 'active' });
        if (cancelled) return;
        const ranked = rankManualMatches(rows, query);
        const list = ranked.length
          ? ranked
          : (Array.isArray(rows) ? rows : [])
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
      <input
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
        <input
          type="text"
          value={manualDraft.qtyText}
          onChange={(e) => setManualDraft((prev) => ({ ...prev, qtyText: e.target.value }))}
          placeholder="Qty (example: 1kg or 2 pcs)"
          inputMode="text"
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
      </div>
      {!manualSearchLoading && manualMatches.length > 0 && (
        <div className="manual-search-results">
          {manualMatches.map((product, index) => {
            const productId = Number(product?.id || 0);
            const outOfStock = Number(product?.stock || 0) <= 0;
            return (
              <div
                key={productId}
                className={`manual-search-item ${index === manualMatchCursor ? 'active' : ''}`}
              >
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

  if (cart.length === 0) {
    return (
      <div className="empty-cart fade-in-up">
        <div className="empty-cart-icon">
          <ShoppingBag size={80} />
        </div>
        <h2>Your cart is empty</h2>
        <p>Add products or manual requested items to start your order.</p>
        {renderManualEntryCard()}
        <button className="continue-shopping-btn" onClick={() => navigate('/products')}>
          Continue Shopping
        </button>
      </div>
    );
  }

  const hasUnknownPriceItems = cart.some((item) => isUnknownPriceItem(item));

  return (
    <div className="cart-page">
      <div className="cart-header fade-in-up">
        <h1>Shopping Cart</h1>
        <p>{cartCount} {cartCount === 1 ? 'item' : 'items'} in your cart</p>
      </div>

      <div className="cart-content">
        <div className="cart-items">
          {renderManualEntryCard()}
          {cart.map((item, index) => {
            const manual = isManualItem(item);
            const requestedCatalog = !manual && Number(item?.out_of_stock_request || 0) === 1;
            const unknownPrice = isUnknownPriceItem(item);
            const quantityLabel = getItemQuantityLabel(item);
            const requestedQtyNumeric = Math.max(0, Number(item?.quantity || 0));
            const stockQtyNumeric = Math.max(0, Number(item?.stock || 0));
            const availableNowQty = requestedCatalog
              ? Math.min(stockQtyNumeric, requestedQtyNumeric)
              : requestedQtyNumeric;
            const pendingQty = requestedCatalog
              ? Math.max(0, requestedQtyNumeric - availableNowQty)
              : 0;
            return (
              <div
                key={getCartItemKey(item)}
                className="cart-item slide-in-left"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="cart-item-image">
                  {manual || !item.image ? (
                    <div className="manual-item-placeholder">{String(item?.name || 'M').slice(0, 1).toUpperCase()}</div>
                  ) : (
                    <img src={item.image} alt={item.name} />
                  )}
                </div>
                <div className="cart-item-details">
                  <h3>{item.name}</h3>
                  <p className="cart-item-category">
                    {manual ? 'Requested / Manual' : requestedCatalog ? 'Requested / Out of Stock' : item.category}
                  </p>
                  <p className="cart-item-quantity-text">Qty: {quantityLabel}</p>
                  {requestedCatalog ? (
                    <p className="cart-item-request-note">
                      {`${Number(availableNowQty || 0)} available now, ${Number(pendingQty || 0)} pending.`}
                    </p>
                  ) : null}
                  {unknownPrice ? (
                    <p className="cart-item-price-unknown">Price: Unknown (set at billing)</p>
                  ) : (
                    <p className="cart-item-price">{formatCurrencyColored(item.price)} each</p>
                  )}
                </div>
                <div className="cart-item-actions">
                  {manual ? (
                    <div className="manual-qty-badge">Qty {quantityLabel}</div>
                  ) : (
                    <div className="quantity-control">
                      <button
                        type="button"
                        className="quantity-btn"
                        onClick={() => updateQuantity(getCartItemKey(item), -1)}
                        disabled={Number(item.quantity || 1) <= 1}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="quantity-display">{Number(item.quantity || 1)}</span>
                      <button
                        type="button"
                        className="quantity-btn"
                        onClick={() => updateQuantity(getCartItemKey(item), 1)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                  <div className="cart-item-total">
                    <span className="total-label">Total</span>
                    {unknownPrice ? (
                      <span className="total-value unknown">Unknown</span>
                    ) : (
                      <span className="total-value">{formatCurrencyColored(item.price * item.quantity)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeItem(getCartItemKey(item))}
                    title="Remove item"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="cart-summary slide-in-right">
          <h2>Order Summary</h2>
          <div className="summary-details">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatCurrencyColored(getTotal())}</span>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <span>Free</span>
            </div>
            <div className="summary-row">
              <span>Tax (estimated)</span>
              <span>{formatCurrencyColored(getTotal() * 0.1)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-total">
              <span>Total</span>
              <span>{formatCurrencyColored(getTotal() * 1.1)}</span>
            </div>
          </div>
          {hasUnknownPriceItems ? (
            <p className="unknown-price-note">Requested/manual items are sent with price as Unknown and finalized at confirmation.</p>
          ) : null}
          <button className="checkout-btn" onClick={handleCheckout}>
            Proceed to Checkout
          </button>
          <button className="clear-cart-btn" onClick={clearCart}>
            Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}

export default Cart;
