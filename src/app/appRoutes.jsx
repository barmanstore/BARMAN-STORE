import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_DEFAULT_TAB, getAdminTabHref, normalizeAdminTab } from '../features/admin/config/adminSidebarConfig';

const Home = lazy(() => import('../features/storefront/Home'));
const ProductsPage = lazy(() => import('../features/catalog/products/pages/ProductsPage'));
const Cart = lazy(() => import('../features/cart/Cart'));
const Checkout = lazy(() => import('../features/checkout/Checkout'));
const Login = lazy(() => import('../features/auth/Login'));
const AdminPage = lazy(() => import('../features/admin/pages/AdminPage'));
const BillingPopupPage = lazy(() => import('../features/sales/billing/pages/BillingPopupPage'));
const PurchasePopupPage = lazy(() => import('../features/commerce/purchase/pages/PurchasePopupPage'));
const CreditHistory = lazy(() => import('../features/credits/history/CreditHistory'));
const OrderHistoryPage = lazy(() => import('../features/orders/pages/OrderHistoryPage'));
const OrderTrackingPage = lazy(() => import('../features/orders/pages/OrderTrackingPage'));
const OrderDetailsPage = lazy(() => import('../features/orders/pages/OrderDetailsPage'));
const Profile = lazy(() => import('../features/auth/Profile'));
const MyBills = lazy(() => import('../features/sales/billing/MyBills'));
const ProductRecommendations = lazy(() => import('../features/storefront/ProductRecommendations'));
const StoreInfo = lazy(() => import('../features/storefront/StoreInfo'));
const StorePage = lazy(() => import('../features/storefront/StorePage'));

export const AppRoutes = ({
  cartCount,
  setCartCount,
  setUser,
  user,
  notificationProps,
}) => {
  const location = useLocation();
  const {
    notifications,
    unreadNotificationCount,
    onResolveNotificationHref,
    onMarkNotificationRead,
  } = notificationProps || {};
  const adminRedirectTarget = (() => {
    const next = new URLSearchParams(location.search || '');
    const nextTab = normalizeAdminTab(next.get('tab') || ADMIN_DEFAULT_TAB);
    next.delete('tab');
    const nextSearch = next.toString();
    return `${getAdminTabHref(nextTab)}${nextSearch ? `?${nextSearch}` : ''}`;
  })();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/products" element={<ProductsPage setCartCount={setCartCount} />} />
      <Route path="/cart" element={<Cart cartCount={cartCount} setCartCount={setCartCount} />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/login" element={<Login setUser={setUser} />} />
      <Route path="/admin" element={<Navigate to={adminRedirectTarget} replace />} />
      <Route path="/popup/billing" element={<BillingPopupPage user={user} />} />
      <Route path="/popup/purchase" element={<PurchasePopupPage user={user} />} />
      <Route path="/admin/users/:userId/credit" element={<CreditHistory user={user} />} />
      <Route path="/admin/:tab" element={<AdminPage user={user} />} />
      <Route path="/my-credit" element={<CreditHistory user={user} />} />
      <Route path="/order-history" element={<OrderHistoryPage />} />
      <Route path="/my-orders" element={<Navigate to="/order-history" replace />} />
      <Route path="/orders/:id" element={<OrderDetailsPage />} />
      <Route path="/order-tracking" element={<OrderTrackingPage />} />
      <Route path="/order-tracking/:orderId" element={<OrderTrackingPage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/my-bills" element={<MyBills />} />
      <Route path="/product-requests" element={<ProductRecommendations />} />
      <Route path="/store-info" element={<StoreInfo />} />
      <Route
        path="/store"
        element={(
          <StorePage
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            onResolveNotificationHref={onResolveNotificationHref}
            onMarkNotificationRead={onMarkNotificationRead}
          />
        )}
      />
    </Routes>
  );
};
