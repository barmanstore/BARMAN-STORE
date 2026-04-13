// Homepage Premium Upgrade - Metrics Baseline (Task 12)
// TODO: Implement analytics tracking for:
// - Bounce rate
// - Average time on homepage
// - Add-to-cart rate from homepage
// - Time to first add
// - 30-day checkpoint review

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../providers/CartProvider';

import { resolveMediaUrl } from '../../shared/services/api';
import { productService } from '../../shared/services/productService';
import { categoryService } from '../../shared/services/categoryService';
import { formatCurrency } from '../../shared/utils/formatters';
import { getProductFallbackImage } from '../../shared/utils/productImage';
import MobileAccountLayout from '../../shared/components/mobile/MobileAccountLayout';
import './Home.css';
import * as info from '../../shared/info';

const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

function Home() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [categoryCards, setCategoryCards] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadSections = async () => {
      try {
        const [categoriesData, stockData] = await Promise.all([
          categoryService.list(),
          productService.list({ page_size: 16, sort: 'stock-desc', in_stock: 'true' }),
        ]);
        if (cancelled) return;
        const categories = Array.isArray(categoriesData) ? categoriesData : [];
        const stockItems = Array.isArray(stockData) ? stockData : (stockData?.items || []);
        const topCategories = categories.slice(0, 8);
        setCategoryCards(topCategories);
        setBestSellers(stockItems.slice(0, 8));
      } catch (_) {
        if (cancelled) return;
        setCategoryCards([]);
        setBestSellers([]);
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    };
    loadSections();
    return () => {
      cancelled = true;
    };
  }, []);

  const getProductCardImage = (product) => {
    const resolved = resolveMediaUrl(product?.image);
    return resolved || getProductFallbackImage(product);
  };

  const getCategoryIcon = (categoryName) => {
    const name = String(categoryName || '').toLowerCase();

    // Return SVG strings for each category
    const iconMap = {
      'baby care': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C10.9 2 10 2.9 10 4V6H8C6.9 6 6 6.9 6 8V20C6 21.1 6.9 22 8 22H16C17.1 22 18 21.1 18 20V8C18 6.9 17.1 6 16 6H14V4C14 2.9 13.1 2 12 2ZM12 4V6H10V4H12ZM8 8H16V10H8V8ZM8 12H16V14H8V12ZM8 16H14V18H8V16Z" fill="currentColor"/>
      </svg>`,
      'biscuits & bakery': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C11.45 2 11 2.45 11 3V4H9C7.9 4 7 4.9 7 6V18C7 19.1 7.9 20 9 20H15C16.1 20 17 19.1 17 18V6C17 4.9 16.1 4 15 4H13V3C13 2.45 12.55 2 12 2ZM9 6H15V8H9V6ZM9 10H15V12H9V10ZM9 14H15V16H9V14Z" fill="currentColor"/>
      </svg>`,
      'breakfast tea & coffee': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 2C4.9 2 4 2.9 4 4V8C4 16.8 11.2 24 20 24C21.1 24 22 23.1 22 22V20C22 18.9 21.1 18 20 18H18V16C18 14.9 17.1 14 16 14H14V12C14 10.9 13.1 10 12 10H10V8H12V10H14V12H16V14H18V16H20V20H16.8C10.6 20 5.6 15 5.6 8.8V4H6ZM8 4V8.8C8 14.4 12.6 19 18.2 19H20V22C13.4 22 8 16.6 8 10V4H8Z" fill="currentColor"/>
      </svg>`,
      'chocolates': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C10.9 2 10 2.9 10 4V6H8C6.9 6 6 6.9 6 8V18C6 19.1 6.9 20 8 20H16C17.1 20 18 19.1 18 18V8C18 6.9 17.1 6 16 6H14V4C14 2.9 13.1 2 12 2ZM12 4V6H10V4H12ZM8 8H16V12H8V8ZM8 14H16V16H8V14Z" fill="currentColor"/>
      </svg>`,
      'daily necessary': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C11.45 2 11 2.45 11 3V5H7C5.9 5 5 5.9 5 7V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V7C19 5.9 18.1 5 17 5H13V3C13 2.45 12.55 2 12 2ZM7 7H17V9H7V7ZM7 11H17V13H7V11ZM7 15H17V17H7V15Z" fill="currentColor"/>
      </svg>`,
      'dairy': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2C6.9 2 6 2.9 6 4V6C4.9 6 4 6.9 4 8V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8C20 6.9 19.1 6 18 6V4C18 2.9 17.1 2 16 2H8ZM8 4H16V6H8V4ZM6 8H18V10H6V8ZM6 12H18V14H6V12ZM6 16H18V18H6V16Z" fill="currentColor"/>
      </svg>`,
      'groceries': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 4C5.9 4 5 4.9 5 6V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V6C19 4.9 18.1 4 17 4H7ZM7 6H17V8H7V6ZM7 10H17V12H7V10ZM7 14H17V16H7V14ZM7 18H17V20H7V18Z" fill="currentColor"/>
        <circle cx="9" cy="7" r="1" fill="currentColor"/>
        <circle cx="12" cy="7" r="1" fill="currentColor"/>
        <circle cx="15" cy="7" r="1" fill="currentColor"/>
      </svg>`,
      'vegetables': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2C6.9 2 6 2.9 6 4V6C4.9 6 4 6.9 4 8V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V8C20 6.9 19.1 6 18 6V4C18 2.9 17.1 2 16 2H8ZM8 4H16V6H8V4ZM6 8H18V10H6V8ZM6 12H18V14H6V12ZM6 16H18V18H6V16Z" fill="currentColor"/>
      </svg>`,
      'fruits': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C10.9 2 10 2.9 10 4V6H8C6.9 6 6 6.9 6 8V18C6 19.1 6.9 20 8 20H16C17.1 20 18 19.1 18 18V8C18 6.9 17.1 6 16 6H14V4C14 2.9 13.1 2 12 2ZM12 4V6H10V4H12ZM8 8H16V10H8V8ZM8 12H16V14H8V12Z" fill="currentColor"/>
        <circle cx="10" cy="9" r="1" fill="currentColor"/>
        <circle cx="14" cy="9" r="1" fill="currentColor"/>
      </svg>`,
      'default': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 4C5.9 4 5 4.9 5 6V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V6C19 4.9 18.1 4 17 4H7ZM7 6H17V8H7V6ZM7 10H17V12H7V10ZM7 14H17V16H7V14Z" fill="currentColor"/>
      </svg>`
    };

    // Check for partial matches
    for (const [key, svg] of Object.entries(iconMap)) {
      if (name.includes(key.split(' ')[0]) || name.includes(key)) {
        return svg;
      }
    }

    return iconMap['default'];
  };

  const getCategoryColor = (categoryName) => {
    const name = String(categoryName || '').toLowerCase();
    const colorMap = {
      vegetable: '#22c55e', // green
      fruit: '#f97316',    // orange
      dairy: '#3b82f6',    // blue
      meat: '#dc2626',     // red
      bread: '#eab308',    // yellow
      rice: '#8b5cf6',     // purple
      spice: '#ef4444',    // red
      stationery: '#06b6d4', // cyan
      household: '#64748b',  // slate
      personal: '#ec4899',   // pink
    };
    return colorMap[name] || '#6b7280'; // default gray
  };

  const ProductPreviewCard = ({ product }) => {
    const name = String(product?.name || '').trim() || 'Product';
    const content = String(product?.content || product?.uom || '').trim();
    const price = Number(product?.price || 0);
    const mrp = Math.max(price, Number(product?.mrp || 0));
    const hasDiscount = mrp > price;
    const discountPercent = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const [addState, setAddState] = useState('idle'); // idle, loading, added

    const handleAddToCart = async () => {
      if (addState !== 'idle') return;

      setAddState('loading');
      try {
        await addToCart(product, 1);
        setAddState('added');
        setTimeout(() => setAddState('idle'), 2000);
      } catch (error) {
        console.error('Failed to add to cart:', error);
        setAddState('idle');
      }
    };

    return (
      <article className="home-product-card">
        <Link to={`/products?q=${encodeURIComponent(name)}`} className="home-product-link">
          <div className="home-product-image">
            {hasDiscount && <span className="home-discount-badge">{discountPercent}% OFF</span>}
            {!hasDiscount && <span className="home-top-pick-badge">Top pick</span>}
            <img src={getProductCardImage(product)} alt={name} loading="lazy" />
          </div>
          <div className="home-product-body">
            <h3>{name}</h3>
            {content ? <p className="home-product-meta">{content}</p> : null}
            <div className="home-product-price">
              <span className="home-current-price">{formatCurrency(price)}</span>
              {hasDiscount ? <span className="home-original-price">{formatCurrency(mrp)}</span> : null}
            </div>
          </div>
        </Link>
        <button
          className={`home-add-btn ${addState}`}
          type="button"
          onClick={handleAddToCart}
          disabled={addState === 'loading'}
        >
          {addState === 'idle' && 'Add to cart'}
          {addState === 'loading' && 'Adding...'}
          {addState === 'added' && '✓ Added'}
        </button>
      </article>
    );
  };

  return (
    <MobileAccountLayout>
      <main className="home">
        {/* Dark Hero Section */}
        <section className="home-hero">
          <div className="home-hero-content">
            <h1 className="home-title">{info.TITLE}</h1>
            <p className="home-tagline">Premier grocery · Tezpur</p>
            <div className="home-trust-pills">
              <span className="home-trust-pill">Est. 2009</span>
              <span className="home-trust-pill">Free delivery</span>
              <span className="home-trust-pill">4.8 ★</span>
            </div>
            <div className="home-search-wrap">
              <input
                type="text"
                className="home-search-input"
                placeholder="Search for products..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) {
                      navigate(`/products?q=${encodeURIComponent(query)}`);
                    }
                  }
                }}
              />
              <button className="home-search-btn" type="button">
                Search
              </button>
            </div>
          </div>
        </section>

        {/* Promo Strip */}
        <section className="home-promo-strip">
          <div className="home-promo-content">
            <div className="home-promo-text">
              <h2 className="home-promo-headline">Today's deals</h2>
              <p className="home-promo-sub">Up to 30% off staples</p>
            </div>
            <Link to="/products?promo=today" className="home-promo-cta">
              View all
            </Link>
          </div>
        </section>

      <section className="home-section category-section">
        <div className="section-header">
          <h2>Shop by Category</h2>
        </div>
        {sectionsLoading && categoryCards.length === 0 ? (
          <div className="section-placeholder">Loading categories...</div>
        ) : (
          <nav className="category-grid">
            {categoryCards.map((category) => {
              const iconSvg = getCategoryIcon(category.name);
              const color = getCategoryColor(category.name);
              const displayName = String(category.name || '').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
              return (
                <Link
                  key={category.id}
                  to={`/products?category=${encodeURIComponent(category.name)}`}
                  className="category-card"
                >
                  <div className="category-icon-chip" style={{ backgroundColor: color }}>
                    <span
                      className="category-icon"
                      dangerouslySetInnerHTML={{ __html: iconSvg }}
                    />
                  </div>
                  <span className="category-name">{displayName}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </section>

      <section className="home-section product-rail">
        <div className="section-header">
          <h2>Best sellers</h2>
        </div>
        <div className="home-product-grid">
          {bestSellers.map((product) => (
            <ProductPreviewCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="home-social-proof">
        <div className="home-social-proof-content">
          <div className="home-rating">
            <span className="home-stars">★★★★☆</span>
            <span className="home-rating-text">4.8</span>
          </div>
          <div className="home-customer-count">
            <span className="home-customer-number">1,240</span>
            <span className="home-customer-label">customers</span>
          </div>
        </div>
      </section>








      </main>
    </MobileAccountLayout>
  );
}

export default Home;


