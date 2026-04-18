import { Link, useLocation } from 'react-router-dom';
import { Home, Sparkles, ShoppingCart, Store } from 'lucide-react';
import { useCart } from '../../../providers/CartProvider';
import './MobileFooter.css';

function MobileFooter({ cartCount = 0, onHome = null, onTopPicks = null, onCartClick = null }) {
  const location = useLocation();
  const { cartCount: sharedCartCount } = useCart();
  const isStorePage = location.pathname === '/store';
  const isProductsPage = location.pathname === '/products' || location.pathname === '/';
  const resolvedCartCount = Number(cartCount || sharedCartCount || 0);

  const homeButton = onHome ? (
    <button
      type="button"
      className="mobile-footer-btn"
      onClick={onHome}
      aria-current={isProductsPage ? 'page' : undefined}
    >
      <Home size={18} />
      <span>Home</span>
    </button>
  ) : (
    <Link
      to="/products"
      className="mobile-footer-btn"
      aria-current={isProductsPage ? 'page' : undefined}
    >
      <Home size={18} />
      <span>Home</span>
    </Link>
  );

  const topPicksButton = onTopPicks ? (
    <button type="button" className="mobile-footer-btn" onClick={onTopPicks}>
      <Sparkles size={18} />
      <span>Top Picks</span>
    </button>
  ) : (
    <Link to="/products#top-picks" className="mobile-footer-btn">
      <Sparkles size={18} />
      <span>Top Picks</span>
    </Link>
  );

  return (
    <nav className="mobile-shop-footer" aria-label="Mobile navigation">
      {homeButton}
      {topPicksButton}
      {onCartClick ? (
        <button type="button" className="mobile-footer-btn basket" onClick={onCartClick}>
          <ShoppingCart size={18} />
          <span>Basket</span>
          {resolvedCartCount > 0 ? (
            <em className="mobile-footer-badge">{resolvedCartCount}</em>
          ) : null}
        </button>
      ) : (
        <Link to="/cart" className="mobile-footer-btn basket">
          <ShoppingCart size={18} />
          <span>Basket</span>
          {resolvedCartCount > 0 ? (
            <em className="mobile-footer-badge">{resolvedCartCount}</em>
          ) : null}
        </Link>
      )}
      <Link
        to="/store"
        className="mobile-footer-btn"
        aria-current={isStorePage ? 'page' : undefined}
      >
        <Store size={18} />
        <span>Store</span>
      </Link>
    </nav>
  );
}

export default MobileFooter;
