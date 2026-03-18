import React from 'react';
import {
  CheckCircle,
  CreditCard,
  User,
  MapPin,
  Package,
  AlertCircle,
  Search,
  Shield
} from 'lucide-react';
import { formatCurrency } from '../../../shared/utils/formatters';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';

const CheckoutView = ({
  loading,
  success,
  orderResult,
  onContinueShopping,
  isLoggedIn,
  user,
  isAdmin,
  adminMode,
  onToggleAdminMode,
  profileIncomplete,
  profileValidation,
  error,
  switchToProfile,
  adminCustomerSearch,
  onAdminCustomerSearchChange,
  showCustomerDropdown,
  customerSearchResults,
  onSelectCustomer,
  formData,
  handleInputChange,
  handleSubmit,
  submitting,
  getTotal,
  cart,
  getItemQuantityLabel,
  isUnknownPriceItem,
}) => {
  if (loading) {
    return (
      <MobileAccountLayout>
        <div className="checkout-page">
          <div className="loading-container">
            <Package size={40} className="spinning" />
            <p>Loading checkout...</p>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  if (success && orderResult) {
    return (
      <MobileAccountLayout>
        <div className="checkout-page">
          <div className="order-success fade-in-up">
            <div className="success-icon">
              <CheckCircle size={100} />
            </div>
            <h1>Order Placed Successfully!</h1>
            <p className="order-number">Order #{orderResult.orderNumber}</p>
            <p className="success-message">
              Thank you for your order. Payment mode: Cash on delivery.
            </p>
            <div className="order-details">
              <p>Total Amount: <strong>{formatCurrency(orderResult.totalAmount)}</strong></p>
            </div>
            <button className="back-home-btn" onClick={onContinueShopping}>
              Continue Shopping
            </button>
          </div>
        </div>
      </MobileAccountLayout>
    );
  }

  const hasUnknownPriceItems = cart.some((item) => isUnknownPriceItem(item));

  return (
    <MobileAccountLayout>
      <div className="checkout-page">
        <div className="checkout-header fade-in-up">
          <h1>Checkout</h1>
          <p>{isLoggedIn ? `Welcome, ${user?.name || 'Customer'}` : 'Guest Checkout'}</p>

          {isAdmin && (
            <div className="admin-mode-toggle">
              <button
                className={`toggle-btn ${adminMode ? 'active' : ''}`}
                onClick={onToggleAdminMode}
              >
                <Shield size={16} />
                {adminMode ? 'Admin: Select Customer' : 'Switch to Admin Mode'}
              </button>
            </div>
          )}
        </div>

        {profileIncomplete && (
          <div className="profile-warning fade-in-up">
            <AlertCircle size={24} />
            <div className="warning-content">
              <h3>Profile Information Incomplete</h3>
              <p>Please fill in all required fields marked with * to complete your order.</p>
              {profileValidation?.issues?.map((issue, idx) => (
                <p key={idx} className="issue-item">- {issue.message}</p>
              ))}
            </div>
            <button className="update-profile-btn" onClick={switchToProfile}>
              Update Profile
            </button>
          </div>
        )}

        {error && !profileIncomplete && (
          <div className="error-alert fade-in-up">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className="checkout-content">
          <div className="checkout-form-container slide-in-left">
            <form onSubmit={handleSubmit} className="checkout-form">
              {adminMode && (
                <div className="form-section">
                  <h2><Search size={20} /> Select Customer</h2>
                  <div className="customer-search-container">
                    <input
                      id="checkout-customer-search"
                      name="customer_search"
                      type="text"
                      placeholder="Search customers by name, email, or phone..."
                      value={adminCustomerSearch}
                      onChange={onAdminCustomerSearchChange}
                      className="customer-search-input"
                    />
                    {showCustomerDropdown && customerSearchResults.length > 0 && (
                      <div className="customer-dropdown">
                        {customerSearchResults.map((customer) => (
                          <div
                            key={customer.id}
                            className="customer-option"
                            onClick={() => onSelectCustomer(customer)}
                          >
                            <div className="customer-info">
                              <span className="customer-name">{customer.name}</span>
                              <span className="customer-email">{customer.email}</span>
                            </div>
                            <span className="customer-phone">{customer.phone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-section">
                <h2><User size={20} /> Customer Information</h2>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="customer_name">Full Name *</label>
                    <input
                      type="text"
                      id="customer_name"
                      name="customer_name"
                      value={formData.customer_name}
                      onChange={handleInputChange}
                      required
                      placeholder="John Doe"
                      autoComplete="name"
                      className={profileValidation?.issues?.find(i => i.field === 'name') ? 'error-field' : ''}
                    />
                  </div>
                </div>

                <div className="form-row two-col">
                  <div className="form-group">
                    <label htmlFor="customer_email">Email Address</label>
                    <input
                      type="email"
                      id="customer_email"
                      name="customer_email"
                      value={formData.customer_email}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="customer_phone">Phone Number *</label>
                    <input
                      type="tel"
                      id="customer_phone"
                      name="customer_phone"
                      value={formData.customer_phone}
                      onChange={handleInputChange}
                      required
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h2><MapPin size={20} /> Shipping Address</h2>

                <div className="form-group">
                  <label htmlFor="street">Street Address *</label>
                  <input
                    type="text"
                    id="street"
                    name="street"
                    value={formData.street}
                    onChange={handleInputChange}
                    required
                    placeholder="123 Main Street, Apartment 4B"
                    autoComplete="street-address"
                  />
                </div>

                <div className="form-row three-col">
                  <div className="form-group">
                    <label htmlFor="city">City *</label>
                    <input
                      type="text"
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      required
                      placeholder="Mumbai"
                      autoComplete="address-level2"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="state">State/Region *</label>
                    <input
                      type="text"
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      required
                      placeholder="Maharashtra"
                      autoComplete="address-level1"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="zip">Postal Code *</label>
                    <input
                      type="text"
                      id="zip"
                      name="zip"
                      value={formData.zip}
                      onChange={handleInputChange}
                      required
                      placeholder="400001"
                      autoComplete="postal-code"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="country">Country</label>
                  <input
                    type="text"
                    id="country"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    placeholder="India"
                    autoComplete="country"
                  />
                </div>
              </div>

              <div className="form-section">
                <h2><CreditCard size={20} /> Payment Method</h2>
                <p className="payment-note">
                  <CreditCard size={16} />
                  Cash on delivery only. No online payment step is required.
                </p>
              </div>

              <button
                type="submit"
                className="place-order-btn"
                disabled={submitting}
              >
                {submitting ? 'Processing...' : `Place Order - ${formatCurrency(getTotal() * 1.1)}`}
              </button>
            </form>
          </div>

          <div className="order-summary slide-in-right">
            <h2>Order Summary</h2>
            <div className="order-items">
              {cart.map((item) => (
                <div key={item.id} className="summary-item">
                  <div className="summary-item-image">
                    {item.image ? <img src={item.image} alt={item.name} /> : <div className="placeholder-image">No Image</div>}
                  </div>
                  <div className="summary-item-details">
                    <h4>{item.name}</h4>
                    <p>Qty: {getItemQuantityLabel(item)}</p>
                  </div>
                  <div className="summary-item-price">
                    {isUnknownPriceItem(item)
                      ? 'Unknown'
                      : formatCurrency(item.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div className="summary-totals">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(getTotal())}</span>
              </div>
              <div className="summary-row">
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className="summary-row">
                <span>Tax (10%)</span>
                <span>{formatCurrency(getTotal() * 0.1)}</span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-total">
                <span>Total</span>
                <span>{formatCurrency(getTotal() * 1.1)}</span>
              </div>
            </div>
            {hasUnknownPriceItems ? (
              <p className="unknown-price-note">Requested/manual items are submitted with price marked as Unknown.</p>
            ) : null}
          </div>
        </div>
      </div>
    </MobileAccountLayout>
  );
};

export default CheckoutView;

