import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../providers/CartProvider';
import { useSession } from '../../providers/SessionProvider';
import { ordersApi, customersApi, creditApi } from '../../shared/services/api';
import {
  isValidIndianPhone,
  normalizeIndianPhone,
  PHONE_POLICY_MESSAGE,
} from '../../shared/utils/phone';
import { LOGO_URL } from '../../shared/info';
import useOfferPricingPreview from '../../shared/hooks/useOfferPricingPreview';
import { getPreviewLineMap } from '../../shared/utils/offers';
import formatApiError from '../../shared/utils/formatApiError';
import CheckoutView from './components/CheckoutView';
import './Checkout.css';

// Generate session ID for guest users
const generateSessionId = () => {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

const getStoreLogoPath = () => {
  const base = String(import.meta.env.BASE_URL || '/');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = String(LOGO_URL || 'logo.png').replace(/^\/+/, '');
  return `${normalizedBase}${cleanFile}`;
};

function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { cart: storedCart, replaceCart, clearCart } = useCart();
  const { user, isLoggedIn, isAdminUser } = useSession();
  const [cart, setCart] = useState(() => (Array.isArray(storedCart) ? storedCart : []));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [creditBalance, setCreditBalance] = useState(null);
  const [creditBalanceLoading, setCreditBalanceLoading] = useState(false);

  // User state
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

  const sessionId =
    searchParams.get('session_id') ||
    localStorage.getItem('checkout_session') ||
    generateSessionId();

  useEffect(() => {
    if (!success || !orderResult) return;
    const targetUserId = Number((adminMode ? selectedCustomer?.id : user?.id) || 0);
    if (!targetUserId) return;
    let cancelled = false;
    const loadBalance = async () => {
      try {
        setCreditBalanceLoading(true);
        const payload = await creditApi.getBalance(targetUserId);
        if (cancelled) return;
        setCreditBalance(Number(payload?.balance || 0));
      } catch (_) {
        if (cancelled) return;
        setCreditBalance(null);
      } finally {
        if (!cancelled) setCreditBalanceLoading(false);
      }
    };
    loadBalance();
    return () => {
      cancelled = true;
    };
  }, [success, orderResult, adminMode, selectedCustomer, user]);

  async function initializeCheckout() {
    try {
      const retryOrderId = searchParams.get('retry');
      let cartItems = [];

      if (retryOrderId) {
        try {
          const retryOrder = await ordersApi.getById(retryOrderId);
          const retryItems = Array.isArray(retryOrder?.items) ? retryOrder.items : [];
          cartItems = retryItems
            .map((item, index) => {
              const quantity = Number(item.quantity || 0);
              const price = Number(item.price || 0);
              const parsedProductId = Number(item.product_id || item.id || 0);
              const manual = Number(item.is_manual || 0) === 1 || !parsedProductId;
              const quantityLabelRaw = String(item.quantity_label || item.qty_text || '').trim();
              return {
                id: manual ? item.id || `manual:retry:${index}` : parsedProductId,
                product_id: manual ? null : parsedProductId,
                name: item.product_name || item.name || 'Item',
                image: item.product_image || item.image || getStoreLogoPath(),
                category: item.category || '',
                uom: item.uom || 'pcs',
                stock: manual ? null : Number(item.stock || quantity || 1),
                quantity: quantity > 0 ? quantity : 1,
                quantity_label: quantityLabelRaw || String(quantity > 0 ? quantity : 1),
                price: price > 0 ? price : 0,
                item_type: manual ? 'manual' : 'catalog',
                is_manual: manual ? 1 : 0,
                price_unknown: manual && price <= 0 ? 1 : 0,
              };
            })
            .filter((item) => item.id && item.price >= 0 && item.quantity > 0);

          if (cartItems.length > 0) {
            replaceCart(cartItems);
          }
        } catch (retryError) {
          console.error('Retry order load failed:', retryError);
        }
      }

      if (cartItems.length === 0) {
        // Get cart
        if (!Array.isArray(storedCart) || storedCart.length === 0) {
          navigate('/cart');
          return;
        }
        cartItems = storedCart;
      }

      const normalizedCartItems = (Array.isArray(cartItems) ? cartItems : [])
        .map((item, index) => {
          const parsedProductId = Number(item?.product_id || item?.id || 0);
          const manual =
            Number(item?.is_manual || 0) === 1 ||
            String(item?.item_type || '')
              .trim()
              .toLowerCase() === 'manual' ||
            !parsedProductId;
          const quantity = Math.max(1, Number(item?.quantity || 1));
          const quantityLabelRaw = String(
            item?.quantity_label || item?.qty_text || item?.quantity_text || ''
          ).trim();
          const price = Math.max(0, Number(item?.price || 0));
          return {
            ...item,
            id: item?.id || (manual ? `manual:checkout:${index}` : parsedProductId),
            product_id: manual ? null : parsedProductId,
            name: String(item?.name || item?.product_name || 'Item').trim() || 'Item',
            quantity,
            quantity_label: quantityLabelRaw || String(quantity),
            price,
            stock: manual ? null : Math.max(1, Number(item?.stock || 1)),
            item_type: manual ? 'manual' : 'catalog',
            is_manual: manual ? 1 : 0,
            price_unknown: manual ? Number(item?.price_unknown || (price <= 0 ? 1 : 0)) : 0,
          };
        })
        .filter((item) => item.id && item.quantity > 0);

      if (!normalizedCartItems.length) {
        navigate('/products');
        return;
      }

      setCart(normalizedCartItems);

      // Check for logged in user
      if (!user?.id) {
        navigate('/login');
        return;
      }
      setIsAdmin(isAdminUser);

      // Check if admin wants to place order for customer
      if (isAdminUser && searchParams.get('admin') === 'true') {
        setAdminMode(true);
      } else {
        // Validate customer profile
        await validateCustomerProfile(user.id);
      }

      // Save session ID
      localStorage.setItem('checkout_session', sessionId);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  const validateCustomerProfile = async (userId) => {
    try {
      const validation = await customersApi.validateForOrder(userId);

      if (!validation.valid) {
        setProfileValidation(validation);
        setProfileIncomplete(true);

        // Auto-populate form with existing data
        if (validation.profile) {
          setFormData((prev) => ({
            ...prev,
            customer_name: validation.profile.name || '',
            customer_email: validation.profile.email || '',
            customer_phone: validation.profile.phone || '',
            ...(validation.profile.address || {}),
          }));
        }
      } else if (validation.profile) {
        // Auto-populate form with customer info
        setFormData((prev) => ({
          ...prev,
          customer_name: validation.profile.name || '',
          customer_email: validation.profile.email || '',
          customer_phone: validation.profile.phone || '',
          ...(validation.profile.address || {}),
        }));
      }
    } catch (err) {
      console.error('Profile validation error:', err);
    }
  };

  async function searchCustomers() {
    try {
      const results = await customersApi.search(customerSearch);
      setCustomerSearchResults(results);
      setShowCustomerDropdown(true);
    } catch (err) {
      console.error('Customer search error:', err);
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initializeCheckout();
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    if (adminMode && customerSearch.length >= 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      searchCustomers();
    }
  }, [adminMode, customerSearch]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

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
        ...(profile.address || {}),
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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear profile incomplete warning when user starts editing
    if (profileIncomplete) {
      setProfileIncomplete(false);
      setProfileValidation(null);
    }
  };

  const getTotal = () => {
    const previewTotal = Number(checkoutPricingPreview?.summary?.net_subtotal);
    if (Number.isFinite(previewTotal)) return previewTotal;
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getItemQuantityLabel = (item) => {
    const custom = String(item?.quantity_label || item?.qty_text || '').trim();
    if (custom) return custom;
    const qty = Number(item?.quantity || 1);
    return Number.isFinite(qty) && qty > 0 ? String(qty) : '1';
  };

  const isUnknownPriceItem = (item) => {
    const manual = Number(item?.is_manual || 0) === 1 || String(item?.item_type || '') === 'manual';
    return manual && (Number(item?.price_unknown || 0) === 1 || Number(item?.price || 0) <= 0);
  };
  const checkoutPricingItems = useMemo(
    () =>
      cart.map((item) => ({
        client_item_id: String(item?.id ?? item?.product_id ?? ''),
        product_id: Number(item?.product_id || item?.id || 0) || null,
        product_name: String(item?.name || item?.product_name || '').trim(),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        unit: String(item?.uom || item?.unit || 'pcs').trim() || 'pcs',
        item_type: Number(item?.is_manual || 0) === 1 ? 'manual' : 'catalog',
        unit_price_override:
          Number(item?.is_manual || 0) === 1 ? Math.max(0, Number(item?.price || 0)) : undefined,
        skip_offers: Number(item?.is_manual || 0) === 1,
        price_unknown: isUnknownPriceItem(item) ? 1 : 0,
      })),
    [cart]
  );
  const {
    preview: checkoutPricingPreview,
    loading: checkoutPricingLoading,
    error: checkoutPricingError,
  } = useOfferPricingPreview({
    items: checkoutPricingItems,
    context: 'checkout',
    offerContext: {
      customer_user_id: Number(selectedCustomer?.id || user?.id || 0) || null,
    },
    enabled: cart.length > 0,
  });
  const checkoutPricingLineMap = useMemo(
    () => getPreviewLineMap(checkoutPricingPreview),
    [checkoutPricingPreview]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!isValidIndianPhone(formData.customer_phone)) {
        throw new Error(PHONE_POLICY_MESSAGE);
      }
      const orderData = {
        items: cart.map((item) => ({
          product_id:
            Number(item?.is_manual || 0) === 1 ? null : Number(item.product_id || item.id || 0),
          product_name: (() => {
            const baseName = String(item.name || 'Item').trim() || 'Item';
            const quantityLabel = getItemQuantityLabel(item);
            if (Number(item?.is_manual || 0) === 1 && quantityLabel) {
              return `${baseName} [Qty: ${quantityLabel}]`;
            }
            return baseName;
          })(),
          quantity: Math.max(1, Number(item.quantity || 1)),
          uom:
            String(item?.uom || '')
              .trim()
              .toLowerCase() || 'pcs',
          quantity_label: getItemQuantityLabel(item),
          price: Math.max(0, Number(item.price || 0)),
          price_unknown: isUnknownPriceItem(item) ? 1 : 0,
          is_manual: Number(item?.is_manual || 0) === 1 ? 1 : 0,
          item_type: Number(item?.is_manual || 0) === 1 ? 'manual' : 'catalog',
        })),
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        customer_phone: normalizeIndianPhone(formData.customer_phone),
        shipping_address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country,
        },
        payment_method: 'cash',
        payment_data: null,
        is_admin_order: adminMode,
        selected_customer_id: selectedCustomer?.id || user?.id,
      };

      const result = await ordersApi.createValidated(orderData);

      setOrderResult(result);
      setSuccess(true);
      clearCart();
      localStorage.removeItem('checkout_session');
    } catch (err) {
      setError(formatApiError(err));

      // Check if profile is incomplete
      const rawMessage = String(err?.message || err?.payload?.error || '');
      if (rawMessage.includes('PROFILE_INCOMPLETE') || rawMessage.includes('INCOMPLETE_PROFILE')) {
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

  return (
    <CheckoutView
      loading={loading}
      success={success}
      orderResult={orderResult}
      creditBalance={creditBalance}
      creditBalanceLoading={creditBalanceLoading}
      onContinueShopping={() => navigate('/products')}
      isLoggedIn={isLoggedIn}
      user={user}
      isAdmin={isAdmin}
      adminMode={adminMode}
      onToggleAdminMode={() => setAdminMode(!adminMode)}
      profileIncomplete={profileIncomplete}
      profileValidation={profileValidation}
      error={error}
      switchToProfile={switchToProfile}
      adminCustomerSearch={customerSearch}
      onAdminCustomerSearchChange={(e) => setCustomerSearch(e.target.value)}
      showCustomerDropdown={showCustomerDropdown}
      customerSearchResults={customerSearchResults}
      onSelectCustomer={selectCustomer}
      formData={formData}
      handleInputChange={handleInputChange}
      handleSubmit={handleSubmit}
      submitting={submitting}
      getTotal={getTotal}
      cart={cart}
      pricingPreview={checkoutPricingPreview}
      pricingPreviewLoading={checkoutPricingLoading}
      pricingPreviewError={checkoutPricingError}
      pricingLineMap={checkoutPricingLineMap}
      getItemQuantityLabel={getItemQuantityLabel}
      isUnknownPriceItem={isUnknownPriceItem}
    />
  );
}

export default Checkout;
