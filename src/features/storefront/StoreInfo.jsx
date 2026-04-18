import { Link } from 'react-router-dom';
import MobileAccountLayout from '../../shared/components/mobile/MobileAccountLayout';
import * as info from '../../shared/info.js';
import './StoreInfo.css';

const getPublicFileUrl = (filename) => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(filename || '').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

function StoreInfo() {
  return (
    <MobileAccountLayout>
      <div className="store-info-page">
        <header className="store-info-header">
          <h1>Store Info</h1>
          <p>Everything you need to know about shopping with us.</p>
        </header>

        <section className="store-info-section" id="store-terms">
          <h2>Terms & Policies</h2>
          <ul className="store-info-list">
            <li>
              <a href={getPublicFileUrl('terms-of-service.html')}>Terms and Conditions</a>
            </li>
            <li id="store-privacy">
              <a href={getPublicFileUrl('privacy-policy.html')}>Privacy Policy</a>
            </li>
            <li>
              <a href={getPublicFileUrl('data-deletion.html')}>Data Deletion</a>
            </li>
          </ul>
        </section>

        <section className="store-info-section" id="store-help">
          <h2>Help</h2>
          <ul className="store-info-list">
            <li>How to place an order</li>
            <li>Delivery timelines and pickup details</li>
            <li>Returns, replacements, and refunds</li>
          </ul>
        </section>

        <section className="store-info-section">
          <h2>Site Manuals</h2>
          <ul className="store-info-list">
            <li>Shopping guide for quick add and repeat orders</li>
            <li>Payment methods and billing support</li>
            <li>Account, profile, and notification settings</li>
          </ul>
        </section>

        <section className="store-info-section">
          <h2>Contact Information</h2>
          <div className="store-info-contact">
            <p>
              <strong>Email:</strong> {info.EMAIL}
            </p>
            <p>
              <strong>Phone:</strong> {info.CONTACT}
            </p>
            {info.SHOP_ADDRESS ? (
              <p>
                <strong>Address:</strong> {info.SHOP_ADDRESS}
              </p>
            ) : null}
            {info.COUNTER_HOURS ? (
              <p>
                <strong>Counter Hours:</strong> {info.COUNTER_HOURS}
              </p>
            ) : null}
            {info.ONLINE_STORE_URL ? (
              <p>
                <strong>Online Store:</strong>{' '}
                <a href={info.ONLINE_STORE_URL} target="_blank" rel="noreferrer">
                  Visit Site
                </a>
              </p>
            ) : null}
          </div>
          <div className="store-info-footer-link">
            <Link to="/products">Back to Shop</Link>
          </div>
        </section>
      </div>
    </MobileAccountLayout>
  );
}

export default StoreInfo;
