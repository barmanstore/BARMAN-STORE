import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, Truck, Shield } from 'lucide-react';
import './Home.css';
import * as info from './info';

const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

function Home() {
  const navigate = useNavigate();
  const [heroSearch, setHeroSearch] = useState('');
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

  return (
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
  );
}

export default Home;
