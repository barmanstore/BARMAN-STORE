import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildRepeatCartFromOrder } from '../features/orders/utils/orderHistoryUtils';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../shared/utils/storage';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'barman_cart';
const CART_UPDATED_EVENT = 'cart:updated';

const safeParseCart = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const readStoredCart = () => safeParseCart(safeLocalStorageGet(CART_STORAGE_KEY) || '[]');

const getCartMergeKey = (item) => {
  const rawId = String(item?.id ?? '').trim().toLowerCase();
  const manual = Number(item?.is_manual || 0) === 1
    || String(item?.item_type || '').trim().toLowerCase() === 'manual'
    || rawId.startsWith('manual:')
    || !Number(item?.product_id || item?.id || 0);
  const quantityLabel = String(item?.quantity_label || item?.qty_text || '').trim().toLowerCase();
  if (manual) {
    return `manual:${String(item?.name || '').trim().toLowerCase()}:${quantityLabel}`;
  }
  return `catalog:${Number(item?.product_id || item?.id || 0)}:${quantityLabel}`;
};

const getCartCount = (rows) => (
  (Array.isArray(rows) ? rows : []).reduce(
    (sum, item) => sum + Math.max(0, Number(item?.quantity || 0)),
    0
  )
);

const dispatchCartUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
};

const mergeCartRows = (baseCart, additions) => {
  const nextCart = Array.isArray(baseCart) ? [...baseCart] : [];
  const rows = Array.isArray(additions) ? additions : [];

  rows.forEach((incoming) => {
    const mergeKey = getCartMergeKey(incoming);
    const index = nextCart.findIndex((entry) => getCartMergeKey(entry) === mergeKey);
    if (index === -1) {
      nextCart.push(incoming);
      return;
    }
    const existing = nextCart[index];
    const nextQuantity = Math.max(1, Number(existing?.quantity || 0) + Math.max(1, Number(incoming?.quantity || 0)));
    nextCart[index] = {
      ...existing,
      ...incoming,
      quantity: nextQuantity,
    };
  });

  return nextCart;
};

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => readStoredCart());

  const syncCartFromStorage = useCallback(() => {
    setCart(readStoredCart());
  }, []);

  useEffect(() => {
    window.addEventListener('storage', syncCartFromStorage);
    window.addEventListener(CART_UPDATED_EVENT, syncCartFromStorage);
    return () => {
      window.removeEventListener('storage', syncCartFromStorage);
      window.removeEventListener(CART_UPDATED_EVENT, syncCartFromStorage);
    };
  }, [syncCartFromStorage]);

  const commitCart = useCallback((nextCart) => {
    const normalized = Array.isArray(nextCart) ? nextCart : [];
    safeLocalStorageSet(CART_STORAGE_KEY, JSON.stringify(normalized));
    setCart(normalized);
    dispatchCartUpdated();
    return normalized;
  }, []);

  const addItems = useCallback((items) => (
    commitCart([...(Array.isArray(cart) ? cart : []), ...(Array.isArray(items) ? items : [])])
  ), [cart, commitCart]);

  const mergeCart = useCallback((items) => (
    commitCart(mergeCartRows(cart, items))
  ), [cart, commitCart]);

  const replaceCart = useCallback((items) => commitCart(items), [commitCart]);

  const clearCart = useCallback(() => {
    safeLocalStorageRemove(CART_STORAGE_KEY);
    setCart([]);
    dispatchCartUpdated();
    return [];
  }, []);

  const restoreFromOrder = useCallback((order) => {
    const rebuiltCart = Array.isArray(order)
      ? order
      : buildRepeatCartFromOrder(order).filter((item) => String(item?.name || '').trim());
    return commitCart(rebuiltCart);
  }, [commitCart]);

  const value = useMemo(() => ({
    cart,
    cartCount: getCartCount(cart),
    addItems,
    mergeCart,
    replaceCart,
    clearCart,
    restoreFromOrder,
  }), [addItems, cart, clearCart, mergeCart, replaceCart, restoreFromOrder]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};
