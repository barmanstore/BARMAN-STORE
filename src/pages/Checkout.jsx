import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, CreditCard, User, MapPin,
  Package, AlertCircle, Search, Shield
} from 'lucide-react';
import { ordersApi, customersApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import './Checkout.css';

// Generate session ID for guest users
const generateSessionId = () => {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  
  // User state
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Admin order state
  const [adminMode, setAdminMode] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'India',
  });
  
  // Profile validation state
  const [profileValidation, setProfileValidation] = useState(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  
  // Payment state (demo)
  const [paymentMethod, setPaymentMethod] = useState('cash');
  
  const sessionId = searchParams.get('session_id') || localStorage.getItem('checkout_session') || generateSessionId();

  useEffect(() => {
    initializeCheckout();
  }, []);

  useEffect(() => {
    if (adminMode && customerSearch.length >= 2) {
      searchCustomers();
    }
  }, [customerSearch]);

  const initializeCheckout = async () => {
    try {
      const retryOrderId = searchParams.get('retry');
      let cartItems = [];

      if (retryOrderId) {
        try {
          const retryOrder = await ordersApi.getById(retryOrderId);
          const retryItems = Array.isArray(retryOrder?.items) ? retryOrder.items : [];
          cartItems = retryItems
            .map((item) => {
              const quantity = Number(item.quantity || 0);
              const price = Number(item.price || 0);
              return {
                id: item.product_id || item.id,
                name: item.product_name || item.name || 'Item',
                image: item.product_image || item.image || '/logo.png',
                category: item.category || '',
                uom: item.uom || 'pcs',
                stock: Number(item.stock || quantity || 1),
                quantity: quantity > 0 ? quantity : 1,
                price: price > 0 ? price : 0
              };
            })
            .filter((item) => item.id && item.price >= 0 && item.quantity > 0);

          if (cartItems.length > 0) {
            localStorage.setItem('barman_cart', JSON.stringify(cartItems));
          }
        } catch (retryError) {
          console.error('Retry order load failed:', retryError);
        }
      }

      if (cartItems.length === 0) {
        // Get cart
        const savedCart = localStorage.getItem('barman_cart');
        if (!savedCart) {
          navigate('/cart');
          return;
        }

        cartItems = JSON.parse(savedCart);
      }

      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        navigate('/products');
        return;
      }

      setCart(cartItems);
      
      // Check for logged in user
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setIsLoggedIn(true);
        setIsAdmin(userData.role === 'admin');
        
        // Check if admin wants to place order for customer
        if (userData.role === 'admin' && searchParams.get('admin') === 'true') {
          setAdminMode(true);
        } else {
          // Validate customer profile
          await validateCustomerProfile(userData.id);
        }
      }
      
      // Save session ID
      localStorage.setItem('checkout_session', sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateCustomerProfile = async (userId) => {
    try {
      const validation = await customersApi.validateForOrder(userId);
      
      if (!validation.valid) {
        setProfileValidation(validation);
        setProfileIncomplete(true);
        
        // Auto-populate form with existing data
        if (validation.profile) {
          setFormData(prev => ({
            ...prev,
            customer_name: validation.profile.name || '',
            customer_email: validation.profile.email || '',
            customer_phone: validation.profile.phone || '',
            ...(validation.profile.address || {})
          }));
        }
      } else if (validation.profile) {
        // Auto-populate form with customer info
        setFormData(prev => ({
          ...prev,
          customer_name: validation.profile.name || '',
          customer_email: validation.profile.email || '',
          customer_phone: validation.profile.phone || '',
          ...(validation.profile.address || {})
        }));
      }
    } catch (err) {
      console.error('Profile validation error:', err);
    }
  };

  const searchCustomers = async () => {
    try {
      const results = await customersApi.search(customerSearch);
      setCustomerSearchResults(results);
      setShowCustomerDropdown(true);
    } catch (err) {
      console.error('Customer search error:', err);
    }
  };

  const selectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
    
    // Load customer profile
    try {
      const profile = await customersApi.getProfile(customer.id);
      setFormData({
        customer_name: profile.name || '',
        customer_email: profile.email || '',
        customer_phone: profile.phone || '',
        ...(profile.address || {})
      });
      
      if (!profile.profileComplete.complete) {
        setProfileValidation(profile.profileComplete);
        setProfileIncomplete(true);
      } else {
        setProfileIncomplete(false);
        setProfileValidation(null);
      }
    } catch (err) {
      console.error('Error loading customer profile:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear profile incomplete warning when user starts editing
    if (profileIncomplete) {
      setProfileIncomplete(false);
      setProfileValidation(null);
    }
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!isValidIndianPhone(formData.customer_phone)) {
        throw new Error(PHONE_POLICY_MESSAGE);
      }
      const orderData = {
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        customer_phone: normalizeIndianPhone(formData.customer_phone),
        shipping_address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country
        },
        payment_method: paymentMethod,
        payment_data: null,
        is_admin_order: adminMode,
        selected_customer_id: selectedCustomer?.id || user?.id
      };

      const result = await ordersApi.createValidated(orderData);
      
      setOrderResult(result);
      setSuccess(true);
      localStorage.removeItem('barman_cart');
      localStorage.removeItem('checkout_session');
      
    } catch (err) {
      setError(err.message);
      
      // Check if profile is incomplete
      if (err.message.includes('PROFILE_INCOMPLETE') || err.message.includes('INCOMPLETE_PROFILE')) {
        setProfileIncomplete(true);
        setError('Please complete your profile information before placing an order.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchToProfile = () => {
    navigate('/profile');
  };

  if (loading) {
    return (
      <div className="checkout-page">
        <div className="loading-container">
          <Package size={40} className="spinning" />
          <p>Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (success && orderResult) {
    return (
      <div className="checkout-page">
        <div className="order-success fade-in-up">
          <div className="success-icon">
            <CheckCircle size={100} />
          </div>
          <h1>Order Placed Successfully!</h1>
          <p className="order-number">Order #{orderResult.orderNumber}</p>
          <p className="success-message">
            Thank you for your purchase! A confirmation email has been sent to {formData.customer_email}
          </p>
          <div className="order-details">
            <p>Total Amount: <strong>{formatCurrency(orderResult.totalAmount)}</strong></p>
          </div>
          <button className="back-home-btn" onClick={() => navigate('/products')}>
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-header fade-in-up">
        <h1>Checkout</h1>
        <p>{isLoggedIn ? `Welcome, ${user?.name || 'Customer'}` : 'Guest Checkout'}</p>
        
        {/* Admin Mode Toggle */}
        {isAdmin && (
          <div className="admin-mode-toggle">
            <button 
              className={`toggle-btn ${adminMode ? 'active' : ''}`}
              onClick={() => setAdminMode(!adminMode)}
            >
              <Shield size={16} />
              {adminMode ? 'Admin: Select Customer' : 'Switch to Admin Mode'}
            </button>
          </div>
        )}
      </div>

      {/* Profile Incomplete Warning */}
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
        {/* Checkout Form */}
        <div className="checkout-form-container slide-in-left">
          <form onSubmit={handleSubmit} className="checkout-form">
            
            {/* Admin Customer Selection */}
            {adminMode && (
              <div className="form-section">
                <h2><Search size={20} /> Select Customer</h2>
                <div className="customer-search-container">
                  <input
                    type="text"
                    placeholder="Search customers by name, email, or phone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="customer-search-input"
                  />
                  {showCustomerDropdown && customerSearchResults.length > 0 && (
                    <div className="customer-dropdown">
                      {customerSearchResults.map(customer => (
                        <div 
                          key={customer.id}
                          className="customer-option"
                          onClick={() => selectCustomer(customer)}
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

            {/* Customer Information */}
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
                  />
                </div>
              </div>
            </div>

            {/* Shipping Address */}
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
                />
              </div>
            </div>

            {/* Payment Information */}
            <div className="form-section">
              <h2><CreditCard size={20} /> Payment Method</h2>
              <p className="payment-note">
                <CreditCard size={16} />
                Choose cash payment or use store credit.
              </p>
              
              <div className="payment-methods">
                <label className="payment-option">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span>Cash</span>
                </label>
                <label className="payment-option">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="credit"
                    checked={paymentMethod === 'credit'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span>Store Credit</span>
                </label>
              </div>
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

        {/* Order Summary */}
        <div className="order-summary slide-in-right">
          <h2>Order Summary</h2>
          <div className="order-items">
            {cart.map(item => (
              <div key={item.id} className="summary-item">
                <div className="summary-item-image">
                  <img src={item.image} alt={item.name} />
                </div>
                <div className="summary-item-details">
                  <h4>{item.name}</h4>
                  <p>Qty: {item.quantity}</p>
                </div>
                <div className="summary-item-price">
                  {formatCurrency(item.price * item.quantity)}
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
        </div>
      </div>
    </div>
  );
}

export default Checkout;
