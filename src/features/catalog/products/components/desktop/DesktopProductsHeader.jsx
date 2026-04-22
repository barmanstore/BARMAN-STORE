import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

const DesktopProductsHeader = ({ cartItemCount }) => (
  <div className="products-header fade-in-up">
    <div className="products-header-main">
      <div>
        <h1>Daily Needs, Fast</h1>
        <p>Restock, repeat, and quick add in seconds.</p>
      </div>
      <Link to="/cart" className="products-cart-pill" aria-label="Open cart">
        <ShoppingCart size={16} />
        <span>{cartItemCount}</span>
      </Link>
    </div>
  </div>
);

export default DesktopProductsHeader;
