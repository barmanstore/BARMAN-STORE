import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, Truck, Shield, CreditCard } from 'lucide-react';
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
  const [heroSearch, setHeroSearch] = useState('');
  const [categoryCards, setCategoryCards] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const logoImage = getPublicFileUrl(info.LOGO_URL || 'logo.png');

  const handleHeroSearch = (event) => {
    event.preventDefault();
    const query = String(heroSearch || '').trim();
    if (query) {
      navigate(`/products?q=${encodeURIComponent(query)}`);
      return;
    }
    navigate('/products');
  };

  useEffect(() => {
    let cancelled = false;
    const loadSections = async () => {
      try {
        const [categoriesData, newestData, stockData] = await Promise.all([
          categoryService.list(),
          productService.list({ page_size: 24, sort: 'newest' }),
          productService.list({ page_size: 16, sort: 'stock-desc', in_stock: 'true' }),
        ]);
        if (cancelled) return;
        const categories = Array.isArray(categoriesData) ? categoriesData : [];
        const newestItems = Array.isArray(newestData) ? newestData : (newestData?.items || []);
        const stockItems = Array.isArray(stockData) ? stockData : (stockData?.items || []);
        const topCategories = categories.slice(0, 8);
        const dealItems = newestItems.filter((item) => Number(item?.mrp || 0) > Number(item?.price || 0)).slice(0, 8);
        const recommendedItems = newestItems.filter((item) => Number(item?.mrp || 0) <= Number(item?.price || 0)).slice(0, 8);
        setCategoryCards(topCategories);
        setBestSellers(stockItems.slice(0, 8));
        setDeals(dealItems);
        setRecommended(recommendedItems);
      } catch (_) {
        if (cancelled) return;
        setCategoryCards([]);
        setBestSellers([]);
        setDeals([]);
        setRecommended([]);
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

  const ProductPreviewCard = ({ product }) => {
    const name = String(product?.name || '').trim() || 'Product';
    const content = String(product?.content || product?.uom || '').trim();
    const price = Number(product?.price || 0);
    const mrp = Math.max(price, Number(product?.mrp || 0));
    const hasDiscount = mrp > price;
    return (
      <Link to={`/products?q=${encodeURIComponent(name)}`} className="home-product-card">
        <div className="home-product-image">
          {hasDiscount ? <span className="home-discount-badge">{Math.round(((mrp - price) / mrp) * 100)}% OFF</span> : null}
          <img src={getProductCardImage(product)} alt={name} loading="lazy" />
        </div>
        <div className="home-product-body">
          <h3>{name}</h3>
          {content ? <p className="home-product-meta">{content}</p> : null}
          <div className="home-product-price">
            <strong>{formatCurrency(price)}</strong>
            {hasDiscount ? <span className="home-product-mrp">{formatCurrency(mrp)}</span> : null}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <MobileAccountLayout>
      <div className="home">
        {/* Hero Section */}
        <section className="hero">
        <div className="hero-content fade-in-up">
          <div className="hero-logo-wrap" aria-hidden="true">
            <img src={logoImage} alt="" className="hero-logo-image" />
          </div>
          <h1 className="hero-title">
            <span className="hero-title-main">{info.TITLE}</span>
            <span className="hero-title-sub">{info.SUB_TITLE}</span>
          </h1>
          <p className="hero-description">{info.DESCRIPTION}</p>
          <div className="hero-trust-strip" role="list" aria-label="Trust and privacy commitments">
            <span role="listitem">OTP login, no password required</span>
            <span role="listitem">Customer data stays private</span>
            <span role="listitem">Clear data deletion process</span>
          </div>
          <p className="hero-security-note">No password required, OTP-based login, your data is protected.</p>
          <div className="hero-local-info">
            <span>{info.COUNTER_HOURS}</span>
            {info.SHOP_LOCATION_URL ? (
              <a href={info.SHOP_LOCATION_URL} target="_blank" rel="noreferrer">
                Shop Location
              </a>
            ) : null}
          </div>
          <form className="hero-search-wrap" onSubmit={handleHeroSearch}>
            <input
              id="home-hero-search"
              name="search"
              type="text"
              className="hero-search-input"
              placeholder="Search groceries, notebooks, brands..."
              value={heroSearch}
              onChange={(event) => setHeroSearch(event.target.value)}
              aria-label="Search products from home"
            />
            <button type="submit" className="hero-search-btn">Search</button>
          </form>
          <div className="hero-cta-row">
            <Link to="/products" className="hero-cta primary">
              Buy Now
            </Link>
            <Link to="/products" className="hero-cta">
              Explore Collection
            </Link>
          </div>
          <div className="hero-policy-links">
            <a href={getPublicFileUrl('privacy-policy.html')}>Privacy Policy</a>
            <a href={getPublicFileUrl('terms-of-service.html')}>Terms</a>
            <a href={getPublicFileUrl('data-deletion.html')}>Data Deletion</a>
          </div>
        </div>
        <div className="hero-decoration">
          <div className="decoration-circle"></div>
          <div className="decoration-line"></div>
        </div>
      </section>

      <section className="home-section category-section">
        <div className="section-header">
          <h2>Shop by Category</h2>
          <p>Quick picks to jump into your daily essentials.</p>
        </div>
        {sectionsLoading && categoryCards.length === 0 ? (
          <div className="section-placeholder">Loading categories...</div>
        ) : (
          <div className="category-grid">
            {categoryCards.map((category) => (
              <Link
                key={category.id}
                to={`/products?category=${encodeURIComponent(category.name)}`}
                className="category-card"
              >
                <span className="category-icon">{category.icon || '🛒'}</span>
                <span className="category-name">{category.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="home-section product-rail">
        <div className="section-header">
          <h2>Best Sellers</h2>
          <p>Popular picks customers restock every week.</p>
        </div>
        <div className="home-product-grid">
          {bestSellers.map((product) => (
            <ProductPreviewCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="home-section product-rail deals-section">
        <div className="section-header">
          <h2>Today&apos;s Deals</h2>
          <p>Limited-time savings across pantry staples.</p>
        </div>
        <div className="home-product-grid">
          {deals.map((product) => (
            <ProductPreviewCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="home-section product-rail">
        <div className="section-header">
          <h2>Recommended for You</h2>
          <p>Fresh arrivals curated for quick baskets.</p>
        </div>
        <div className="home-product-grid">
          {recommended.map((product) => (
            <ProductPreviewCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="home-section order-flow">
        <div className="section-header">
          <h2>Order in 3 simple steps</h2>
          <p>Order → Pick up → Pay. No complicated checkout.</p>
        </div>
        <div className="order-flow-steps">
          <div className="order-flow-step">
            <span className="order-flow-icon"><ShoppingBag /></span>
            <strong>Order</strong>
            <p>Pick items from the catalog and place your order.</p>
          </div>
          <div className="order-flow-step">
            <span className="order-flow-icon"><Package /></span>
            <strong>Pick up</strong>
            <p>Collect from the shop when your order is ready.</p>
          </div>
          <div className="order-flow-step">
            <span className="order-flow-icon"><CreditCard /></span>
            <strong>Pay</strong>
            <p>Pay at pickup or use credit if allowed.</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.1s' }}>
          <div className="feature-icon">
            <ShoppingBag />
          </div>
          <h3>Daily Essentials</h3>
          <p>Groceries and stationery in one place for quick and simple ordering.</p>
        </div>
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.2s' }}>
          <div className="feature-icon">
            <Package />
          </div>
          <h3>Flexible Orders</h3>
          <p>Order in-stock, low-stock, or requested items without complicated steps.</p>
        </div>
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.3s' }}>
          <div className="feature-icon">
            <Truck />
          </div>
          <h3>Fast Fulfilment</h3>
          <p>Quick processing from order to billing, optimized for mobile users.</p>
        </div>
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.4s' }}>
          <div className="feature-icon">
            <Shield />
          </div>
          <h3>Secure & Transparent</h3>
          <p>OTP authentication, clear policies, and customer-controlled profile data.</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content fade-in-up">
          <h2>Ready to order confidently?</h2>
          <p>Browse products, place order quickly, and track updates in your inbox.</p>
          <Link to="/products" className="cta-button">
            Start Shopping
          </Link>
        </div>
        </section>
      </div>
    </MobileAccountLayout>
  );
}

export default Home;


