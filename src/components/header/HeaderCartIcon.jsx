import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

function HeaderCartIcon({ count = 0, onClick, className = '' }) {
  return (
    <Link
      to="/cart"
      className={`header-cart-link ${className}`.trim()}
      onClick={onClick}
      aria-label="Open cart"
    >
      <ShoppingCart size={20} />
      {count > 0 ? <span className="cart-badge">{count}</span> : null}
    </Link>
  );
}

export default HeaderCartIcon;
