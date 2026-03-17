import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const Home = lazy(() => import('../features/storefront/Home'));
const Products = lazy(() => import('../features/catalog/products/Products'));
const Cart = lazy(() => import('../features/cart/Cart'));
const Checkout = lazy(() => import('../features/checkout/Checkout'));
const Login = lazy(() => import('../features/auth/Login'));
const Admin = lazy(() => import('../features/admin/Admin'));
const CreditHistory = lazy(() => import('../features/credits/history/CreditHistory'));
const OrderHistory = lazy(() => import('../features/orders/OrderHistory'));
const OrderTracking = lazy(() => import('../features/orders/OrderTracking'));
const OrderDetails = lazy(() => import('../features/orders/OrderDetails'));
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
  const {
    notifications,
    unreadNotificationCount,
    onResolveNotificationHref,
    onMarkNotificationRead,
  } = notificationProps || {};

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/products" element={<Products setCartCount={setCartCount} />} />
      <Route path="/cart" element={<Cart cartCount={cartCount} setCartCount={setCartCount} />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/login" element={<Login setUser={setUser} />} />
      <Route path="/admin" element={<Admin user={user} />} />
      <Route path="/admin/users/:userId/credit" element={<CreditHistory user={user} />} />
      <Route path="/my-credit" element={<CreditHistory user={user} />} />
      <Route path="/order-history" element={<OrderHistory />} />
      <Route path="/my-orders" element={<Navigate to="/order-history" replace />} />
      <Route path="/orders/:id" element={<OrderDetails />} />
      <Route path="/order-tracking" element={<OrderTracking />} />
      <Route path="/order-tracking/:orderId" element={<OrderTracking />} />
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
