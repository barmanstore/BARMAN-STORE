import { Link } from 'react-router-dom';
import { Coffee, ShoppingBag, Truck, Shield } from 'lucide-react';
import './Home.css';
import * as info from './info';

function Home() {
  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content fade-in-up">
          <h1 className="hero-title">
            <span className="hero-title-main">{info.TITLE}</span>
            <span className="hero-title-sub">{info.SUB_TITLE}</span>
          </h1>
          <p className="hero-description">{info.DESCRIPTION}</p>
          <Link to="/products" className="hero-cta">
            Explore Collection
          </Link>
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
            <Coffee />
          </div>
          <h3>Premium Quality</h3>
          <p>Handpicked artisan coffee beans and professional-grade equipment</p>
        </div>
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.2s' }}>
          <div className="feature-icon">
            <Truck />
          </div>
          <h3>Fast Delivery</h3>
          <p>Swift shipping to get your coffee essentials to you quickly</p>
        </div>
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.3s' }}>
          <div className="feature-icon">
            <Shield />
          </div>
          <h3>Quality Guarantee</h3>
          <p>30-day satisfaction guarantee on all products</p>
        </div>
        <div className="feature-card slide-in-left" style={{ animationDelay: '0.4s' }}>
          <div className="feature-icon">
            <ShoppingBag />
          </div>
          <h3>Expert Curation</h3>
          <p>Every product selected by professional baristas</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content fade-in-up">
          <h2>Ready to brew excellence?</h2>
          <p>Discover our complete range of products</p>
          <Link to="/products" className="cta-button">
            Start Shopping
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Home;
