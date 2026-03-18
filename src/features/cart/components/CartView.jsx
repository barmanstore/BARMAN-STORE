import React from 'react';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
import SignedCurrency from '../../../shared/components/SignedCurrency';

const CartView = ({
  cart,
  cartCount,
  renderManualEntryCard,
  onContinueShopping,
  getCartItemKey,
  isManualItem,
  isUnknownPriceItem,
  getItemQuantityLabel,
  updateQuantity,
  removeItem,
  getTotal,
  handleCheckout,
  clearCart,
}) => {
  if (cart.length === 0) {
    return (
      <MobileAccountLayout>
        <div className="empty-cart fade-in-up">
          <div className="empty-cart-icon">
            <ShoppingBag size={80} />
          </div>
          <h2>Your cart is empty</h2>
          <p>Add products or manual requested items to start your order.</p>
          {renderManualEntryCard()}
          <button className="continue-shopping-btn" onClick={onContinueShopping}>
            Continue Shopping
          </button>
        </div>
      </MobileAccountLayout>
    );
  }

  const hasUnknownPriceItems = cart.some((item) => isUnknownPriceItem(item));

  return (
    <MobileAccountLayout>
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
                      <p className="cart-item-price"><SignedCurrency amount={item.price} /> each</p>
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
                        <span className="total-value"><SignedCurrency amount={item.price * item.quantity} /></span>
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
                <span><SignedCurrency amount={getTotal()} /></span>
              </div>
              <div className="summary-row">
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className="summary-row">
                <span>Tax (estimated)</span>
                <span><SignedCurrency amount={getTotal() * 0.1} /></span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-total">
                <span>Total</span>
                <span><SignedCurrency amount={getTotal() * 1.1} /></span>
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
    </MobileAccountLayout>
  );
};

export default CartView;

